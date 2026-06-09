# Whole-Project Correctness Fixes — Design

**Date:** 2026-06-09
**Status:** Approved (brainstorm) — ready for implementation plan
**Scope:** Group A (correctness / robustness bugs) from the 2026-06-09 whole-project
audit. UX-polish and performance/refactor groups are intentionally **out of scope**.

> Context: `xp-arcade-v4` is immutable on mainnet. No Clarity changes. All fixes
> are frontend-only (libs, hooks, one API route, components).

## Goal

Fix seven correctness/robustness bugs found across the whole project so that:
leaderboard/holdings views degrade gracefully on partial chain failures, the
season-deadline UI is per-game-correct and resists the stillborn-season footgun,
personal-best works for every game, and edge inputs no longer 500 or throw.

## Items in scope

| # | Bug | Severity | Files |
|---|-----|----------|-------|
| C1 | Personal best only works for Snake; key not game-scoped | medium UX | `lib/high-score.ts`, `components/shared/SharedMintDialog.tsx` |
| A2 | Metadata route 500s on unknown `game-id` | low edge | `lib/metadata-route.ts` |
| L1 | One game's transient read failure blanks the whole showcase + ticker | medium | `hooks/useLeaderboardShowcase.ts` |
| H1 | One failed/429 metadata fetch drops a whole game's NFTs; >60 NFTs self-rate-limit | medium | `lib/holdings.ts` |
| C2 | `connect()` rejects unhandled when the user cancels the wallet | low | `state/wallet.ts` |
| S2 | "End Season" button trusts the canonical (Snake) deadline for every tab | medium latent | `lib/season-countdown.ts` + 3 consumers |
| S1 | Stillborn season: permissionless button persists, enabling repeat closes | high (ops+UI) | `lib/ended-seasons.ts` (new), `components/windows/HighScoreWindow.tsx` |

## Out of scope (recorded, not built)

- **U1** native `confirm()` breaks the Win95 theme — UX polish.
- **SEO1** player page OG copy says "Snake score NFTs" — copy.
- **S5** "reached" badge text overflow — UI polish.
- **P1** uncoordinated polling (showcase + countdown + per-window) — perf/refactor.
- **S4** `watchTx` fire-and-forget in end-season handlers — minor leak (perf group).

These remain documented in this session's audit for a future initiative.

---

## Part 1 — Data robustness

### C1 · Game-scoped personal best

`lib/high-score.ts` currently uses a single global key `xp-arcade:best-score` and
is only invoked for Snake, so the other three games show a misleading
"Personal best = current score".

**Design:**
- Key becomes `xp-arcade:best-score:${gameId}`.
- `getBestScore(gameId: GameId): number` and
  `recordScore(gameId: GameId, score: number): { best; isNewRecord }`.
- **Legacy migration (read-only fallback):** when reading `snake` and the new key
  is absent, fall back to the old global key `xp-arcade:best-score` so a returning
  player keeps their stored Snake best. No write/migrate step needed.
- `SharedMintDialog` (currently lines 121-125) calls `recordScore(gameId, score)`
  for **all** games instead of the Snake-only branch.

**Tests:** per-game isolation (snake best ≠ tetris best); legacy fallback only for
snake; `isNewRecord` true only when strictly greater; SSR-safe (no `window`).

### A2 · Metadata route guards unknown game-id

`lib/metadata-route.ts:64` does `GAMES[gameIdFromOnchain(...)].label`, which throws
(→ 500) if the on-chain `game-id` is not in the registry.

**Design:** after reading score-data, if `gameIdFromOnchain` does not resolve to a
registered game, return `404 { error: "not found" }` (with the existing 60s
cache header), instead of letting the lookup throw into the 500 branch.

**Tests:** mock `get-score-data` returning an out-of-range `game-id` → 404, not 500.

### L1 · Showcase tolerates per-game failures

`hooks/useLeaderboardShowcase.ts:41-47` only wraps the pool read in `.catch`;
`getTopTenForGame` and `getCurrentSeasonForGame` are unguarded, so one game's
transient failure rejects the whole `refresh`, leaving every game stale/blank and
setting a global error.

**Design:** wrap each per-game `getTopTenForGame` and `getCurrentSeasonForGame`
in `.catch`, mirroring the pool pattern. On a per-game failure, keep that game's
**previous** value (rows/season) rather than clobbering to empty; only surface a
global error if the whole refresh genuinely fails. Implementation: read current
state for fallback inside `refresh`.

**Tests:** one game's `getTopTenForGame` rejects → other games update, failing
game retains last-known rows, no global error set.

### H1 · Holdings tolerates failed metadata + caps concurrency

`lib/holdings.ts:59` uses `Promise.all` over per-NFT metadata fetches, so a single
failed (or rate-limited 429) metadata response rejects the whole
`fetchScoreHoldings` for that game; `fetchAllScoreHoldings`'s `allSettled` then
drops every NFT of that game. A wallet with >60 NFTs also self-trips the
metadata route's 60/min IP rate limit.

**Design:**
- Replace per-NFT `Promise.all` with `Promise.allSettled`; **skip** NFTs whose
  metadata fetch fails or returns a non-OK response, keep the rest.
- Treat a non-`res.ok` response (e.g. 429/404/500) as a skip, not a parse.
- Add a small **concurrency cap** (default 5) when fetching metadata so a large
  collection does not fire 60+ simultaneous requests and self-rate-limit.

**Tests:** with one NFT's metadata rejecting → the others are returned; verify the
in-flight request count never exceeds the cap (mock `fetch` counting concurrency);
non-ok response → that NFT skipped.

### C2 · Wallet connect tolerates user cancel

`state/wallet.ts:28` `connect()` awaits `connectWallet()` with no catch; cancelling
the wallet modal produces an unhandled rejection (the mint dialog's
"Connect to Mint" calls it without a catch).

**Design:** wrap `connectWallet()` in try/catch inside `connect()`. On failure or
cancel, do not throw — leave `address` unchanged (null). Still set address on
success. Keeps callers (no catch) safe.

**Tests:** mock `connectWallet` rejecting → `connect()` resolves, address stays
null, no throw.

---

## Part 2 — Season correctness

### S2 · Per-game countdown

`lib/season-countdown.ts`'s `useSeasonCountdown()` reads only the canonical game
(Snake, on-chain id 1). The permissionless "End Season" button is rendered per
game-tab but driven by this global state, so if a game's deadline differs (e.g. a
newly registered game whose deadline was not set), the button shows on that tab
and a click submits an `end-season` that aborts on-chain (`ERR-SEASON-STILL-OPEN`),
wasting gas.

**Design:**
- Change the hook to `useSeasonCountdown(gameId: GameId)`, reading that game's
  `get-season-end-block`.
- Extend the pure types so the block source and the `reached` state carry
  `endBlock: number` (needed by S1):
  - `CountdownSource` block variant: `{ kind: "block"; reached; endsAt; endBlock }`
  - `Countdown` reached variant: `{ state: "reached"; endsAt; endBlock }`
  - `deriveCountdown` threads `endBlock` from source into the `reached` state.
- Update call sites:
  - `HighScoreWindow` `LeaderboardTab` → `useSeasonCountdown(gameId)` (the fix).
  - `SeasonAdminWindow` → `useSeasonCountdown(gameId)` (selected game).
  - `DesktopLeaderboardShowcase` → `useSeasonCountdown("snake")` (global badge).

**Tests:** extend `season-countdown.test.ts`: reached block carries `endBlock`;
future block stays `live`; other states unchanged.

### S1 · Stillborn-season UI mitigation

After the deadline block passes, the contract leaves `season-end-block` set, so
`countdown.state` stays `"reached"` forever and the button re-enables every new
season — a stillborn-season footgun. The contract is immutable; full prevention is
operational (owner sets a far-future block after the contest — HANDOFF quirk #9).
This is the **UI mitigation** the user approved.

**Design:**
- New module `lib/ended-seasons.ts` (pure + localStorage):
  - `markSeasonEnded(gameId: GameId, endBlock: number): void`
  - `wasSeasonEnded(gameId: GameId, endBlock: number): boolean`
  - Stored as a set of `${gameId}:${endBlock}` keys; SSR-safe; corrupt storage
    tolerated (returns false / no-op).
- `HighScoreWindow`:
  - Render the permissionless button only when
    `countdown.state === "reached" && !wasSeasonEnded(gameId, countdown.endBlock)`.
  - In the `watchTx` success branch of `handlePermissionlessEnd`, call
    `markSeasonEnded(gameId, endBlock)` before `setReloadKey` (capture `endBlock`
    from the `reached` countdown at submit time).
  - Strengthen the `confirm()` copy: warn that if the deadline is already in the
    past, a freshly-opened season can be closed again immediately — only proceed
    if this is the intended contest close.

**Tests:** `ended-seasons` round-trip + `(game, block)` isolation (mock
localStorage); corrupt/missing storage → `wasSeasonEnded` false, `markSeasonEnded`
no-throw.

> **Honest limitation:** this blocks repeat closes from the *same browser* and
> removes the visual footgun for the common case. A different browser can still
> close a stillborn season; the durable fix is operational (re-lock the deadline
> block after the contest).

---

## Implementation order (small green TDD commits)

1. C1 high-score (pure lib + mint dialog wiring)
2. A2 metadata route guard
3. L1 showcase per-game catch
4. H1 holdings allSettled + concurrency cap
5. C2 wallet connect catch
6. S2 season-countdown per-game (+ `endBlock` in types) + 3 consumers
7. S1 `ended-seasons` module + HighScoreWindow button gating + confirm copy

## Files touched

- `lib/high-score.ts` (+ test)
- `lib/metadata-route.ts` (+ existing test)
- `hooks/useLeaderboardShowcase.ts` (+ test)
- `lib/holdings.ts` (+ test)
- `state/wallet.ts` (+ test)
- `lib/season-countdown.ts` (+ test)
- `lib/ended-seasons.ts` **(new)** (+ test)
- `components/windows/HighScoreWindow.tsx`
- `components/windows/SeasonAdminWindow.tsx`
- `components/desktop/DesktopLeaderboardShowcase.tsx`
- `components/shared/SharedMintDialog.tsx`

## Verification gate

- `cd frontend && npm run ci` (lint + test + typecheck + build) green.
- Contract untouched — no contract run required (sanity: `clarinet check` still 0).
- Manual smoke (optional): MyNfts loads with a forced metadata failure; showcase
  survives one game read failing; mint dialog shows correct per-game personal best.

## Testing strategy

Pure/unit-first (TDD) for every lib: `high-score`, `ended-seasons`,
`season-countdown` (`deriveCountdown`), `holdings` (fetch-mock), `metadata-route`
(read-only mock), `wallet` (connect-mock), `useLeaderboardShowcase` (contract-call
mock). Components are wired to already-tested units; covered by typecheck + build
and the optional manual smoke.
