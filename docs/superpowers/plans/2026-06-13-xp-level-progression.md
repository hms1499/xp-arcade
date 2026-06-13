# XP / Level Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a derived, cosmetic player Level + XP progression to the Player Profile header, computed client-side from existing on-chain Score NFTs.

**Architecture:** A pure `lib/level.ts` module (XP curve + level/title math) feeds a presentational `LevelBadge` component, rendered inside the existing `ProfileHeader` in `PlayerProfileBody`. XP = `stats.totalScore`. No contract change.

**Tech Stack:** TypeScript, React 19, Next.js, Vitest (jsdom, `renderToStaticMarkup` for component tests).

---

## File Structure

- `frontend/lib/level.ts` — **create**. Pure XP/level math. One responsibility: turn `PlayerStats` into a `LevelInfo`.
- `frontend/lib/level.test.ts` — **create**. Unit tests for the curve + titles + `computeLevel`.
- `frontend/components/player/LevelBadge.tsx` — **create**. Presentational chip + title + a11y XP bar.
- `frontend/components/player/LevelBadge.test.tsx` — **create**. Render assertions.
- `frontend/components/player/PlayerProfileBody.tsx` — **modify**. Imports + a `levelInfo` prop on the local `ProfileHeader` + one `<LevelBadge>` render + pass `computeLevel(stats)` at the call site.

Reference (do not modify): `frontend/lib/player-stats.ts` (`PlayerStats`, field `totalScore`), `frontend/lib/holdings.ts` (`ScoreNft`). Pattern reference: `frontend/lib/achievements.ts` + `frontend/components/player/AchievementsPanel.tsx` (the a11y progressbar markup).

---

## Task 1: Pure XP/level module

**Files:**
- Create: `frontend/lib/level.ts`
- Test: `frontend/lib/level.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/level.test.ts`:

```tsx
import { describe, it, expect } from "vitest";
import { computePlayerStats } from "@/lib/player-stats";
import type { ScoreNft } from "@/lib/holdings";
import {
  XP_BASE,
  cumulativeXpToReach,
  levelForXp,
  levelTitle,
  computeLevel,
} from "@/lib/level";

function statsWithScore(total: number) {
  const nft: ScoreNft = {
    id: 1,
    gameId: "snake",
    image: "",
    name: "Snake",
    season: 1,
    score: total,
  };
  return computePlayerStats([nft]);
}

describe("xp/level curve", () => {
  it("XP_BASE is 100", () => {
    expect(XP_BASE).toBe(100);
  });

  it("cumulativeXpToReach follows 100*(L-1)^2", () => {
    expect(cumulativeXpToReach(1)).toBe(0);
    expect(cumulativeXpToReach(5)).toBe(1600);
    expect(cumulativeXpToReach(10)).toBe(8100);
  });

  it("levelForXp maps xp to level at the right boundaries", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(1599)).toBe(4);
    expect(levelForXp(1600)).toBe(5);
    expect(levelForXp(8100)).toBe(10);
  });

  it("levelForXp clamps non-positive xp to level 1", () => {
    expect(levelForXp(-50)).toBe(1);
  });

  it("levelTitle bands", () => {
    expect(levelTitle(1)).toBe("Rookie");
    expect(levelTitle(4)).toBe("Rookie");
    expect(levelTitle(5)).toBe("Player");
    expect(levelTitle(10)).toBe("Pro");
    expect(levelTitle(20)).toBe("Veteran");
    expect(levelTitle(30)).toBe("Arcade Legend");
    expect(levelTitle(100)).toBe("Arcade Legend");
  });
});

describe("computeLevel", () => {
  it("derives level info from totalScore", () => {
    const info = computeLevel(statsWithScore(8100));
    expect(info.xp).toBe(8100);
    expect(info.level).toBe(10);
    expect(info.title).toBe("Pro");
    expect(info.xpIntoLevel).toBe(0);
    expect(info.xpForNextLevel).toBe(1900); // cum(11)-cum(10) = 10000-8100
    expect(info.progress).toBe(0);
  });

  it("mid-level progress is between 0 and 1 with a positive denominator", () => {
    const info = computeLevel(statsWithScore(9340)); // level 10, 1240 into 1900
    expect(info.level).toBe(10);
    expect(info.xpIntoLevel).toBe(1240);
    expect(info.xpForNextLevel).toBe(1900);
    expect(info.xpForNextLevel).toBeGreaterThan(0);
    expect(info.progress).toBeCloseTo(1240 / 1900, 6);
  });

  it("zero score is level 1 at 0 progress", () => {
    const info = computeLevel(statsWithScore(0));
    expect(info.level).toBe(1);
    expect(info.xpIntoLevel).toBe(0);
    expect(info.progress).toBe(0);
    expect(info.xpForNextLevel).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/level.test.ts`
Expected: FAIL — cannot resolve module `@/lib/level`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/lib/level.ts`:

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

export function cumulativeXpToReach(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return XP_BASE * (l - 1) ** 2;
}

export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  return Math.floor(Math.sqrt(xp / XP_BASE)) + 1;
}

export function levelTitle(level: number): string {
  if (level >= 30) return "Arcade Legend";
  if (level >= 20) return "Veteran";
  if (level >= 10) return "Pro";
  if (level >= 5) return "Player";
  return "Rookie";
}

export function computeLevel(stats: PlayerStats): LevelInfo {
  const xp = Math.max(0, stats.totalScore);
  const level = levelForXp(xp);
  const base = cumulativeXpToReach(level);
  const xpForNextLevel = cumulativeXpToReach(level + 1) - base; // = XP_BASE*(2*level-1) > 0
  const xpIntoLevel = xp - base;
  return {
    level,
    title: levelTitle(level),
    xp,
    xpIntoLevel,
    xpForNextLevel,
    progress: xpIntoLevel / xpForNextLevel,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/level.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/level.ts frontend/lib/level.test.ts
git commit -m "feat(level): pure xp/level module"
```

---

## Task 2: LevelBadge component

**Files:**
- Create: `frontend/components/player/LevelBadge.tsx`
- Test: `frontend/components/player/LevelBadge.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/components/player/LevelBadge.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LevelBadge } from "./LevelBadge";
import type { LevelInfo } from "@/lib/level";

const info: LevelInfo = {
  level: 10,
  title: "Pro",
  xp: 9340,
  xpIntoLevel: 1240,
  xpForNextLevel: 1900,
  progress: 1240 / 1900,
};

describe("LevelBadge", () => {
  it("renders level number and title", () => {
    const html = renderToStaticMarkup(<LevelBadge info={info} />);
    expect(html).toContain("Lv 10");
    expect(html).toContain("Pro");
  });

  it("exposes XP as an accessible progressbar", () => {
    const html = renderToStaticMarkup(<LevelBadge info={info} />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="1240"');
    expect(html).toContain('aria-valuemax="1900"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run components/player/LevelBadge.test.tsx`
Expected: FAIL — cannot resolve `./LevelBadge`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/components/player/LevelBadge.tsx`:

```tsx
"use client";

import type { LevelInfo } from "@/lib/level";

export function LevelBadge({ info }: { info: LevelInfo }) {
  const pct = Math.max(0, Math.min(1, info.progress)) * 100;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
      <span
        className="text-[10px] font-bold"
        style={{
          border: "2px solid #000080",
          background: "#eef3ff",
          padding: "1px 5px",
          whiteSpace: "nowrap",
        }}
      >
        Lv {info.level}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="text-[10px] font-bold"
          style={{ display: "flex", justifyContent: "space-between", gap: 6 }}
        >
          <span>{info.title}</span>
          <span className="text-gray-600" style={{ fontWeight: "normal" }}>
            {info.xpIntoLevel.toLocaleString()} /{" "}
            {info.xpForNextLevel.toLocaleString()} XP
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`Level ${info.level} progress`}
          aria-valuenow={info.xpIntoLevel}
          aria-valuemin={0}
          aria-valuemax={info.xpForNextLevel}
          style={{ height: 4, background: "#c0c0c0", marginTop: 2 }}
        >
          <div
            aria-hidden
            style={{ height: "100%", width: `${pct}%`, background: "#000080" }}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run components/player/LevelBadge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/player/LevelBadge.tsx frontend/components/player/LevelBadge.test.tsx
git commit -m "feat(level): LevelBadge component"
```

---

## Task 3: Wire the level into the ProfileHeader

**Files:**
- Modify: `frontend/components/player/PlayerProfileBody.tsx`

This file contains a local `ProfileHeader` function and renders it once. We add the
imports, a `levelInfo` prop to `ProfileHeader`, the `<LevelBadge>` render, and pass
`computeLevel(stats)` at the call site.

- [ ] **Step 1: Add the imports**

In `frontend/components/player/PlayerProfileBody.tsx`, find this existing line
(added by the achievements feature):

```tsx
import { AchievementsPanel } from "./AchievementsPanel";
```

Add immediately below it:

```tsx
import { LevelBadge } from "./LevelBadge";
import { computeLevel, type LevelInfo } from "@/lib/level";
```

- [ ] **Step 2: Add the `levelInfo` prop to ProfileHeader**

Find the `ProfileHeader` function signature:

```tsx
function ProfileHeader({
  address,
  isOwnProfile,
  totalMints,
  bestScore,
  topGame,
  onOpenMyNfts,
}: {
  address: string;
  isOwnProfile: boolean;
  totalMints?: number;
  bestScore?: number;
  topGame: string | null;
  onOpenMyNfts?: () => void;
}) {
```

Replace it with (adds `levelInfo` to both the destructure and the type):

```tsx
function ProfileHeader({
  address,
  isOwnProfile,
  totalMints,
  bestScore,
  topGame,
  levelInfo,
  onOpenMyNfts,
}: {
  address: string;
  isOwnProfile: boolean;
  totalMints?: number;
  bestScore?: number;
  topGame: string | null;
  levelInfo?: LevelInfo | null;
  onOpenMyNfts?: () => void;
}) {
```

- [ ] **Step 3: Render the LevelBadge under the address**

Find this block inside `ProfileHeader`:

```tsx
      <p className="text-[10px] font-mono text-gray-700 mb-2 break-all">
        {address}
      </p>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <ProfileChip label="NFTs" value={totalMints ?? "..."} />
```

Insert the badge between the `</p>` and the chip `<div>`:

```tsx
      <p className="text-[10px] font-mono text-gray-700 mb-2 break-all">
        {address}
      </p>
      {levelInfo && <LevelBadge info={levelInfo} />}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <ProfileChip label="NFTs" value={totalMints ?? "..."} />
```

- [ ] **Step 4: Pass levelInfo at the call site**

Find the `<ProfileHeader ... />` call (near the top of the returned JSX):

```tsx
      <ProfileHeader
        address={address}
        isOwnProfile={walletAddress === address}
        totalMints={stats?.totalMints}
        bestScore={stats?.bestScore}
        topGame={stats ? topGameLabel(stats) : null}
        onOpenMyNfts={
```

Insert the `levelInfo` prop after the `topGame` line:

```tsx
      <ProfileHeader
        address={address}
        isOwnProfile={walletAddress === address}
        totalMints={stats?.totalMints}
        bestScore={stats?.bestScore}
        topGame={stats ? topGameLabel(stats) : null}
        levelInfo={stats ? computeLevel(stats) : null}
        onOpenMyNfts={
```

(`stats` may be null while loading, so guard with the ternary; `LevelBadge` only
renders when `levelInfo` is non-null.)

- [ ] **Step 5: Verify typecheck passes**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean (no output, exit 0).

- [ ] **Step 6: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/player/PlayerProfileBody.tsx
git commit -m "feat(profile): show player level in ProfileHeader"
```

---

## Task 4: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean, exit 0.

- [ ] **Step 2: Full test suite**

Run: `cd frontend && npm test`
Expected: all tests pass, including the new `level` and `LevelBadge` files. Read the
output and confirm both new test files appear and pass.

- [ ] **Step 3: Lint**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit (only if Steps 1-3 produced fixes)**

If any step required a fix, commit it:

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add -A
git commit -m "chore(level): typecheck + lint + full test pass"
```

If nothing changed, skip the commit. Do not claim done until all three commands are
green — paste their real output.

---

## Self-Review notes (for the implementer)

- **Spec coverage:** Task 1 = curve/titles/computeLevel §2 + module §3.1 + tests §5.1.
  Task 2 = component §3.2 + UI §4 + tests §5.2. Task 3 = wiring §3.3. Task 4 = verify §5.3.
- **Type consistency:** `LevelInfo` (fields `level`/`title`/`xp`/`xpIntoLevel`/
  `xpForNextLevel`/`progress`), `XP_BASE`, `cumulativeXpToReach`, `levelForXp`,
  `levelTitle`, `computeLevel` are identical across module, tests, component, and wiring.
- **No on-chain change:** nothing here touches `contract/` or any `.clar` file.
- **No division by zero:** `xpForNextLevel = XP_BASE*(2*level-1) ≥ 100` for level ≥ 1.
