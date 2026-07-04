# Unclaimed Prize Notification — Design

**Date:** 2026-07-04
**Status:** Approved
**Scope:** Frontend only. No contract changes; `xp-arcade-v4` stays untouched.

## Problem

All six games have closed season 1 with 20.11 STX sitting in open claim
windows, and zero claims have been made. Claim discovery currently lives only
inside the High Scores window, per game tab — a player must already know they
won and go looking. The platform's core promise ("play, win real STX") never
demonstrates itself unless winners are told they won.

## Goal

When a connected wallet has unclaimed prizes in any closed season of any game,
tell the player proactively and lead them to the claim button. Success = a
top-10 player who opens the desktop sees, within seconds, that they have STX
waiting and can reach the claim flow in one click.

## Decisions (user-approved)

- **Surfaces:** Win95 balloon (via the existing retention-nudge system)
  **plus** a persistent system-tray badge. Balloon grabs attention once per
  day; badge stays until the prizes are claimed.
- **Aggregation:** one balloon summarizing all games ("You have 1.25 STX
  waiting across 3 games"), CTA opens High Scores at the tab of the largest
  unclaimed prize. No per-game balloon series.
- **Frequency:** balloon at most once per day (existing `markNudgeShown`
  mechanism); badge is persistent and reactive.

## Architecture

One new Zustand store is the single source of truth; both surfaces read it.

### 1. Data layer — `frontend/state/unclaimed-prizes.ts` (new)

```ts
type UnclaimedPrize = { gameId: GameId; season: number; amountUstx: number };
type S = {
  status: "idle" | "loading" | "done" | "error";
  scannedFor: string | null;       // address the current result belongs to
  claims: UnclaimedPrize[];        // claimOpen === true only
  totalUstx: number;
  topGame: GameId | null;          // game with the largest single prize
  scan: (address: string) => Promise<void>;
  refresh: () => Promise<void>;    // re-scan for scannedFor (post-claim)
  reset: () => void;               // wallet disconnect
};
```

- `scan(address)`:
  1. `fetchLeaderboardSnapshot()` (existing `/api/leaderboard`, 30 s server
     cache + 30 s client TTL + in-flight dedupe) → `currentSeason` per game.
  2. `findClaimablePrizes(gameId, address, currentSeason)` (existing, already
     per-call fault-isolated) for all six games in parallel.
  3. Keep only claims with `claimOpen === true`; store list, `totalUstx`,
     `topGame`.
- Re-scan when the connected address changes; `reset()` on disconnect.
- Concurrent `scan` calls for the same address are deduped (single in-flight
  promise), mirroring the snapshot-cache pattern.

**Targeted improvement in scope:** wrap `getSeasonPrizeForGame` and
`isClaimOpen` in `cachedRead` (they are the only claim-path reads in
`lib/contract-calls.ts` still unwrapped; same fix pattern as the recent
connected-stats change). This keeps the six-game sweep cheap and 429-safe.

### 2. Balloon — new nudge kind in the retention system

- `lib/retention-nudge.ts`: add `"prize-unclaimed"` to `NudgeKind`; new
  `prizeUnclaimedCandidate(signals)` returning:
  - icon `💰`, title `Unclaimed prize!`
  - body `You have <X.XX> STX waiting across <N> game(s). Claim before the
    window closes.` (singular form when N = 1 names the game instead:
    `You have 0.59 STX waiting in Minesweeper.`)
  - CTA `Claim now` → `{ window: "highscore", gameId: topGame }`
- Priority **0** — inserted ahead of `rank-drop` in `selectNudge`. Real money
  outranks every re-engagement nudge.
- `NudgeSignals` gains `unclaimed: { totalUstx: number; count: number;
  topGame: GameId } | null`.
- `lib/collect-nudge-signals.ts`: accept a `fetchUnclaimed` dep (injected,
  like `fetchSnapshot`), populate `signals.unclaimed`. `RetentionBalloon`
  passes a thin adapter over the store's `scan` + state.
- Shown-once-per-day dedupe comes free from the existing
  `markNudgeShown` / `shownTodayMap` machinery.

### 3. Tray badge — `frontend/components/desktop/PrizeTrayBadge.tsx` (new)

- Rendered inside `SystemTray`, next to the clock, Win95-styled (98.css
  conventions, matches existing tray items).
- Visible iff `totalUstx > 0`. Content: `💰` icon; `title` tooltip
  `Unclaimed prizes: <X.XX> STX`.
- Click → `open("highscore", { initialTab: topGame })` via the
  window-manager store (same call the nudge CTA uses).
- Accessible: it is a `<button>` with an `aria-label`, ≥ tap-target size per
  the mobile a11y pass conventions.

### 4. Post-claim refresh

`HighScoreWindow` already classifies claim tx outcomes (`classifyClaimTx`).
On `"confirmed"`, additionally call `useUnclaimedPrizes.getState().refresh()`
so the badge count drops (or disappears) without a reload. The underlying
`cachedRead` entries (`claimed:*`, `claimable:*`) would otherwise stay warm
for their TTL and keep the badge alive; `lib/read-cache.ts` currently offers
only the global `clearReadCache()` test helper, so add a small
`invalidateReadCache(keyPrefix: string)` that deletes matching cache and
in-flight entries. `refresh()` invalidates the claimed/claimable prefixes for
the claimed game+season before re-scanning.

### 5. Mount point

The scan is driven by a small `useUnclaimedPrizeScan()` hook (watches wallet
address, calls `scan`/`reset`) mounted once via a new `<PrizeWatcher />`
component rendered in `app/page.tsx` as a sibling of `<LevelUpWatcher />`
(same pattern, separate concern). Badge lives in `SystemTray`; balloon logic
stays in `RetentionBalloon`.

## Error handling

- Scan failure (network, API) → `status: "error"`, empty result: no badge, no
  balloon, no console noise. Retried naturally on next address change /
  desktop load. Same silent posture as `RetentionBalloon`.
- Per-game read failures inside `findClaimablePrizes` already degrade to
  "no claim for that game" — one broken game never hides another game's prize.
- No wallet connected → store stays `idle`; nothing renders.

## Out of scope

- No changes to the claim transaction flow itself (post-conditions, watcher —
  already correct).
- No countdown/urgency escalation in v1 (the copy mentions the window closes;
  block-precise urgency can join the season-countdown work later).
- No push/email/off-desktop notification.
- No owner/admin surfaces.

## Testing

Vitest, colocated `*.test.ts(x)`, following existing patterns:

1. **Store** (`state/unclaimed-prizes.test.ts`): scan happy path (deps
   injected), claimOpen filtering, totals/topGame math, address-change
   re-scan, in-flight dedupe, error → empty, reset on disconnect.
2. **Nudge** (`lib/retention-nudge.test.ts` additions): candidate output for
   single vs multiple prizes, priority 0 beats rank-drop, once-per-day
   dedupe, no signal → no candidate.
3. **Signals** (`lib/collect-nudge-signals.test.ts` additions): injected
   `fetchUnclaimed` populates signals; failure yields `unclaimed: null`.
4. **Badge** (`components/desktop/PrizeTrayBadge.test.tsx`): hidden at zero,
   visible with amount tooltip, click opens highscore at topGame, a11y label.
5. **HighScoreWindow**: confirmed claim triggers store refresh (existing test
   file additions).

Gate: full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`
green before merge.
