# Observability — Product Funnel Metrics (design)

**Date:** 2026-07-08
**Status:** Approved design, pending implementation plan
**Scope:** Frontend-only. No contract change. Adds a persistent event-counting
pipeline + a public metrics page. Phase 1 of the broader observability track
(economic/on-chain alerting is a deliberately separate future phase — see
Non-Goals).

---

## 1. Problem

The product is live on mainnet with real mint fees flowing into per-season prize
pools, but there is **no way to see what happens at runtime**:

- Telemetry exists but **evaporates**: `/api/telemetry` only does
  `console.error(payload)` and returns 202. Events land in Vercel function logs
  with no storage, no aggregation, no counting. "How many mints failed today?"
  is unanswerable.
- Only **3 event types exist, all errors** (`wallet_connect_error`,
  `tx_confirmation_timeout`, `holdings_total_failure`). There are no
  attempt/success events, so **no funnel** can be computed — we cannot see how
  many players try to mint after playing, or where they drop off.
- `/api/health` is static (network + contractId only); `production-health.mjs`
  reads on-chain state well but is a manual liveness script, not a metrics
  collector.

The result: retention and product decisions (track #3) are being made blind.
This phase builds the missing **emit → store → aggregate → view** loop for the
core product funnels.

## 2. Goals

- Persist and **count** product-funnel events so per-event, per-game, per-day
  totals are queryable.
- Answer two "golden ratios":
  - **played → attempted-mint** (largest expected leak; measures intent to mint)
  - **attempted-mint → confirmed** (measures wallet/chain friction)
- Fold the 3 existing error events into the same store so error frequency is
  visible by day instead of by grepping logs.
- Surface it all on a simple Win95-styled `/admin/metrics` page.
- Never let telemetry break the app.

## 3. Non-Goals (YAGNI / future phases)

- **Economic / on-chain invariant alerting** (forgot to `end-season` /
  `finalize-season`, prize-pool anomalies, season-expiry warnings). This is a
  separate future phase; it reuses the same Redis store but needs a scheduled
  chain-reader + a notification channel. Out of scope here.
- **Charts / sparklines** on the metrics page. MVP is numbers + conversion %.
- **Events beyond the approved catalog** (`mint_dialog_shown`,
  `wallet_connected`, page views, session tracking). Add later only if a real
  question demands them.
- **Wallet-address or txid level data.** Counts only; privacy preserved.
- **Auth on the metrics page.** Decided public-read (§8). A password gate is a
  documented future toggle, not built now.

## 4. Event catalog

Each event is a counter tagged with **game** (one of the 6 known ids, or none)
and **UTC day**. Approved set:

**Money funnel (per game):**

| Event | Fired when | Measures |
|---|---|---|
| `game_over` | a play session ends with a score | plays (top of funnel) |
| `mint_attempted` | user clicks Mint → wallet prompt requested | intent to mint |
| `mint_confirmed` | mint tx confirmed on-chain | successful mints (revenue) |
| `mint_failed` | mint tx failed / rejected / timed out | wallet/chain drop-off |

**Claim funnel (lower volume, real money):**

| Event | Fired when |
|---|---|
| `claim_attempted` | user clicks Claim → wallet prompt |
| `claim_confirmed` | STX received (claim tx confirmed) |
| `claim_failed` | claim tx failed / rejected |

**Existing error events (folded into the same store):**
`wallet_connect_error`, `tx_confirmation_timeout`, `holdings_total_failure`.

Games (for the `game` dimension): the real `GameId` union from
`lib/game-registry.ts` — `snake`, `tetris`, `pacman`, `breakout`,
`minesweeper`, `solitaire` (note: the XP Bricks slug is `breakout`). Reuse
`GAME_IDS`; do not invent slugs.

## 5. Architecture

Reuses the existing telemetry pipeline (no parallel system) and repo
conventions: pure functions with 1-1 `*.test.ts`, thin I/O wrappers, Win95 UI.

```
Client (game / mint / claim UI)
   │  trackFunnel("mint_confirmed", { game: "snake" })
   │  reportClientError("wallet_connect_error", err)   // unchanged signature
   ▼
POST /api/telemetry            // extend existing route
   │  validate + redact + rate-limit  →  INCR counters (try/catch, never throws)
   ▼
Upstash Redis  (counters, daily keys carry TTL)
   ▲
   │  GET /api/metrics/summary?days=30   // server-only reads Redis
   ▼
/admin/metrics                 // Win95 page: funnels + conversion %
```

**Invariant: telemetry must never break the app.** Every Redis call is wrapped
in try/catch; on any failure (including missing env) the request still returns
202 and the UI is unaffected.

## 6. Data model (Redis keys)

Flat counter keys, read back with `MGET`:

```
ev:<event>:<day>            # daily total        e.g. ev:mint_confirmed:2026-07-08
ev:<event>:<game>:<day>     # daily per-game      e.g. ev:mint_confirmed:snake:2026-07-08
ev:<event>:total            # all-time total (no TTL)
```

- `day` = UTC date `YYYY-MM-DD`.
- Daily keys are written with **`EX` = 90 days** so storage stays bounded and the
  Upstash free tier never fills. All-time totals have no TTL.
- Each funnel event increments: daily-total, daily-per-game (if game present),
  and all-time-total. Error events increment daily-total + all-time-total (no
  game dimension).

## 7. Components

### 7.1 `lib/redis.ts` — thin, mockable I/O wrapper
- Lazily builds an Upstash client via `Redis.fromEnv()` (`@upstash/redis`),
  reading the env vars the Vercel Marketplace Upstash integration injects
  (`KV_REST_API_URL` / `KV_REST_API_TOKEN`, with `UPSTASH_REDIS_REST_*`
  fallback).
- Exports `incrWithTtl(key, ttlSeconds?)` and `mget(keys)`.
- **No env configured (local dev / tests) → no-op / in-memory fallback**, so dev
  and tests never require a live Redis.
- All operations swallow errors (log once, return safe default).

### 7.2 `lib/telemetry.ts` — client emitter (extended)
- Keeps `reportClientError(event, error)` (existing signature; callers
  unchanged) — adds message for debugging.
- Adds `trackFunnel(event, { game? })` for funnel events.
- Both post to `/api/telemetry` via `sendBeacon` (fetch keepalive fallback).
- `TELEMETRY_EVENTS` (errors) + new `FUNNEL_EVENTS` union into one allowlist.
- Payload shape: `{ event, message?, game?, path? }`.

### 7.3 `POST /api/telemetry` — ingest (extended)
- Rate-limited (reuse `lib/rate-limit.ts`). Note: legitimate play emits more
  events than errors do (`game_over` fires every session — rapid Snake deaths
  can be frequent), so funnel ingest uses a **more generous window** (e.g.
  60/60s per IP) rather than the 20/60s error limit. Over-limit drops are
  acceptable (approximate counts are fine for a funnel).
- Validate `event ∈ allowlist`; validate `game ∈ GAMES` or undefined.
- **Error events:** redact + `console.error(message)` (as today) **and**
  increment counters.
- **Funnel events:** drop message, increment counters only.
- Returns 202 always on valid payload; 400 invalid; 429 rate-limited.
- Redis increments wrapped so a Redis outage never turns into a non-202.

### 7.4 `lib/metrics-keys.ts` — pure key builder
- `dailyKey(event, day)`, `dailyGameKey(event, game, day)`, `totalKey(event)`,
  `keysForRange(event, days)`. No I/O. Unit-tested for exact format + range.

### 7.5 `lib/metrics-summary.ts` — pure aggregation
- Given raw counter values + the event catalog, produce
  `{ event → { total, byDay: {day→n}, byGame: {game→n} } }` and the derived
  funnel conversion percentages. No I/O; unit-tested.

### 7.6 `GET /api/metrics/summary?days=N` — read endpoint
- Server-only (keeps the Redis token off the client).
- Builds the key list for the range, `MGET`, runs `metrics-summary`, returns
  JSON.
- **Public-read** (§8). Adds a short CDN cache
  (`Cache-Control: s-maxage=30, stale-while-revalidate`) mirroring
  `/api/leaderboard`, to cap Redis reads under repeated loads.
- `days` clamped to a sane max (e.g. 90).

### 7.7 `/admin/metrics` — Win95 page
- Client page fetching `/api/metrics/summary`.
- Win95 styling (sunken panels + tables), consistent with existing windows.
- Sections:
  - **Money funnel:** played → attempted → confirmed, with the two golden
    ratios + failed count. Optional per-game table.
  - **Claim funnel:** attempted → confirmed → failed.
  - **Errors:** the 3 error counts by day.
- 7 / 30 day toggle. Numbers + percentages only (no charts in MVP).

## 8. Access control decision

**Public-read.** Aggregate funnel counts contain no PII, so the summary endpoint
and page are unauthenticated. The Redis token stays server-side (only
`/api/metrics/summary` touches Redis). Because the read path is already isolated
behind that one endpoint, a future password gate (`METRICS_PASSWORD` env +
httpOnly cookie) or wallet-signature check can be layered on without reworking
the pipeline.

## 9. Instrumentation points (confirmed)

| Event | Location |
|---|---|
| `game_over` | where a finished run is reported (record-run / game canvas) |
| `mint_attempted` | `SharedMintDialog` on mint click |
| `mint_confirmed` / `mint_failed` | `tx-tracker.ts` (already tracks confirmation) |
| `claim_attempted` / `claim_confirmed` / `claim_failed` | `HighScoreWindow` (Claim button) |

## 10. Error handling

- Telemetry failures are always swallowed; the app path never depends on a
  successful emit.
- Redis unavailable → increments are no-ops; ingest still returns 202; summary
  endpoint returns zeros (empty counters) rather than erroring.
- Rate limiting protects the ingest endpoint from abuse (per-IP, existing
  helper).

## 11. Testing

Pure functions separated from Redis I/O so tests need no live Redis (mirrors the
repo's `lib/*.ts` + `*.test.ts` pattern):

- **`lib/telemetry` sanitizer:** funnel payload accepted, game allowlist
  enforced, message stripped for funnel events, error events keep redacted
  message, unknown event rejected.
- **`lib/metrics-keys`:** exact key formats; `keysForRange` produces the right
  day list.
- **`lib/metrics-summary`:** given counters → correct totals + conversion %
  (incl. divide-by-zero → 0%).
- **`POST /api/telemetry` route** (mocked Redis): funnel event INCRs the right
  keys with TTL; error event still logs; invalid → 400; over-limit → 429; Redis
  throw → still 202.
- **`GET /api/metrics/summary` route** (mocked Redis): returns expected shape;
  `days` clamped; cache header present.
- **`lib/redis` fallback:** no env → no-op path returns safely.

## 12. Environment / setup (user action required)

- Install **Upstash for Redis** via the Vercel Marketplace (free tier). The
  integration auto-injects `KV_REST_API_URL` / `KV_REST_API_TOKEN` into the
  Vercel project. One-time ~2-minute click; Claude cannot do this (needs the
  user's Vercel account).
- Local dev needs no Redis — the `lib/redis.ts` fallback makes it a no-op.
- New dependency: `@upstash/redis`.

## 13. Rollout

1. Land the pipeline (redis wrapper, telemetry extension, ingest counting,
   keys/summary/route, metrics page) behind the no-op fallback — safe to ship
   before Upstash is provisioned (it just counts nothing).
2. User provisions Upstash in Vercel; redeploy → counters begin filling.
3. Watch `/admin/metrics` accumulate; use the golden ratios to inform the
   retention work (track #3).

## 14. Future phases (out of scope, noted for continuity)

- Economic/on-chain invariant **alerting** (phase 2): scheduled chain reader +
  notification channel, reusing this Redis store.
- Optional password/wallet gate on the metrics page.
- Charts once there is enough history to be worth plotting.
