# Achievement Badges (Milestone) — Design Spec

**Date:** 2026-06-13
**Status:** Approved design, ready for implementation plan
**Scope:** Frontend-only. **No contract change, no redeploy, no new mint.**

---

## 1. Summary

Add a derived **Milestone Achievement** system to the Player Profile. Badges are
computed 100% client-side from the Score NFTs a player already holds on-chain —
reusing the existing `computePlayerStats(nfts)` pipeline. Nothing is minted; the
contract (`xp-arcade-v4`) is untouched. Badges render as a new section inside
`PlayerProfileWindow`.

### Why derived (not on-chain)

- `xp-arcade-v4` is already deployed to mainnet; adding a badge NFT would require
  a v5 redeploy (deferred to the 2026-06-01 contest window) plus mint fees and
  new public functions + tests. Out of scope here.
- All needed signals (`totalMints`, per-game mints, `seasonsPlayed`) are already
  derived from on-chain Score NFTs via `lib/player-stats.ts`. No new data source.

---

## 2. Badge Catalog (Milestone only)

Seven badges, all derived from `PlayerStats`. Each has earned / locked state with
progress.

| id                | label           | icon | condition                                   | target            |
|-------------------|-----------------|------|---------------------------------------------|-------------------|
| `first-mint`      | First Mint      | 🥚   | `totalMints >= 1`                           | 1                 |
| `getting-started` | Getting Started | 🎮   | `totalMints >= 10`                          | 10                |
| `dedicated`       | Dedicated       | 🏅   | `totalMints >= 50`                          | 50                |
| `centurion`       | Centurion       | 💯   | `totalMints >= 100`                         | 100               |
| `arcade-complete` | Arcade Complete | 🕹️   | minted ≥1 in **every** game in `GAME_IDS`   | `GAME_IDS.length` |
| `seasoned`        | Seasoned        | 📅   | `seasonsPlayed >= 3`                         | 3                 |
| `veteran`         | Veteran         | 👑   | `seasonsPlayed >= 5`                         | 5                 |

Thresholds live in the catalog array only, so tuning touches one place.

**No unlock dates.** There is no on-chain unlock timestamp, so the UI must not
display an "earned on" date — earned state only.

---

## 3. Architecture

Pure logic separated from presentation, mirroring `lib/player-stats.ts`.

### 3.1 `frontend/lib/achievements.ts` (pure — no React, no I/O)

```ts
import type { PlayerStats } from "./player-stats";

export type Achievement = {
  id: string;          // "first-mint"
  label: string;       // "First Mint"
  icon: string;        // "🥚"
  description: string; // "Mint your first score NFT"
  target: number;      // 10
  progress: (s: PlayerStats) => number; // raw current value (uncapped)
};

export type EvaluatedAchievement = Achievement & {
  earned: boolean;     // current >= target
  current: number;     // min(progress(s), target)  — capped for display
};

export const ACHIEVEMENTS: Achievement[];                  // catalog of 7
export function evaluateAchievements(s: PlayerStats): EvaluatedAchievement[];
export function earnedCount(list: EvaluatedAchievement[]): number;
```

Rules:
- `arcade-complete` progress = count of `GAME_IDS` where `byGame[id].totalMints > 0`;
  target = `GAME_IDS.length`.
- `earned = progress(s) >= target`; `current = Math.min(progress(s), target)`.
- Catalog is a single array; adding/editing a badge touches only this file.

### 3.2 `frontend/components/player/AchievementsPanel.tsx` (presentational)

- Props: `{ stats: PlayerStats }`. Calls `evaluateAchievements` internally.
- Does **not** fetch — consumes the `stats` the parent already computed (single
  source of truth).
- Header: `Achievements (earned/total)`.

### 3.3 Wiring — `frontend/components/player/PlayerProfileBody.tsx`

- Add `<AchievementsPanel stats={stats} />` immediately after `<RarityBreakdown …/>`,
  inside the existing `stats && nfts && nfts.length > 0` block.
- Pass the **global** `stats` (not `filteredStats`): badges reflect total career
  achievement, independent of the per-game filter selection. One-line change; no
  edits to fetch/filter logic.

---

## 4. UI (Windows-95 style)

Match existing panels (`#f5f5f0` bg, `#d0d0c8` border, Pixelated MS Sans Serif).

```
Achievements (4/7)
[🥚✓] [🎮✓] [🏅✓] [🕹️✓]   earned: full-color icon, navy border, ✓
[💯  ] [📅  ] [👑  ]        locked: grayscale icon + progress bar
 47/100  2/3   4/5
```

- **Earned:** full-color icon, border `#000080`, ✓ marker, tooltip = description.
- **Locked:** grayscale icon, thin progress bar (`current/target`), tooltip =
  description + `Progress: x/y`.
- Responsive grid like `RarityBreakdown` (2–4 columns).
- No new dependencies, no images — emoji + CSS only.

---

## 5. Testing (TDD — tests first)

### 5.1 `frontend/lib/achievements.test.ts` (Vitest, core)

- Empty player (0 NFTs) → 0 earned; every badge `current = 0`.
- `totalMints` boundaries 1 / 10 / 50 / 100 → correct badge flips to earned.
- All `GAME_IDS` minted → `arcade-complete` earned; missing one game → locked
  with `current = GAME_IDS.length - 1`.
- `seasonsPlayed` boundaries 3 and 5.
- `current` capped at `target` (47 → 47; 150 mints → Centurion `current = 100`).
- `earnedCount` returns the correct total.

### 5.2 `frontend/components/player/AchievementsPanel.test.tsx`

- Renders header `(earned/total)`.
- Renders the correct count of earned vs locked nodes.
- (Follow the existing component-test pattern if one exists; otherwise a minimal
  render assertion.)

### 5.3 Verify before claiming done

```bash
cd frontend && npx tsc --noEmit && npm test && npm run lint
```
Read the real output before reporting complete (per CLAUDE.md).

---

## 6. Granular task breakdown (one clean commit each)

1. `test(achievements): catalog evaluation unit tests` — write `achievements.test.ts`
   against the (not-yet-existing) module API; tests red.
2. `feat(achievements): pure milestone catalog + evaluation` — add
   `lib/achievements.ts` (catalog + `evaluateAchievements` + `earnedCount`); tests green.
3. `feat(achievements): AchievementsPanel component` — presentational panel,
   earned/locked styling, progress bars; add its render test.
4. `feat(profile): surface achievements in PlayerProfileWindow` — one-line wire of
   `<AchievementsPanel>` into `PlayerProfileBody` after `RarityBreakdown`.
5. `chore(achievements): typecheck + lint + full test pass` — run the verify
   command, fix any fallout, confirm green output.

Each step ends green and is committed independently (per the user's incremental-commit
preference; staged with explicit file paths; no auto-push).

---

## 7. Out of scope (explicit)

- On-chain badge NFT / contract changes / redeploy.
- Skill / Competitive / Collector badge categories.
- Surfacing badges anywhere other than the Player Profile window (no toast, no
  Hall of Fame, no share card).
- Unlock timestamps.
