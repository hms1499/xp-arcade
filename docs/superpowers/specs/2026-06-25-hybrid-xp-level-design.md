# Hybrid XP / Level meta-progression (v1)

**Date:** 2026-06-25
**Status:** Design approved, ready for plan
**Scope:** Frontend only. No contract change (mainnet untouched).

## 1. Summary

XP Arcade already ships a *derived-only* level system (`lib/level.ts` +
`components/player/LevelBadge.tsx`, rendered in `PlayerProfileBody.tsx`) where
**XP = `stats.totalScore`** — the sum of every minted Score NFT's score. A player
who plays but never mints earns 0 XP.

This feature evolves that system into a **hybrid** one — base on-chain XP **plus**
a local "play bonus" (XP for finishing any game, mint or not) **plus** a streak
bonus from the daily challenge — and gives it a proper home on the Player profile
(Level, XP bar, current title, and the next title to unlock).

The change is **additive**: `totalScore` stays the base, so **no existing level
is reset**, and the existing XP curve + tests are preserved.

### Decisions locked during brainstorming

- **XP source:** Hybrid (derived on-chain base + local play bonus + streak bonus).
- **Construction:** Additive on top of the existing `totalScore` base — do *not*
  redefine the base into a weighted formula (avoids resetting everyone's level and
  rewriting the curve tests).
- **Cosmetic v1:** Titles only. (Themes, cursors, avatar frames → v2.)
- **Display v1:** Player profile window only. (Level-up toast, taskbar badge,
  leaderboard titles → v2.)

## 2. Architecture

Four units, each independently understandable and testable.

### A. XP formula — extend `lib/level.ts`

`computeLevel` gains an **optional** second argument; calling it with no second
argument is byte-for-byte the old behavior (used for *other players'* profiles,
which are derived-only).

```ts
computeLevel(
  stats: PlayerStats,
  opts?: { playXp?: number; bestStreak?: number },
): LevelInfo

// xp = max(0, stats.totalScore)        // base on-chain — UNCHANGED
//    + (opts.playXp   ?? 0)            // local lifetime play XP
//    + (opts.bestStreak ?? 0) * STREAK_XP
```

- The curve helpers `levelForXp`, `cumulativeXpToReach`, `XP_BASE` are **not
  touched**.
- New constant `STREAK_XP = 50` (XP per best-streak day). Tunable.
- New helper `nextTitleUnlock(level): { title: string; atLevel: number } | null`
  for the profile "Next: «Title» @ Lv N" line. Returns `null` at the top tier.

### B. Local play XP — new persisted store `state/play-xp.ts`

A Zustand store with `persist` middleware (same pattern as
`state/desktop-theme.ts`), localStorage key `xp-arcade-play-xp`.

```ts
type PlayXpState = {
  lifetimeXp: number;
  byGame: Record<GameId, number>;
  addPlay: (gameId: GameId, score: number) => void;
  reset: () => void; // for tests / future "clear data"
};
```

- Per-run XP via a pure exported helper `playXpForRun(score): number`, proposed
  `10 + floor(max(0, score) / 25)` (flat finish reward + small score component;
  `MAX-SCORE` is `u9999` so the score component is bounded ≤ ~399). Constants
  tunable in the plan.
- `addPlay` adds `playXpForRun(score)` to `lifetimeXp` and `byGame[gameId]`.

### C. Recording hook (game over)

Game over already calls `useSessionStats().recordResult(gameId, score)`. At the
**same site(s)** (`components/shared/GameOverSummary.tsx` /
`GameShellWindow.tsx`, and the per-game engines that record results — verified
during exploration), also call `usePlayXp().addPlay(gameId, score)`.

`session-stats` (in-memory, per-session) is left as-is; `play-xp` is the
persisted lifetime accumulator. The two stay decoupled.

### D. Profile display

- `PlayerProfileBody.tsx`: when the viewed address **is the connected wallet**,
  call `computeLevel(stats, { playXp: lifetimeXp, bestStreak })`; otherwise call
  `computeLevel(stats)` (derived-only — unchanged from today).
- New component `components/player/LevelHero.tsx`: large Level + current title +
  XP progress bar + "Next: «Title» @ Lv N" line. For the **own profile** it also
  shows a small XP breakdown (on-chain base / play / streak) for transparency.
- `LevelBadge.tsx` is kept for compact contexts; `LevelHero` is the profile hero.
- `bestStreak` is read from the existing `daily-challenge` store.

### Titles (v1 cosmetic)

Keep the 5 existing bands (names unchanged so `level.test.ts` title assertions
stay green) and add 2 intermediate bands for denser unlocks:

| Level | Title (existing names kept) |
|------:|------------------------------|
| 1     | Rookie |
| 5     | Player |
| 10    | Pro |
| 15    | *(new band — e.g. Pro II / "Sharpshooter")* |
| 20    | Veteran |
| 25    | *(new band — e.g. Elite)* |
| 30    | Arcade Legend |

The exact new-band labels are finalized in the plan; the constraint is **do not
rename the existing 5** (1/5/10/20/30 stay as Rookie/Player/Pro/Veteran/Arcade
Legend).

## 3. Data flow

```
game over ──> session-stats.recordResult(gameId, score)   (existing, in-memory)
         └──> play-xp.addPlay(gameId, score)               (new, persisted)

daily challenge complete ──> daily-challenge.bestStreak    (existing)

profile render:
  address === connectedWallet ?
    computeLevel(stats, { playXp: lifetimeXp, bestStreak })   // hybrid
  : computeLevel(stats)                                       // derived-only
```

## 4. Testing

- `lib/level.test.ts` — keep all existing; add: `opts.playXp`/`opts.bestStreak`
  raise XP/level; `computeLevel(stats)` with no opts is unchanged (backward
  compat); `nextTitleUnlock` boundaries incl. top-tier `null`.
- `state/play-xp.test.ts` — `playXpForRun` formula incl. score=0 and clamping;
  `addPlay` accumulates into `lifetimeXp` + `byGame`; `reset`.
- `components/player/LevelHero.test.tsx` — renders level, title, next-unlock,
  breakdown for own profile; progressbar a11y attributes.

## 5. Edge cases & non-goals

- **Tamper:** local play XP can be edited in localStorage. Accepted — titles are
  cosmetic, no money is attached. Not worth anti-cheat scope.
- **Other players' profiles** show base (on-chain) XP only; their local
  play/streak bonus is not available to us. `nextTitleUnlock` still works.
- **No contract change.** Clarity / mainnet untouched (honors the v1 constraint).
- **Out of scope (v2):** level-up toast, taskbar Level badge, titles on the
  leaderboard, theme/cursor/avatar-frame unlocks gated by level.

## 6. Files touched

- `lib/level.ts` — extend `computeLevel`, add `STREAK_XP`, `nextTitleUnlock`,
  expand title bands.
- `state/play-xp.ts` — NEW persisted store + `playXpForRun`.
- Game-over recording site(s) — add `addPlay` call alongside `recordResult`.
- `components/player/LevelHero.tsx` — NEW hero component.
- `components/player/PlayerProfileBody.tsx` — wire hybrid for own profile, render
  `LevelHero`.
- Tests as listed in §4.
