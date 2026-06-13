# XP / Level Meta-Progression — Design Spec

**Date:** 2026-06-13
**Status:** Approved design, ready for implementation plan
**Scope:** Frontend-only. **No contract change, no redeploy, no new mint.**

---

## 1. Summary

Add a derived **player Level** with XP progression to the Player Profile, computed
client-side from the Score NFTs a player already holds — reusing the existing
`computePlayerStats(nfts)` pipeline (same approach as the Achievement Badges
feature shipped earlier today). Purely cosmetic: a level number, a band title, and
an XP progress bar. Nothing is minted; the contract (`xp-arcade-v4`) is untouched.
On-brand for "XP Arcade", which today only uses "XP" as branding.

### Why derived + cosmetic

- `xp-arcade-v4` is deployed to mainnet; granting level-based perks (fee discounts,
  extra mints, boosts) would require a v5 redeploy plus anti-cheat, since scores are
  client-trusted and tied to real STX. Out of scope here — explicitly deferred.
- All needed signals are already derived from on-chain Score NFTs via
  `lib/player-stats.ts` (`totalScore`). No new data source.

---

## 2. XP & Level curve

- **XP** = `stats.totalScore` (sum of every minted Score NFT's score).
- **Everyone starts at Level 1** (0 XP).
- **Cumulative XP to reach level L:** `cumXP(L) = XP_BASE * (L - 1)^2`, `XP_BASE = 100`.
- **Inverse:** `level = floor(sqrt(xp / XP_BASE)) + 1`, clamped to a minimum of 1
  (xp ≤ 0 → level 1).

| Level | Cumulative XP |
|---|---|
| 1 | 0 |
| 5 | 1,600 |
| 10 | 8,100 |
| 20 | 36,100 |
| 30 | 84,100 |

Casual player (totalScore 1,000) → Level 4; active (8,000) → Level 10.

### Titles (level bands)

| Band | Title |
|---|---|
| 1–4 | Rookie |
| 5–9 | Player |
| 10–19 | Pro |
| 20–29 | Veteran |
| 30+ | Arcade Legend |

No hard level cap; the title saturates at "Arcade Legend".

### Within-level progress

- `xpIntoLevel = xp - cumXP(level)`
- `xpForNextLevel = cumXP(level + 1) - cumXP(level)` = `XP_BASE * (2*level - 1)`,
  always > 0 (no division by zero).
- `progress = xpIntoLevel / xpForNextLevel` (0..1).

---

## 3. Architecture

Pure logic separated from presentation, mirroring `lib/achievements.ts`.

### 3.1 `frontend/lib/level.ts` (pure — no React, no IO)

```ts
import type { PlayerStats } from "./player-stats";

export type LevelInfo = {
  level: number;          // 1+
  title: string;          // "Pro"
  xp: number;             // = stats.totalScore
  xpIntoLevel: number;    // xp - cumXP(level)
  xpForNextLevel: number; // cumXP(level+1) - cumXP(level), always > 0
  progress: number;       // 0..1
};

export const XP_BASE = 100;

export function cumulativeXpToReach(level: number): number; // XP_BASE * (level-1)^2
export function levelForXp(xp: number): number;             // floor(sqrt(xp/XP_BASE))+1, min 1
export function levelTitle(level: number): string;          // band → title
export function computeLevel(stats: PlayerStats): LevelInfo; // xp = stats.totalScore
```

- All tunables (base, band thresholds, titles) live in this one file.
- `level` clamped to a minimum of 1.

### 3.2 `frontend/components/player/LevelBadge.tsx` (presentational)

- Props: `{ info: LevelInfo }`.
- Renders an `Lv N` chip + title + an XP progress bar. Does **not** fetch or compute
  — consumes `info` only.
- Progress bar carries `role="progressbar"`, `aria-valuenow={info.xpIntoLevel}`,
  `aria-valuemin={0}`, `aria-valuemax={info.xpForNextLevel}`, and an `aria-label`
  (reusing the a11y pattern from `AchievementsPanel`).

### 3.3 Wiring — `frontend/components/player/PlayerProfileBody.tsx`

- Compute `const levelInfo = computeLevel(stats)` next to the existing `stats`
  (inside the `stats && nfts && nfts.length > 0` block).
- The local `ProfileHeader` function gains an optional prop `levelInfo?: LevelInfo`
  and renders `<LevelBadge info={levelInfo} />` directly under the address line and
  above the existing chip row (NFTs / Best / Top game).
- Pass the **global** `stats` (not `filteredStats`) — level reflects total career,
  independent of the game filter.

---

## 4. UI (Windows-95 style)

Placed in `ProfileHeader`, under the address, above the chip row.

```
Player SP3J8…WJXZ            [My NFTs][Copy]
SP3J8Q518WFY3B7VTACP0N180Q2VA4MSFFA3HWJXZ
[Lv 10] Pro
▓▓▓▓▓▓░░░░  1,240 / 1,900 XP
[NFTs 12] [Best 278] [Top game Pac-Man]
```

- `Lv N` chip: navy border `#000080`, background `#eef3ff` (matches earned-badge style).
- Title (`Pro`) bold, small, beside the chip.
- XP bar: track `#c0c0c0`, fill `#000080`, width = `progress * 100%`.
- Text `{xpIntoLevel} / {xpForNextLevel} XP` using `toLocaleString()` for thousands
  separators.
- No new dependencies, no images.

---

## 5. Testing (TDD — tests first)

### 5.1 `frontend/lib/level.test.ts` (Vitest, core)

- `levelForXp`: 0→1, 99→1, 100→2, 1599→4, 1600→5, 8100→10.
- `cumulativeXpToReach`: 1→0, 5→1600, 10→8100.
- `levelTitle`: 1→Rookie, 4→Rookie, 5→Player, 10→Pro, 20→Veteran, 30→Arcade Legend,
  100→Arcade Legend.
- `computeLevel` from `PlayerStats` (built via `computePlayerStats` from `ScoreNft`
  fixtures, same helper style as the achievements tests): asserts `level`, `title`,
  `xp` (= totalScore), `xpIntoLevel`, `xpForNextLevel`, `progress` (0..1). xp=0 →
  level 1, xpIntoLevel 0, progress 0.
- `xpForNextLevel > 0` at every tested level (no division by zero).

### 5.2 `frontend/components/player/LevelBadge.test.tsx`

Using `renderToStaticMarkup` (repo pattern, not React Testing Library):
- Renders `Lv 10` and title `Pro`.
- Contains `role="progressbar"` with the expected `aria-valuenow` / `aria-valuemax`.

### 5.3 Verify before claiming done

```bash
cd frontend && npx tsc --noEmit && npm test && npm run lint
```
Read the real output before reporting complete (per CLAUDE.md).

---

## 6. Granular task breakdown (one clean commit each)

1. `test(level): xp/level curve unit tests` — write `level.test.ts` against the
   (not-yet-existing) module API; tests red.
2. `feat(level): pure xp/level module` — add `lib/level.ts` (`XP_BASE`,
   `cumulativeXpToReach`, `levelForXp`, `levelTitle`, `computeLevel`); tests green.
3. `feat(level): LevelBadge component` — presentational chip + title + a11y XP bar;
   add its render test.
4. `feat(profile): show player level in ProfileHeader` — compute `levelInfo` in
   `PlayerProfileBody`, pass to `ProfileHeader`, render `<LevelBadge>` under the
   address.
5. `chore(level): typecheck + lint + full test pass` — run the verify command, fix
   any fallout, confirm green output.

Each step ends green and is committed independently (per the user's
incremental-commit preference; staged with explicit file paths; no auto-push).

---

## 7. Out of scope (explicit)

- On-chain level / contract changes / redeploy.
- Level-based perks of any kind (fee discounts, extra mints, boosts).
- Cosmetic unlocks gated by level (rare titles, NFT frame colors, themes).
- Surfacing level anywhere other than the Player Profile header (no Hall of Fame,
  no taskbar/tray, no share card).
- Hard level cap.
