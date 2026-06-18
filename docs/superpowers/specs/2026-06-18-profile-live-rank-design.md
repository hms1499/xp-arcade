# Player Profile — Live Rank Per Game

**Date:** 2026-06-18
**Status:** Approved design, ready for plan

## Problem

The Player Profile window (`PlayerProfileWindow` / `PlayerProfileBody`) already
shows a rich, NFT-derived view: total mints, best score, per-game breakdown,
rarity, achievements, level, featured NFTs. But every number is *historical*,
derived from owned Score NFTs. The profile never tells the player **where they
stand right now** — their live rank in each game's current-season top-10.

This turns the profile from a static NFT gallery into a competitive standings
view, using data already fetched and cached elsewhere in the app.

## Non-Goals (YAGNI)

- No live auto-refresh of rank (one fetch on open, matching how the profile
  loads NFTs).
- No historical per-season rank lookup — only the current-season board.
- No changes to claim / prize flows (separate enhancement).
- No new window; this extends the existing `PlayerProfileBody`.
- **No contract change.** Reads only.

## Data Source

Reuse `fetchLeaderboardSnapshot()` from `lib/leaderboard-snapshot.ts`, the
client-cached (`GET /api/leaderboard`, in-memory cache + single-flight) snapshot
that already powers the desktop showcase, High Scores, and Hall of Fame. It
returns `snapshot.games[gameId].topTen` (`TopEntry[]`) and `.currentSeason` for
all six games. No raw contract calls are added.

**Semantics:** `get-top-ten` returns the *current season* board. "Live rank"
therefore means "your standing in the current season right now" — distinct from
the historical best score derived from NFTs (which may be from older seasons). A
player who has mints but is not in the current top-10 is shown as "Not in
top-10".

## Logic (pure, tested first)

Add to `lib/leaderboard-showcase.ts` (already home to `rankRows`):

- `findPlayerRank(topTen: TopEntry[], address: string): number | null`
  - Reuse the existing `rankRows` (sort by score desc, tie-break by
    `player.localeCompare`) so rank is consistent with every other leaderboard
    view in the app.
  - Find the row whose `player === address`; return its `rank` (1–10), or `null`
    if the player is not on the board.

Add a profile-level aggregator (location: `lib/player-stats.ts`, alongside the
other profile-derived computations, or a small new `lib/player-ranks.ts` — plan
decides):

- `playerLiveRanks(snapshot: LeaderboardSnapshot, address: string): Record<GameId, number | null>`
  - Map each game id through `findPlayerRank`.
- `bestLiveRank(ranks: Record<GameId, number | null>): { gameId: GameId; rank: number } | null`
  - The single best (lowest-number) current rank across all games, for the
    header chip. `null` when the player is not in any game's top-10.

These are pure functions over a snapshot + address — unit-testable with no
network.

## UI

Extend `PlayerProfileBody` only — no new components required, though a tiny
`LiveRankRow` helper may be extracted for clarity (plan decides).

1. **Per-game card (`GameBreakdown`)** — for each game the player has minted in,
   add a `Rank` row to the existing stats grid:
   - In top-10: `🏆 #3` (trophy emoji only for ranks 1–3; plain `#N` otherwise).
   - Has mints but off the board: `Not in top-10`.
2. **Header chip** — add a `Live rank` chip next to the existing NFTs / Best /
   Top-game chips, reading e.g. `#1 — Snake` from `bestLiveRank`. Hidden when
   the player is in no game's top-10.

## Loading & Error Handling

Rank is supplementary and must never block or break the profile:

- Fetch the snapshot **in parallel** with the existing NFT load (separate
  effect / state). The profile renders NFT-derived content exactly as today
  regardless of snapshot status.
- While the snapshot is loading: rank rows / chip render a subtle `…`
  placeholder (or are simply absent — plan picks one and is consistent).
- On snapshot error: omit the rank UI entirely. No error surfaced for rank;
  this matches the `safeRead` "never throw, fall back" philosophy used in
  `leaderboard-reads.ts`.

## Scope of Change

- `lib/leaderboard-showcase.ts` — add `findPlayerRank`.
- `lib/player-stats.ts` (or new `lib/player-ranks.ts`) — add `playerLiveRanks`,
  `bestLiveRank`.
- `components/player/PlayerProfileBody.tsx` — fetch snapshot, render rank row in
  `GameBreakdown` + header chip.
- New tests for the pure helpers; extend an existing component test if cheap.

Works identically for own profile and the public `/player/[address]` route.

## Testing

- `findPlayerRank`: player at rank 1, mid-board, rank 10, not present, empty
  board, and a tie (verify it matches `rankRows`' positional ordering).
- `playerLiveRanks`: mixed — ranked in some games, absent in others, address not
  anywhere.
- `bestLiveRank`: picks the lowest rank number; returns `null` when no ranks.

Follow TDD: write the helper tests first (red), implement (green), then wire the
UI.
