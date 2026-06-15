# Leaderboard Proxy + Cache + Client Hardening — Design Spec

**Date:** 2026-06-15
**Status:** Approved (brainstorm), pending implementation plan
**Contract impact:** None. Frontend + one Next.js API route. No Hiro API key.

## 1. Problem

The browser calls the public Hiro read-only endpoint (`api.hiro.so`,
`/v2/contracts/call-read`) **directly** via `fetchCallReadOnlyFunction`
(`lib/contract-calls.ts`, network = `STACKS_MAINNET`, no key, no cache, no
proxy). A single desktop load fans out heavily:

- `useLeaderboardShowcase.refresh()` fires **15 read-only POSTs at once**
  (5 games × {top-ten, current-season, prize-pool}) and repeats **every 30s**.
- `HighScoreWindow` adds ~4 more per tab; Hall of Fame, ticker, and the prize
  hero add more.

Unauthenticated read-only calls have a low rate limit, and read-only is a heavy
endpoint, so a normal session triggers HTTP **429**. The limit is currently
counted **per end-user browser**, uncached and unshared.

## 2. Goal

Eliminate 429s **without any Hiro API key** by (a) collapsing the shared,
non-wallet-specific leaderboard reads behind one cached Next.js route so the
browser hits our server (and CDN), not Hiro; and (b) hardening the remaining
client-direct reads with dedupe, a short TTL cache, and 429 backoff.

## 3. Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Proxy scope | Single batched **snapshot** endpoint for all 5 games: `topTen + currentSeason + prizePool + seasonEndBlock`. Wallet-specific reads stay client-direct. |
| Server cache | In-memory TTL (~30s) in the route, module-scoped, single-flight on miss. |
| CDN layer | `Cache-Control: s-maxage=30, stale-while-revalidate=60` so Vercel's edge serves most users without invoking the function. |
| Client hardening | In-flight **dedupe** + **429 backoff (jitter)** + short **client TTL cache (~30s)** for the snapshot and for wallet-specific reads. |
| Staleness tradeoff | A fresh mint may show a stale `best-score` for up to ~30s — accepted. |
| Contract / API key | No contract change. No Hiro API key. |

## 4. Architecture & data flow

```
Browser components ──► GET /api/leaderboard (Next route)
  (showcase, High Scores,        │  CDN s-maxage=30 (shared, free)
   Hall of Fame, ticker, hero)   │  in-memory TTL ~30s + single-flight
                                 │  serve-stale-on-error
                                 ▼
                          Hiro read-only (server IP, ≤1 rebuild / 30s / instance,
                          concurrency-limited + retryWithBackoff)

Wallet-specific reads (best-score, mints-remaining, claimable, has-claimed,
current-season for an admin action) stay client-direct
                                 ──► cachedRead (dedupe + TTL + backoff)
```

The 15-call showcase burst collapses to **one cached GET**. The slow-moving
shared leaderboard reaches Hiro at most ~once per 30s per server instance, and
the CDN absorbs most of even that.

## 5. Components

Each unit has one responsibility and is independently testable.

### 5.1 `lib/retry.ts` — `retryWithBackoff(fn, opts?)`
Shared by server route and client. Exponential backoff + jitter, capped
attempts (default ~4), retries **only** on rate-limit-class errors; non-rate-limit
errors throw immediately. Signature:

```ts
type RetryOpts = { attempts?: number; baseMs?: number; maxMs?: number;
  isRetryable?: (err: unknown) => boolean };
export async function retryWithBackoff<T>(fn: () => Promise<T>, opts?: RetryOpts): Promise<T>;
export function isRateLimitError(err: unknown): boolean;
```

`isRateLimitError` is the default `isRetryable`: detects HTTP 429 from the way
`fetchCallReadOnlyFunction` surfaces failures (status code on the error, or a
`429` / "rate limit" / "Too Many Requests" substring in the message). The
implementer verifies the actual thrown shape and adjusts the detector; the
default must err toward *not* retrying unknown errors.

### 5.2 `lib/leaderboard-reads.ts` — server-safe reads
A module **without** `"use client"` (so the route handler can import it cleanly,
exactly as `lib/score-lookup.ts` already calls `fetchCallReadOnlyFunction`
server-side). Exposes one function:

```ts
export type GameLeaderboard = {
  topTen: TopEntry[]; currentSeason: number | null;
  prizePool: number | null; seasonEndBlock: number | null;
};
export async function readGameLeaderboard(gameId: GameId): Promise<GameLeaderboard>;
```

Each of the four reads is wrapped in `retryWithBackoff`; a single read failing
yields `null` for that field (not a throw), so one bad field never sinks the
game. `topTen` defaults to `[]` on failure. Reuses the existing CV-unwrap
helpers. (`TopEntry` is the existing type from `lib/contract-calls.ts`; if
importing it would pull the `"use client"` module into the server route, move
`TopEntry` to a neutral module — the plan decides; do not duplicate the type.)

### 5.3 `app/api/leaderboard/route.ts` — cached snapshot (GET)
- `export const dynamic = "force-dynamic"` is **not** used; instead set caching
  headers explicitly (below). Runtime: Node (default).
- Response body:
  ```ts
  type LeaderboardSnapshot = {
    updatedAt: string; // ISO
    games: Record<GameId, GameLeaderboard>;
  };
  ```
- **Module-scoped cache:** `{ data: LeaderboardSnapshot; expiresAt: number } | null`
  and an `inFlight: Promise<LeaderboardSnapshot> | null` single-flight guard.
- On request:
  1. If cache fresh (`now < expiresAt`) → return it.
  2. Else if a rebuild is in flight → await it.
  3. Else start a rebuild: read all 5 games with **limited concurrency** (e.g.
     batches of 2–3, not all 5×4 at once) each via `retryWithBackoff`; merge
     **per-game over the previous snapshot** so a failed game keeps its
     last-known value (serve-stale-on-error). Store with
     `expiresAt = now + 30_000`.
  4. If the rebuild throws entirely (no prior cache), return a snapshot with
     empty games and `updatedAt` = now; **never 500** the whole route for a
     data-source hiccup.
- Headers: `Cache-Control: public, s-maxage=30, stale-while-revalidate=60`.
- Always HTTP 200 with the snapshot shape.

### 5.4 `lib/leaderboard-snapshot.ts` — client fetch (+ types)
`"use client"`-safe. `fetchLeaderboardSnapshot(): Promise<LeaderboardSnapshot>`
fetches `/api/leaderboard` with **in-flight dedupe** + **client TTL cache ~30s**
(module-scoped). Re-exports/owns the `LeaderboardSnapshot` / `GameLeaderboard`
types so client and server agree on one shape. A failed fetch returns the last
cached snapshot if present, else a typed empty snapshot.

### 5.5 `lib/read-cache.ts` — `cachedRead(key, ttlMs, fn)`
Client utility. Module-scoped `Map<string, { value; expiresAt }>` +
`Map<string, Promise>` for in-flight dedupe. Behavior: fresh cached → return it;
in-flight for key → return that promise; else call `retryWithBackoff(fn)`, cache
the result for `ttlMs`, and clear the in-flight entry on settle. Used to wrap
wallet-specific reads in `contract-calls.ts` with keys that include
address/game/season.

## 6. Wiring changes

- **`hooks/useLeaderboardShowcase.ts`**: `refresh()` calls
  `fetchLeaderboardSnapshot()` once and maps the result into the existing
  `rowsByGame` / `seasonsByGame` / `poolsByGame` shape. The hook's **public
  return shape is unchanged**, so `PrizePoolHero`, `LeaderboardTicker`, and
  `DesktopLeaderboardShowcase` need no changes. The 30s polling interval stays.
- **`components/windows/HighScoreWindow.tsx`**: source `topTen`,
  `currentSeason`, `prizePool` from `fetchLeaderboardSnapshot()` (for the active
  tab's game); keep `best-score` client-direct through `cachedRead`.
- **`components/windows/HallOfFameWindow.tsx`**: where it currently fetches
  top-ten / season per game, read from the snapshot instead. (If it already
  consumes `useLeaderboardShowcase`, no change — the plan verifies.)
- **`lib/contract-calls.ts`**: wrap the wallet-specific read fns
  (`getBestScoreForGame`, `getMintsRemaining`, `getClaimableAmount`,
  `hasClaimedPrizeForGame`) in `cachedRead`. Leave write paths (`mint*`,
  `endSeason*`, `claimPrizeV3`) untouched.

## 7. Error handling & staleness

- Per-game read failure → that field is `null` (or `[]` for top-ten); the route
  serves the previous good value when available.
- Whole-rebuild failure with no prior cache → empty snapshot, HTTP 200.
- Client snapshot fetch failure → last cached snapshot, else empty.
- 429s anywhere are retried with backoff before surfacing as a failure.
- Staleness bound: shared data ≤ ~30s (CDN + caches); wallet best-score ≤ ~30s
  after a mint. Both accepted.

## 8. Testing

- `lib/retry.test.ts`: retries on a 429-class error and eventually succeeds;
  gives up after `attempts`; does **not** retry a non-rate-limit error;
  `isRateLimitError` classifies a 429 and rejects a generic error. Use fake
  timers / injected delay so tests are fast.
- `lib/read-cache.test.ts`: two concurrent `cachedRead` calls for the same key →
  underlying fn called **once** (dedupe); a third call after TTL expiry refetches;
  backoff is applied (fn that throws 429 once then resolves → one visible
  result).
- `app/api/leaderboard/route.test.ts`: mock the server reads; assert the batched
  shape for all `GAME_IDS`; a second request within TTL does **not** re-read
  (cache hit); a per-game read failure serves the previous value (serve-stale);
  the `Cache-Control` header is present; route returns 200 even when a read
  throws.
- `lib/leaderboard-snapshot.test.ts`: concurrent `fetchLeaderboardSnapshot` →
  one `fetch` (dedupe); cache hit within TTL; failed fetch returns last cache.
- `hooks/useLeaderboardShowcase` test: mock `fetchLeaderboardSnapshot`; assert the
  mapped `rowsByGame`/`seasonsByGame`/`poolsByGame` match and `mergeWithFallback`
  still protects against a missing game.
- Full gate (per CLAUDE.md): `npx tsc --noEmit`, `npm run lint`, `npm test`,
  `npm run build` all green.

## 9. Out of scope (YAGNI)

- No Hiro API key, no alternative RPC endpoints/fallback rotation.
- No generic read-only passthrough proxy (only the batched snapshot).
- No caching of wallet-specific reads on the server (kept per-browser, per-user).
- No Vercel Runtime Cache / `unstable_cache` (in-memory + CDN headers chosen).
- No websocket/live updates; the existing 30s poll stays.
- No change to write/mint/claim paths.

## 10. Files

**Create:**
- `frontend/lib/retry.ts` (+ `retry.test.ts`)
- `frontend/lib/read-cache.ts` (+ `read-cache.test.ts`)
- `frontend/lib/leaderboard-reads.ts` (server-safe)
- `frontend/app/api/leaderboard/route.ts` (+ `route.test.ts`)
- `frontend/lib/leaderboard-snapshot.ts` (+ `leaderboard-snapshot.test.ts`)

**Modify:**
- `frontend/hooks/useLeaderboardShowcase.ts`
- `frontend/components/windows/HighScoreWindow.tsx`
- `frontend/components/windows/HallOfFameWindow.tsx`
- `frontend/lib/contract-calls.ts` (wallet reads via `cachedRead`)
- `HANDOFF.md`
