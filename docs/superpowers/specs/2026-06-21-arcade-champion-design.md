# Arcade Champion — cross-game overall ranking (design)

**Date:** 2026-06-21
**Status:** approved design, ready for implementation plan
**Contract impact:** none (frontend-only, snapshot-derived)

## 1. Overview

XP Arcade has six games, but every leaderboard/Hall-of-Fame view is *per game*.
There is no unifying "who is the best player across the whole arcade" layer.

**Arcade Champion** adds a cross-game ranking computed purely from the already
cached leaderboard snapshot (`/api/leaderboard` → `LeaderboardSnapshot`). Each
player who appears in any game's current-season top-10 earns **rank points** per
game; the sum across all six games ranks them as arcade champions. No extra
on-chain reads, no contract change.

## 2. Scoring model

- **Rank points per game:** a top-10 placement of rank `r` earns `11 - r`
  points (`#1 = 10 … #10 = 1`); not in a game's top-10 earns `0`.
- **Champion score:** sum of rank points across all six games.
- **Ranking set:** the union of every address appearing in any game's
  `topTen` (≈ 60 max). For each, rank in each game comes from the same ordering
  used everywhere else (`rankRows` / `findPlayerRank` in `lib/leaderboard-showcase.ts`).
- **Boards with < 10 entries:** leading a short board still earns points by
  position — acceptable and intentional.

### Tie-break (in order)

1. Higher champion score (points).
2. More `#1` finishes.
3. Better (lower) single best rank.
4. Address string (deterministic final tiebreak).

### Season scope

**Current season only.** The snapshot carries current-season top-10s; all-time
would require historical indexing (rejected as out of scope, same cost reason as
the rejected XP model). Champion resets each season — a fresh race.

## 3. Core logic — `lib/arcade-champion.ts` (pure, no React / no I/O)

```ts
export function rankPoints(rank: number): number; // rank∈[1,10] ? 11-rank : 0

export type ChampionEntry = {
  player: string;
  points: number;
  ranks: Record<GameId, number | null>; // per-game rank or null
  firsts: number;        // count of #1 finishes
  bestRank: number;      // lowest rank number across games (Infinity-safe → use a sentinel)
  gamesRanked: number;   // games where the player is in top-10
};

// Build + sort the cross-game ranking from the cached snapshot.
export function computeArcadeChampions(
  snapshot: LeaderboardSnapshot,
): ChampionEntry[];

// New-champion detection (pure). prevChampion = last-seen leader address (or null).
export function detectNewChampion(
  prevChampion: string | null,
  current: ChampionEntry[],
): { player: string; dethroned: string | null } | null;
//  - null when no current leader, or when leader is unchanged, or first-ever sight
//    (prevChampion === null → no banner).
//  - otherwise { player: newLeader, dethroned: prevChampion }.
```

Reuses `rankRows` / `findPlayerRank`. `gamesRanked === 0` players are excluded.

## 4. UI

Win95 window chrome is preserved; the *content area* becomes a retro "arcade
attract-mode screen" — that is where the flair lives, so the theme is not broken.

### A) Window `👑 Arcade Champion` (`components/windows/ArcadeChampionWindow.tsx`)

- **Marquee header:** neon-glow "ARCADE CHAMPION" with a light flicker + season
  subtitle ("Season N · live").
- **Podium (top 3):** 1-2-3 pedestals (gold center tallest), `#1` wears a 👑 with
  a gold shimmer; short address + points (count-up on open).
- **Ranking list:** each row = rank badge · player chip · **medal strip** (the six
  game emojis 🐍🧱👾🏓💣🃏, showing the player's rank number where ranked, dimmed
  where not) · total points (bold monospace). The connected wallet's row is
  highlighted ("YOU", gold border glow) and auto-scrolled into view.
- **CRT overlay:** scanlines + subtle vignette over the content panel.
- **Pixel confetti** burst on open (and on a new-champion event).

### B) Desktop panel `👑 Arcade Champion`

- Uses the existing showcase `panelStyle` (Win95). Compact attract-mode: reigning
  champion (crown + points + 3-dot mini podium), auto-rotating to #2/#3 every
  ~4.5s (mirrors the existing "Score Cards" slide cadence). Click → opens window.

### C) "NEW CHAMPION" banner (throne change)

- Persist the last-seen champion address in `sessionStorage` under a
  season-scoped key: `arcade-champ-seen:{season}`.
- On load, `detectNewChampion(stored, current)`:
  - first-ever sight (no stored value) → **no banner** (avoid first-visit flash);
  - season rollover → key is empty for the new season → **no false positive**;
  - changed leader → show banner "`SPnew…` dethroned `SPold…`" (gold scrolling
    banner, glow + confetti, auto-hide ~6s), then update the stored value.
- Desktop panel shows a small blinking **"NEW!"** pip on a throne change.

### Accessibility

Honor `prefers-reduced-motion`: disable flicker / confetti / count-up / scrolling;
the banner still appears but static. All effects are pure CSS (no heavy libs).

## 5. Testing

- `lib/arcade-champion.test.ts` (TDD): `rankPoints` boundaries (0, 1, 10, 11);
  `computeArcadeChampions` — multi-game totals, each tie-break level, board < 10,
  single-game-only address, empty snapshot; `detectNewChampion` — first sight
  (null → no banner), throne change, unchanged leader.
- Window + panel: smoke render tests in the existing component-test style.
- Gate stays green: `npm test`, `npx tsc --noEmit`, `npm run lint`.

## 6. Scope

**In scope:** `lib/arcade-champion.ts`; `ArcadeChampionWindow.tsx`; desktop panel;
window-type registration (`state/window-manager.ts`) + Start-menu entry; banner +
season-scoped persistence; CSS animations respecting reduced-motion.

**Out of scope (YAGNI):** no contract change; no historical / all-time ranking; no
profile champion badge (the chosen surface excludes it); no on-chain champion NFT.

## 7. Incremental commit plan (each commit green; helper before wiring)

1. `feat(arcade-champion): cross-game rank-points scoring helper`
   — `lib/arcade-champion.ts` (`rankPoints`, `computeArcadeChampions`, types) + test.
2. `feat(arcade-champion): new-champion detection helper`
   — `detectNewChampion` + test.
3. `feat(arcade-champion): champion window with podium + medal strips`
   — `ArcadeChampionWindow.tsx`, window-type registration, Start-menu entry, CSS.
4. `feat(arcade-champion): NEW CHAMPION banner + season-scoped persistence`
   — banner UI + `sessionStorage` wiring in the window.
5. `feat(arcade-champion): desktop attract-mode champion panel`
   — desktop showcase panel + hook wiring + NEW! pip.

Final granularity may merge/split slightly during build, but each commit builds
and tests green, and no helper is split from its only caller into a broken state.
