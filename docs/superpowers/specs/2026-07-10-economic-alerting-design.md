# Observability — Economic / On-Chain Alerting (design)

**Date:** 2026-07-10
**Status:** Approved design, pending implementation plan
**Scope:** Off-app scheduled chain-reader + Discord notification. No contract
change, no frontend-runtime change. Phase 2 of the observability track (phase 1
= product funnel metrics, see `2026-07-08-observability-funnel-design.md` §14,
which names this as the designated phase 2).

---

## 1. Problem

The contract holds real STX. Its prize-pool lifecycle needs **manual owner
action at two points** and a permissionless nudge at two more — and nobody is
watching for them:

- A season past its `season-end-block` should be **ended** (`end-season`).
  Until it is, players cannot claim last season's prize. `end-season` is
  permissionless once the deadline passes, but only if *someone notices*.
- A closed season past its `claim-deadline` with unclaimed money should be
  **finalized** (`finalize-season`) to roll the dust/unclaimed back into the
  next season. Forget it and the money sits idle (not lost, but stuck).
- Players sitting on **unclaimed prizes** as the claim window closes get no
  reminder.

`production-health.mjs` reads chain state well but only asserts *liveness*
(reads succeed, values sane). It answers "is the contract up?", never "is there
an economic action overdue?". This phase adds that missing watcher.

## 2. Goals

- Detect four economic-lifecycle conditions per game from **read-only** chain
  state, on a daily schedule.
- Deliver actionable alerts to **Discord** so the owner acts (or players are
  reminded) before money gets stuck.
- Keep all decision logic in a **pure, unit-tested** module; the runner does I/O
  only.
- Ship independently of phase-1 deploy (no Upstash / Redis dependency).
- Never let a webhook or chain-read failure go silent — surface it in the
  workflow run.

## 3. Non-Goals (YAGNI / deferred)

- **Solvency check** (contract STX balance ≥ sum of open accumulated + unclaimed
  closed prizes across all games). Precise but heavier to compute correctly;
  deferred. The pure `computeAlerts` shape leaves room to add it later.
- **Redis-backed metrics-page banner** (Approach B in brainstorming). Surfacing
  alert state on `/admin/metrics` reuses the phase-1 Redis store and is a
  separate future add-on once Upstash is provisioned.
- **Dedup / state between runs.** GitHub Actions is stateless; a daily "still
  overdue" repeat is an acceptable reminder (see §9). Redis-backed dedup belongs
  with the Approach-B follow-up.
- **Non-Discord channels** (Slack/Telegram). Discord chosen; a different channel
  would only swap `formatDiscordMessage` + the POST shape.
- **Any contract change.** v4 already exposes every needed read-only function.

## 4. Alert catalog

Per game (ids 1–6), evaluated against the chain tip. `S` = current season.

| # | Code | Severity | Fires when | Suggested action |
|---|---|---|---|---|
| 1 | `season_overdue` | critical | `season-end-block > 0` AND `stacks_tip ≥ end-block` (season not yet rolled) | call `end-season(game)` |
| 2 | `season_ending_soon` | warning | `end-block > 0` AND `0 < end-block − stacks_tip ≤ SEASON_END_WARN_BLOCKS` | prepare to end / notify players |
| 3 | `finalize_overdue` | critical | closed season `s`: `season-prize` exists, `finalized = false`, `burn_tip > claim-deadline`, `total − paid > 0` | call `finalize-season(game, s)` |
| 4 | `claim_closing_soon` | warning | closed season `s`: `is-claim-open` true, `0 < claim-deadline − burn_tip ≤ CLAIM_WARN_BURN_BLOCKS`, `total − paid > 0` | remind players to claim |

Rules #1 and #3 are exact boolean comparisons — the high-value "money is
overdue/stuck" signals. Rules #2 and #4 are advance warnings.

**Closed-season scan range:** for #3/#4 only inspect `s ∈ [max(1, S−2), S−1]`.
Older seasons are already finalized; the range is bounded and cheap.

**Thresholds (defaults, env-overridable):**

- `SEASON_END_WARN_BLOCKS` — stacks blocks of lead time for #2. Post-Nakamoto
  stacks-block cadence is fast/variable, so this is a coarse advance notice;
  default `1000` and document that #1 (exact) is the reliable signal. Override
  via `SEASON_END_WARN_BLOCKS` env.
- `CLAIM_WARN_BURN_BLOCKS` — burn blocks of lead time for #4. Burn blocks track
  Bitcoin (~144/day; `CLAIM-WINDOW u4320 ≈ 30 days` confirms this), so this
  threshold is meaningful in wall-clock terms. Default ≈ 432 (~3 days). Override
  via `CLAIM_WARN_BURN_BLOCKS` env.

## 5. Architecture

```
GitHub Actions (schedule: daily 09:00 UTC + workflow_dispatch)
  └─ npm run alerts:economic
       = node --experimental-strip-types scripts/economic-alerts.ts
           ├─ read chain (per game): get-current-season, get-season-end-block,
           │    and for closed seasons in range: get-season-prize,
           │    get-season-finalized, get-season-paid
           ├─ GET {STACKS_API_URL}/v2/info → stacks_tip_height, burn_block_height
           ├─ build ChainSnapshot
           ├─ computeAlerts(snapshot, thresholds)      ← lib/economic-alerts.ts (pure)
           └─ alerts.length > 0
                ? POST ALERT_WEBHOOK_URL  formatDiscordMessage(alerts)
                : no-op
```

Node 22 (already used by the health workflow) runs the `.ts` runner directly via
`--experimental-strip-types`, so the runner can import the pure `.ts` lib with no
build step and no new dependency (`tsx` not required — verified on Node 22.16).

## 6. Components

### 6.1 `frontend/lib/economic-alerts.ts` — pure core (1-1 test)
Types:
```ts
type Severity = "critical" | "warning";
type Alert = { severity: Severity; code: string; game: string; message: string };

type ClosedSeason = {
  season: number;
  total: number;      // uSTX
  paid: number;       // uSTX
  finalized: boolean;
  claimDeadline: number; // burn block height
};
type GameState = {
  game: string;          // GAME slug (snake, tetris, …)
  currentSeason: number;
  seasonEndBlock: number; // 0 = unset / owner-only
  closedSeasons: ClosedSeason[]; // scan range only
};
type ChainSnapshot = {
  stacksTip: number;
  burnTip: number;
  games: GameState[];
};
type Thresholds = { seasonEndWarnBlocks: number; claimWarnBurnBlocks: number };
```
Functions:
- `computeAlerts(snapshot: ChainSnapshot, thresholds: Thresholds): Alert[]` —
  implements rules #1–#4; deterministic, no I/O.
- `formatDiscordMessage(alerts: Alert[]): { content: string }` — groups by
  severity, Win95-flavored plain text, contains **no principals or txids** (game
  slug + uSTX amounts + block heights only). Discord `content` max 2000 chars;
  the catalog is tiny (≤ ~24 possible lines) so no truncation logic needed, but
  keep lines terse.

No message is produced for an empty `alerts` array — the runner simply skips the
POST.

### 6.2 `frontend/scripts/economic-alerts.ts` — I/O runner
- Mirrors `production-health.mjs`'s `@stacks/transactions` read helper
  (`fetchCallReadOnlyFunction` + `cvToValue`, `AbortSignal.timeout`, mainnet,
  `STACKS_API_URL` override defaulting to `https://api.hiro.so`).
- Constants: contract `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4`,
  the 6 games (reuse the id/slug list; align slug with the funnel spec — note
  the health script uses `bricks` while the funnel uses `breakout`; **this
  script's slug is display-only in the Discord message, so pick one and document
  it** — use `breakout` to match `GAME_IDS`).
- Reads per game as in §5; fetches `/v2/info`.
- Builds `ChainSnapshot`, calls `computeAlerts`.
- Delivery:
  - `alerts.length === 0` → log "no economic alerts", exit 0.
  - `alerts.length > 0` AND `ALERT_WEBHOOK_URL` set → POST
    `{ content }`; non-2xx response → log + exit 1.
  - `alerts.length > 0` AND no `ALERT_WEBHOOK_URL` → print the message to stdout
    (visible in the workflow log) and exit 0 (safe no-op, mirrors phase-1
    "ship before the channel is configured").
- Unexpected errors (chain read / `/v2/info` failure) → `console.error` + exit 1,
  so the workflow run goes red (same contract as `production-health.mjs`).

### 6.3 `frontend/lib/economic-alerts.test.ts` — Vitest
- #1 fires when `end-block>0 && tip≥end`; silent when `end-block=0` or `tip<end`.
- #2 fires only inside `SEASON_END_WARN_BLOCKS`; silent past it / when overdue
  (overdue is #1's job).
- #3 fires for closed season past `claim-deadline`, `finalized=false`,
  `total−paid>0`; silent when finalized, when `total−paid=0`, or still in window.
- #4 fires when claim open, within `CLAIM_WARN_BURN_BLOCKS`, money remaining;
  silent when finalized / no money / outside threshold.
- Multiple games / multiple closed seasons aggregate correctly.
- `formatDiscordMessage` groups critical-before-warning and its output contains
  no `SP…`/`ST…` principal or `0x…` txid substrings.
- Empty input → `computeAlerts` returns `[]`.

### 6.4 `.github/workflows/economic-alerts.yml`
- `on: { schedule: [{ cron: "0 9 * * *" }], workflow_dispatch: {} }`.
- `permissions: { contents: read }`.
- Job: `runs-on: ubuntu-latest`, `working-directory: frontend`, checkout, setup
  node 22 (npm cache on `frontend/package-lock.json`), `npm ci`,
  `run: npm run alerts:economic`.
- `env: { ALERT_WEBHOOK_URL: ${{ secrets.ALERT_WEBHOOK_URL }} }` (and optional
  `STACKS_API_URL`, `SEASON_END_WARN_BLOCKS`, `CLAIM_WARN_BURN_BLOCKS`).

### 6.5 `frontend/package.json`
- Add `"alerts:economic": "node --experimental-strip-types scripts/economic-alerts.ts"`.

## 7. Data flow

Read-only calls evaluate at the chain tip, so on-chain `stacks-block-height` /
`burn-block-height` inside the contract already reflect "now". The runner still
fetches `/v2/info` because the *deltas* in rules #2/#4 (`end-block − tip`,
`claim-deadline − burn-tip`) need the current heights on the client side — no
read-only function returns "blocks remaining".

## 8. Error handling

- Chain read or `/v2/info` failure → runner exits 1 (workflow red). No partial
  Discord post on a failed read.
- Discord POST non-2xx → exit 1 (workflow red) so a broken webhook is noticed.
- Missing `ALERT_WEBHOOK_URL` → print to log, exit 0 (intentional no-op; lets the
  workflow be merged and observed before the secret is set).
- `computeAlerts` is total and side-effect-free; it cannot throw on well-formed
  snapshots (guard against divide-by-zero / negative deltas explicitly).

## 9. Noise / cadence

No cross-run state. The workflow posts **only when ≥1 alert exists**, once per
day. An unresolved critical (e.g. finalize overdue) re-posts daily until acted
on — treated as a feature (a daily nudge for stuck money), not a bug. If daily
repetition becomes annoying, the Approach-B follow-up (Redis-backed dedup +
metrics-page banner) is the place to add "alert only on state change".

## 10. Environment / setup (user action required)

- Create a **Discord Incoming Webhook** (Server Settings → Integrations →
  Webhooks → New Webhook → Copy URL) for the target channel.
- Add it as GitHub repo secret **`ALERT_WEBHOOK_URL`**
  (Settings → Secrets and variables → Actions).
- No Vercel env, no Upstash, no new npm dependency required.
- Optional secrets/vars: `STACKS_API_URL`, `SEASON_END_WARN_BLOCKS`,
  `CLAIM_WARN_BURN_BLOCKS`.

## 11. Rollout

1. Land the pure lib + runner + workflow + test. Safe to merge before the secret
   exists (no webhook → the run prints to log and stays green).
2. `workflow_dispatch` a manual run to eyeball the computed alerts in the log.
3. Add the `ALERT_WEBHOOK_URL` secret; re-run → alerts flow to Discord.
4. Daily cron watches the economic lifecycle from then on.

## 12. Future phases (out of scope, noted for continuity)

- **Solvency invariant** alert (contract balance vs. obligations).
- **Approach B**: Redis-backed dedup (alert only on change) + an alerts banner on
  `/admin/metrics`, once Upstash is provisioned (phase-1 §12).
- Additional channels (Slack/Telegram) via a swappable formatter.
