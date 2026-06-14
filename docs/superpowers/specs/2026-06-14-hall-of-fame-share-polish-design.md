# Hall of Fame — Season Share + Visual Polish (design)

**Date:** 2026-06-14
**Status:** Approved (design), pending implementation plan
**Scope:** Polish of the already-shipped Hall of Fame window and share
infrastructure. No contract changes — all data comes from existing read-only
functions on `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4`.

## Context

Both "share cards" and "Hall of Fame" are already built and wired:

- Per-score share: `app/share/score/[id]/{page,opengraph-image}.tsx`,
  `lib/score-lookup.ts`, `lib/share.ts`, `components/shared/ShareActions.tsx`,
  used in the mint dialog and My NFTs.
- `components/windows/HallOfFameWindow.tsx` renders current + up to 5 closed
  seasons per game (via `getSeasonPrizeForGame` snapshots), with game-filter
  tabs, a hero strip, and player-profile links. Rendered in `app/page.tsx`,
  window type `hall-of-fame`, reachable from the Desktop icon and Start menu.

This spec adds two polish items the user prioritised:

- **A.** Share a whole season's leaderboard (not just a single score).
- **B.** Visual polish inside `HallOfFameWindow`: highlight the connected
  wallet, nicer loading/empty states, and per-game hero ordering.

Deliberately NOT in this spec (user deferred): per-player "I ranked #N" cards,
season-champion-only cards, and rate-limit batching/retry for `loadHallOfFame`.

## Part A — Share a season leaderboard

### Route

Mirror the existing per-score route:

```
app/share/season/[game]/[season]/
  page.tsx             # public HTML page (Win95 window) + generateMetadata (OG tags)
  opengraph-image.tsx  # 1200x630 PNG card (next/og): top-5 + medals + prize pool
```

- `[game]` is a `GameId` slug: `snake | tetris | pacman | breakout | minesweeper`
  (these ARE the registry keys — no separate mapping needed).
- `[season]` is a positive integer.
- Invalid slug / non-positive season / season with no data:
  - `page.tsx` → `notFound()` (404), matching the score page's behaviour.
  - `opengraph-image.tsx` → generic branded fallback card (a generic unfurl
    beats a broken one), matching the score image's behaviour.

### Data layer — `lib/season-lookup.ts`

New module, analogous to `lib/score-lookup.ts`:

```ts
export type SeasonLookup = {
  gameId: GameId;
  gameName: string;
  emoji: string;
  season: number;
  status: "live" | "closed";
  totalUstx: number;            // live: current prize pool; closed: snapshot total
  rows: Array<{ player: string; score: number; rank: number }>; // ranked desc
};

export async function fetchSeasonLookup(
  gameId: GameId,
  season: number,
): Promise<SeasonLookup | null>;
```

Resolution logic:

1. Read `currentSeason = getCurrentSeasonForGame(gameId)`.
2. If `season > currentSeason` or `season < 1` → `null`.
3. If `season === currentSeason` → **live**: `rows` from `getTopTenForGame`,
   `totalUstx` from `getPrizePoolBalanceForGame`. If `rows` is empty → `null`
   (nothing worth sharing yet).
4. If `season < currentSeason` → **closed**: `getSeasonPrizeForGame(gameId,
   season)`; `null` if the snapshot is missing/empty.
5. Rank rows with the existing `rankRows` helper (`lib/leaderboard-showcase.ts`),
   sorted descending, ties handled the same way the window already does.

Score display MUST go through `formatScoreValue(gameId, score)` everywhere it is
rendered (page + OG image) so Minesweeper shows "Cleared in N s" rather than the
raw `9999 - seconds` integer.

Network errors propagate (so the page returns 500 and crawlers retry) exactly
like `score-lookup.ts`; only "no such season" returns `null`.

### OG image card

Reuse the Win95 styling of `app/share/score/[id]/opengraph-image.tsx`:

- Title bar: `{emoji} {gameName} · Season {season}` + "XP Arcade on Stacks".
- Body: "HALL OF FAME · TOP {n}" heading, then up to 5 ranked rows
  (🥇/🥈/🥉 for 1–3, `#4`/`#5` after), each `shortPlayer(player)` +
  `formatScoreValue`.
- Footer: `Prize pool: {totalUstx/1e6} STX` and `xp-snake.vercel.app`.
- `{ ...size, emoji: "twemoji" }` like the score card.

### Page (`page.tsx`)

A Win95 window (same shell as the score share page):

- `generateMetadata`: `summary_large_image` Twitter card + OG title/description
  derived from the lookup; `{ title: "XP Arcade" }` when the lookup is null.
- Body: title bar, a list of up to 10 ranked rows (rank, short player, formatted
  score), a "Prize pool: X STX" line, and a "🕹️ Play XP Arcade" link to `/`.
- `export const revalidate = 300` — closed seasons are effectively static; the
  live season refreshes within ~5 minutes, acceptable for a share card.
- Request-memoize the lookup with `cache(...)` so `generateMetadata` and the
  page body share one chain read, like the score page.

### Share helpers + wiring

- `lib/share.ts`: add `seasonShareUrl(gameId, season)` and
  `xSeasonIntentUrl(gameId, season)`. X text:
  `"{emoji} {gameName} Season {season} Hall of Fame on XP Arcade 🕹️"`.
- New small client control (e.g. `components/shared/SeasonShareActions.tsx`):
  "Share on X" + "Copy link", mirroring `ShareActions` but for the season URL.
  `ShareActions` stays score-only (single responsibility).
- `HallOfFameWindow`: each season `<section>` header gains a Share control using
  `seasonShareUrl(snapshot.gameId, snapshot.season)`.

## Part B — Visual polish (HallOfFameWindow only)

1. **Highlight the connected wallet.** Read the address via `useWallet`. Any
   leaderboard row (and hero) whose `player === address` gets a raised/tinted
   background and a small `YOU` tag, matching the `<-- YOU` treatment in
   `HighScoreWindow`. No-op when no wallet is connected.
2. **Loading + empty states.** Replace the plain `"Loading season records..."`
   text with a small set of skeleton rows while `status === "loading"`. Replace
   the "No season records are available yet." text with the shared `EmptyState`
   component.
3. **Per-game hero ordering.** When the active tab is "All Games", show one hero
   card per game (the rank-1 player of that game's most relevant season — live
   if it has rows, else its latest closed season) instead of the current
   global top-3 mix. When a single game is selected, show that game's hero.

## Testing

- `lib/season-lookup.test.ts` — mock the chain reads (mirror
  `lib/score-lookup.test.ts`): live season, closed season, `season > current`
  → null, empty/missing snapshot → null, and a Minesweeper case asserting the
  time-formatted score.
- Extend `lib/share.test.ts` — `seasonShareUrl` (correct path + slug) and
  `xSeasonIntentUrl` (intent host, encoded text, url param).
- Window components have no existing test harness in this repo; keep coverage at
  the lib level, consistent with the current test layout.

All gates must pass before claiming done: `npx tsc --noEmit`, `npm run lint`,
`npm test`, `npm run build` (clean stale `.next/**/* 2.*` first — known gotcha).

## Out of scope (YAGNI)

- Per-player "I ranked #N" share cards and season-champion-only cards.
- Batching/retry for `loadHallOfFame` rate-limit hardening (tracked separately).
- Any contract change — this is read-only against `xp-arcade-v4`.
