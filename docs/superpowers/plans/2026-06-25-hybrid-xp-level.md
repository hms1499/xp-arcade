# Hybrid XP / Level Meta-Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the existing derived-only level system into a hybrid one (on-chain base XP + local play-bonus XP + daily-streak bonus), surfaced on the Player profile with a Level hero, XP bar, current title, and next-title unlock.

**Architecture:** Additive on top of the existing `lib/level.ts` — `totalScore` stays the XP base, so no existing level resets and the existing curve/tests stay green. A new persisted `state/play-xp.ts` store accumulates lifetime play XP; a small `lib/record-run.ts` helper funnels every finished run into the three client-side stat stores from the single `useGameSession` chokepoint. The profile reads play XP + best streak only for the connected user's own profile (others stay derived-only) and renders a new `LevelHero` component.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Zustand 5 (+ `persist` middleware), Vitest 3. Component tests use `renderToStaticMarkup` (the project does NOT use @testing-library). Store tests use `getState()` directly against jsdom `localStorage`.

## Global Constraints

- **Frontend-only. No contract / mainnet / `@stacks/connect` changes.**
- **Run all commands from `frontend/`.** Path must not contain spaces (Vitest breaks on `%20`).
- **Additive only:** `computeLevel(stats)` with no second argument must remain byte-for-byte the old behavior; existing `lib/level.test.ts` assertions must stay green.
- **Do not rename the existing 5 title bands** (level 1/5/10/20/30 = Rookie/Player/Pro/Veteran/Arcade Legend). New intermediate bands are added at level 15 (`Ace`) and 25 (`Master`).
- **Constants** (tunable, defined once): `STREAK_XP = 50` (XP per best-streak day, in `lib/level.ts`); `PLAY_FINISH_XP = 10`, `PLAY_SCORE_DIVISOR = 25` (in `state/play-xp.ts`).
- **Persisted store key:** `xp-arcade-play-xp` (zustand `persist`, mirroring `state/desktop-theme.ts`).
- Commit conventions: conventional prefix, stage explicit files, **no `Co-Authored-By`**. Small green commits.
- Cosmetic scope v1 = **titles only**. Display surface v1 = **Player profile only**. (Level-up toast, taskbar badge, leaderboard titles, theme/cursor unlocks → v2; do not build them.)

## File Structure

- `lib/level.ts` — MODIFY. XP formula, title bands (data-driven), `nextTitleUnlock`, `resolveProfileLevel`. Pure, no React.
- `lib/level.test.ts` — MODIFY. Add hybrid/title/resolve tests; keep existing.
- `state/play-xp.ts` — CREATE. Persisted lifetime play-XP store + `playXpForRun`.
- `state/play-xp.test.ts` — CREATE.
- `lib/record-run.ts` — CREATE. `recordFinishedRun(gameId, score)` — funnels a finished run into the three stat stores.
- `lib/record-run.test.ts` — CREATE.
- `hooks/useGameSession.ts` — MODIFY. Replace the three inline `.getState()` stat calls with `recordFinishedRun`.
- `components/player/LevelHero.tsx` — CREATE. Profile hero (level, title, XP bar, next-unlock, optional breakdown).
- `components/player/LevelHero.test.tsx` — CREATE.
- `components/player/PlayerProfileBody.tsx` — MODIFY. Resolve hybrid level for own profile; render `LevelHero` instead of `LevelBadge`.

`components/player/LevelBadge.tsx` is intentionally kept (reusable compact badge for v2 surfaces) — do not delete it.

---

### Task 1: XP formula, title bands, `nextTitleUnlock`, `resolveProfileLevel` (lib/level.ts)

**Files:**
- Modify: `frontend/lib/level.ts`
- Test: `frontend/lib/level.test.ts`

**Interfaces:**
- Consumes: `PlayerStats` from `@/lib/player-stats` (has `totalScore: number`).
- Produces:
  - `type LevelInfo` (unchanged shape: `{ level, title, xp, xpIntoLevel, xpForNextLevel, progress }`)
  - `type XpBreakdown = { base: number; play: number; streak: number }`
  - `const STREAK_XP = 50`
  - `function computeLevel(stats: PlayerStats, opts?: { playXp?: number; bestStreak?: number }): LevelInfo`
  - `function nextTitleUnlock(level: number): { title: string; atLevel: number } | null`
  - `function resolveProfileLevel(args: { stats: PlayerStats; isOwnProfile: boolean; playXp: number; bestStreak: number }): { info: LevelInfo; breakdown: XpBreakdown | null }`
  - (kept) `XP_BASE`, `cumulativeXpToReach`, `levelForXp`, `levelTitle`

- [ ] **Step 1: Write the failing tests**

In `frontend/lib/level.test.ts`, extend the import and append three `describe` blocks. Change the import block at the top to:

```ts
import {
  XP_BASE,
  STREAK_XP,
  cumulativeXpToReach,
  levelForXp,
  levelTitle,
  nextTitleUnlock,
  computeLevel,
  resolveProfileLevel,
} from "@/lib/level";
```

Append at the end of the file:

```ts
describe("hybrid xp via opts", () => {
  it("adds playXp and streak bonus on top of base totalScore", () => {
    const info = computeLevel(statsWithScore(100), { playXp: 0, bestStreak: 1 });
    expect(info.xp).toBe(100 + STREAK_XP);
  });

  it("playXp alone can raise the level above base", () => {
    expect(computeLevel(statsWithScore(0)).level).toBe(1);
    const boosted = computeLevel(statsWithScore(0), { playXp: 8100 });
    expect(boosted.xp).toBe(8100);
    expect(boosted.level).toBe(10);
  });

  it("no opts is identical to base-only (backward compatible)", () => {
    expect(computeLevel(statsWithScore(8100), {})).toEqual(
      computeLevel(statsWithScore(8100)),
    );
  });

  it("clamps negative bonuses to zero", () => {
    const info = computeLevel(statsWithScore(0), { playXp: -100, bestStreak: -5 });
    expect(info.xp).toBe(0);
    expect(info.level).toBe(1);
  });
});

describe("nextTitleUnlock", () => {
  it("returns the next band above the current level", () => {
    expect(nextTitleUnlock(1)).toEqual({ title: "Player", atLevel: 5 });
    expect(nextTitleUnlock(5)).toEqual({ title: "Pro", atLevel: 10 });
    expect(nextTitleUnlock(12)).toEqual({ title: "Ace", atLevel: 15 });
    expect(nextTitleUnlock(20)).toEqual({ title: "Master", atLevel: 25 });
  });

  it("returns null at or beyond the top band", () => {
    expect(nextTitleUnlock(30)).toBeNull();
    expect(nextTitleUnlock(45)).toBeNull();
  });
});

describe("resolveProfileLevel", () => {
  it("other player: base-only XP, no breakdown", () => {
    const r = resolveProfileLevel({
      stats: statsWithScore(8100),
      isOwnProfile: false,
      playXp: 5000,
      bestStreak: 10,
    });
    expect(r.breakdown).toBeNull();
    expect(r.info.xp).toBe(8100);
  });

  it("own profile: folds in play + streak and returns the breakdown", () => {
    const r = resolveProfileLevel({
      stats: statsWithScore(100),
      isOwnProfile: true,
      playXp: 200,
      bestStreak: 2,
    });
    expect(r.breakdown).toEqual({ base: 100, play: 200, streak: 2 * STREAK_XP });
    expect(r.info.xp).toBe(100 + 200 + 2 * STREAK_XP);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/level.test.ts`
Expected: FAIL — `STREAK_XP`, `nextTitleUnlock`, `resolveProfileLevel` are not exported.

- [ ] **Step 3: Rewrite `lib/level.ts`**

Replace the entire contents of `frontend/lib/level.ts` with:

```ts
import type { PlayerStats } from "./player-stats";

export type LevelInfo = {
  level: number;          // 1+
  title: string;          // "Pro"
  xp: number;             // base + play + streak bonus
  xpIntoLevel: number;    // xp - cumXP(level)
  xpForNextLevel: number; // cumXP(level+1) - cumXP(level), always > 0
  progress: number;       // 0..1
};

/** How total profile XP splits across its three sources (own profile only). */
export type XpBreakdown = { base: number; play: number; streak: number };

export const XP_BASE = 100;
/** XP granted per best-streak day from the daily challenge. */
export const STREAK_XP = 50;

/**
 * Title bands in ascending level order. `levelTitle` and `nextTitleUnlock` both
 * derive from this single source so they can never drift. The level 1/5/10/20/30
 * bands are the original names and must not be renamed; 15 (Ace) and 25 (Master)
 * are intermediate unlocks added for denser progression.
 */
export const TITLE_BANDS: { level: number; title: string }[] = [
  { level: 1, title: "Rookie" },
  { level: 5, title: "Player" },
  { level: 10, title: "Pro" },
  { level: 15, title: "Ace" },
  { level: 20, title: "Veteran" },
  { level: 25, title: "Master" },
  { level: 30, title: "Arcade Legend" },
];

export function cumulativeXpToReach(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return XP_BASE * (l - 1) ** 2;
}

export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  return Math.floor(Math.sqrt(xp / XP_BASE)) + 1;
}

export function levelTitle(level: number): string {
  let title = TITLE_BANDS[0].title;
  for (const band of TITLE_BANDS) {
    if (level >= band.level) title = band.title;
  }
  return title;
}

/** The next title the player will unlock, or null if already at the top band. */
export function nextTitleUnlock(
  level: number,
): { title: string; atLevel: number } | null {
  for (const band of TITLE_BANDS) {
    if (band.level > level) return { title: band.title, atLevel: band.level };
  }
  return null;
}

export function computeLevel(
  stats: PlayerStats,
  opts?: { playXp?: number; bestStreak?: number },
): LevelInfo {
  const base = Math.max(0, stats.totalScore);
  const play = Math.max(0, opts?.playXp ?? 0);
  const streak = Math.max(0, opts?.bestStreak ?? 0) * STREAK_XP;
  const xp = base + play + streak;
  const level = levelForXp(xp);
  const reached = cumulativeXpToReach(level);
  const xpForNextLevel = cumulativeXpToReach(level + 1) - reached;
  const xpIntoLevel = xp - reached;
  return {
    level,
    title: levelTitle(level),
    xp,
    xpIntoLevel,
    xpForNextLevel,
    progress: xpIntoLevel / xpForNextLevel,
  };
}

/**
 * Resolve the level info for a profile view. The connected user's own profile
 * folds in local play XP + daily-streak bonus and returns a breakdown; every
 * other player shows base (on-chain) XP only, with a null breakdown.
 */
export function resolveProfileLevel(args: {
  stats: PlayerStats;
  isOwnProfile: boolean;
  playXp: number;
  bestStreak: number;
}): { info: LevelInfo; breakdown: XpBreakdown | null } {
  const { stats, isOwnProfile, playXp, bestStreak } = args;
  if (!isOwnProfile) {
    return { info: computeLevel(stats), breakdown: null };
  }
  const info = computeLevel(stats, { playXp, bestStreak });
  const breakdown: XpBreakdown = {
    base: Math.max(0, stats.totalScore),
    play: Math.max(0, playXp),
    streak: Math.max(0, bestStreak) * STREAK_XP,
  };
  return { info, breakdown };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/level.test.ts`
Expected: PASS — all existing tests plus the new `hybrid xp`, `nextTitleUnlock`, `resolveProfileLevel` blocks.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` (expected: clean)

```bash
git add frontend/lib/level.ts frontend/lib/level.test.ts
git commit -m "feat(level): hybrid XP opts, data-driven titles, next-unlock + profile resolver"
```

---

### Task 2: Persisted play-XP store (state/play-xp.ts)

**Files:**
- Create: `frontend/state/play-xp.ts`
- Test: `frontend/state/play-xp.test.ts`

**Interfaces:**
- Consumes: `GAME_IDS`, `GameId` from `@/lib/game-registry`.
- Produces:
  - `const PLAY_FINISH_XP = 10`
  - `function playXpForRun(score: number): number`
  - `usePlayXp` Zustand store with state `{ lifetimeXp: number; byGame: Record<GameId, number>; addPlay(gameId: GameId, score: number): void; reset(): void }`

- [ ] **Step 1: Write the failing test**

Create `frontend/state/play-xp.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { usePlayXp, playXpForRun, PLAY_FINISH_XP } from "./play-xp";

describe("playXpForRun", () => {
  it("is the flat finish reward at score 0", () => {
    expect(playXpForRun(0)).toBe(PLAY_FINISH_XP);
  });

  it("adds floor(score / 25) on top of the finish reward", () => {
    expect(playXpForRun(25)).toBe(PLAY_FINISH_XP + 1);
    expect(playXpForRun(250)).toBe(PLAY_FINISH_XP + 10);
  });

  it("clamps a negative score to the flat reward", () => {
    expect(playXpForRun(-99)).toBe(PLAY_FINISH_XP);
  });
});

describe("usePlayXp store", () => {
  beforeEach(() => {
    localStorage.clear();
    usePlayXp.getState().reset();
  });

  it("accumulates lifetime and per-game XP", () => {
    usePlayXp.getState().addPlay("snake", 0); // +10
    usePlayXp.getState().addPlay("snake", 250); // +20
    usePlayXp.getState().addPlay("tetris", 0); // +10
    const s = usePlayXp.getState();
    expect(s.lifetimeXp).toBe(40);
    expect(s.byGame.snake).toBe(30);
    expect(s.byGame.tetris).toBe(10);
  });

  it("persists lifetime XP under the xp-arcade-play-xp key", () => {
    usePlayXp.getState().addPlay("snake", 250); // +20
    expect(localStorage.getItem("xp-arcade-play-xp")).toContain(
      '"lifetimeXp":20',
    );
  });

  it("reset clears lifetime and per-game XP", () => {
    usePlayXp.getState().addPlay("snake", 100);
    usePlayXp.getState().reset();
    expect(usePlayXp.getState().lifetimeXp).toBe(0);
    expect(usePlayXp.getState().byGame.snake).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run state/play-xp.test.ts`
Expected: FAIL — cannot resolve `./play-xp`.

- [ ] **Step 3: Write the implementation**

Create `frontend/state/play-xp.ts`:

```ts
"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { GAME_IDS, type GameId } from "@/lib/game-registry";

/** Flat XP for finishing any run, mint or not. */
export const PLAY_FINISH_XP = 10;
/** Each PLAY_SCORE_DIVISOR points of score adds 1 XP. Score is capped at
 *  MAX-SCORE (u9999) on-chain, so this stays bounded. */
export const PLAY_SCORE_DIVISOR = 25;

export function playXpForRun(score: number): number {
  const s = Math.max(0, Math.floor(score));
  return PLAY_FINISH_XP + Math.floor(s / PLAY_SCORE_DIVISOR);
}

function emptyByGame(): Record<GameId, number> {
  return Object.fromEntries(GAME_IDS.map((id) => [id, 0])) as Record<
    GameId,
    number
  >;
}

type PlayXpState = {
  lifetimeXp: number;
  byGame: Record<GameId, number>;
  addPlay: (gameId: GameId, score: number) => void;
  reset: () => void;
};

export const usePlayXp = create<PlayXpState>()(
  persist(
    (set) => ({
      lifetimeXp: 0,
      byGame: emptyByGame(),
      addPlay: (gameId, score) =>
        set((s) => {
          const gained = playXpForRun(score);
          return {
            lifetimeXp: s.lifetimeXp + gained,
            byGame: { ...s.byGame, [gameId]: (s.byGame[gameId] ?? 0) + gained },
          };
        }),
      reset: () => set({ lifetimeXp: 0, byGame: emptyByGame() }),
    }),
    {
      name: "xp-arcade-play-xp",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        lifetimeXp: state.lifetimeXp,
        byGame: state.byGame,
      }),
      // Backfill any games added since the data was persisted, so byGame[id]
      // is never undefined.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PlayXpState>;
        return {
          ...current,
          lifetimeXp: typeof p.lifetimeXp === "number" ? p.lifetimeXp : 0,
          byGame: { ...emptyByGame(), ...(p.byGame ?? {}) },
        };
      },
    },
  ),
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run state/play-xp.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` (expected: clean)

```bash
git add frontend/state/play-xp.ts frontend/state/play-xp.test.ts
git commit -m "feat(xp): persisted play-XP store accruing XP per finished run"
```

---

### Task 3: `recordFinishedRun` helper + wire into useGameSession

**Files:**
- Create: `frontend/lib/record-run.ts`
- Test: `frontend/lib/record-run.test.ts`
- Modify: `frontend/hooks/useGameSession.ts:37-38`

**Interfaces:**
- Consumes: `useSessionStats` (`@/state/session-stats`), `useDailyChallenge` (`@/state/daily-challenge`), `usePlayXp` (`@/state/play-xp`, Task 2).
- Produces: `function recordFinishedRun(gameId: GameId, score: number): void` — records one finished run into all three client-side stat stores.

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/record-run.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { recordFinishedRun } from "./record-run";
import { usePlayXp } from "@/state/play-xp";
import { useSessionStats } from "@/state/session-stats";

describe("recordFinishedRun", () => {
  beforeEach(() => {
    localStorage.clear();
    usePlayXp.getState().reset();
    useSessionStats.getState().reset();
  });

  it("awards play XP and records the session run for the game", () => {
    recordFinishedRun("snake", 250); // playXpForRun(250) = 10 + floor(250/25) = 20

    expect(usePlayXp.getState().lifetimeXp).toBe(20);
    expect(usePlayXp.getState().byGame.snake).toBe(20);

    const session = useSessionStats.getState().byGame.snake;
    expect(session.runs).toBe(1);
    expect(session.lastScore).toBe(250);
    expect(session.bestScore).toBe(250);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/record-run.test.ts`
Expected: FAIL — cannot resolve `./record-run`.

- [ ] **Step 3: Write the implementation**

Create `frontend/lib/record-run.ts`:

```ts
import { type GameId } from "./game-registry";
import { useSessionStats } from "@/state/session-stats";
import { useDailyChallenge } from "@/state/daily-challenge";
import { usePlayXp } from "@/state/play-xp";

/**
 * Record a single finished run across every client-side stat store: the
 * in-memory session stats, the persisted lifetime play-XP, and the daily
 * challenge streak. Called from the one game-over chokepoint in useGameSession.
 */
export function recordFinishedRun(gameId: GameId, score: number): void {
  useSessionStats.getState().recordResult(gameId, score);
  usePlayXp.getState().addPlay(gameId, score);
  useDailyChallenge.getState().recordPlay(gameId, score);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/record-run.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Wire it into useGameSession**

In `frontend/hooks/useGameSession.ts`, replace the two stat-store imports and the two inline calls with the helper.

Change the imports (currently lines 6-7):

```ts
import { useSessionStats } from "@/state/session-stats";
import { useDailyChallenge } from "@/state/daily-challenge";
```

to:

```ts
import { recordFinishedRun } from "@/lib/record-run";
```

Then in `handleGameOver`, replace these two lines (currently 37-38):

```ts
      useSessionStats.getState().recordResult(gameId, s);
      useDailyChallenge.getState().recordPlay(gameId, s);
```

with:

```ts
      recordFinishedRun(gameId, s);
```

- [ ] **Step 6: Verify nothing broke**

Run: `npx vitest run hooks/useGameSession.test.ts lib/record-run.test.ts && npx tsc --noEmit`
Expected: existing useGameSession tests still PASS; record-run test PASS; tsc clean. (The `useSessionStats` / `useDailyChallenge` imports are now only referenced through `record-run.ts`; confirm no "unused import" error in `useGameSession.ts`.)

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/record-run.ts frontend/lib/record-run.test.ts frontend/hooks/useGameSession.ts
git commit -m "feat(xp): funnel finished runs through recordFinishedRun (adds play XP)"
```

---

### Task 4: LevelHero component

**Files:**
- Create: `frontend/components/player/LevelHero.tsx`
- Test: `frontend/components/player/LevelHero.test.tsx`

**Interfaces:**
- Consumes: `LevelInfo`, `XpBreakdown`, `nextTitleUnlock` from `@/lib/level` (Task 1).
- Produces: `function LevelHero(props: { info: LevelInfo; breakdown?: XpBreakdown | null }): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `frontend/components/player/LevelHero.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LevelHero } from "./LevelHero";
import type { LevelInfo } from "@/lib/level";

const info: LevelInfo = {
  level: 12,
  title: "Pro",
  xp: 12000,
  xpIntoLevel: 1200,
  xpForNextLevel: 2300,
  progress: 1200 / 2300,
};

describe("LevelHero", () => {
  it("renders the level, title, XP and an accessible progressbar", () => {
    const html = renderToStaticMarkup(<LevelHero info={info} />);
    expect(html).toContain("Lv 12");
    expect(html).toContain("Pro");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemax="2300"');
  });

  it("shows the next title unlock for a mid-tier level", () => {
    const html = renderToStaticMarkup(<LevelHero info={info} />);
    expect(html).toContain("Next: Ace @ Lv 15");
  });

  it("renders the XP breakdown only when provided", () => {
    const withBreakdown = renderToStaticMarkup(
      <LevelHero info={info} breakdown={{ base: 10000, play: 1500, streak: 500 }} />,
    );
    expect(withBreakdown).toContain("On-chain");
    expect(withBreakdown).toContain("Play");
    expect(withBreakdown).toContain("Streak");
    expect(renderToStaticMarkup(<LevelHero info={info} />)).not.toContain(
      "On-chain",
    );
  });

  it("shows a max-title note at the top band", () => {
    const top: LevelInfo = { ...info, level: 30, title: "Arcade Legend" };
    const html = renderToStaticMarkup(<LevelHero info={top} />);
    expect(html).toContain("Max title");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/player/LevelHero.test.tsx`
Expected: FAIL — cannot resolve `./LevelHero`.

- [ ] **Step 3: Write the implementation**

Create `frontend/components/player/LevelHero.tsx`:

```tsx
"use client";

import type { LevelInfo, XpBreakdown } from "@/lib/level";
import { nextTitleUnlock } from "@/lib/level";

export function LevelHero({
  info,
  breakdown,
}: {
  info: LevelInfo;
  breakdown?: XpBreakdown | null;
}) {
  const pct = Math.max(0, Math.min(1, info.progress)) * 100;
  const next = nextTitleUnlock(info.level);

  return (
    <div
      style={{
        border: "2px solid #000080",
        background: "#eef3ff",
        padding: 8,
        margin: "4px 0",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 22, fontWeight: "bold", color: "#000080" }}>
          Lv {info.level}
        </span>
        <span style={{ fontSize: 13, fontWeight: "bold" }}>{info.title}</span>
      </div>

      <div
        role="progressbar"
        aria-label={`Level ${info.level} progress`}
        aria-valuenow={info.xpIntoLevel}
        aria-valuemin={0}
        aria-valuemax={info.xpForNextLevel}
        style={{ height: 8, background: "#c0c0c0", marginTop: 4 }}
      >
        <div
          aria-hidden
          style={{ height: "100%", width: `${pct}%`, background: "#000080" }}
        />
      </div>

      <div
        className="text-[10px]"
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 6,
          marginTop: 2,
        }}
      >
        <span>
          {info.xpIntoLevel.toLocaleString()} /{" "}
          {info.xpForNextLevel.toLocaleString()} XP
        </span>
        {next ? (
          <span>
            Next: {next.title} @ Lv {next.atLevel}
          </span>
        ) : (
          <span>Max title reached 👑</span>
        )}
      </div>

      {breakdown && (
        <div
          className="text-[10px] text-gray-600"
          style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <span>On-chain {breakdown.base.toLocaleString()}</span>
          <span>Play {breakdown.play.toLocaleString()}</span>
          <span>Streak {breakdown.streak.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/player/LevelHero.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` (expected: clean)

```bash
git add frontend/components/player/LevelHero.tsx frontend/components/player/LevelHero.test.tsx
git commit -m "feat(level): LevelHero profile component with XP bar + next-unlock"
```

---

### Task 5: Wire hybrid level + LevelHero into PlayerProfileBody

**Files:**
- Modify: `frontend/components/player/PlayerProfileBody.tsx`

**Interfaces:**
- Consumes: `resolveProfileLevel`, `XpBreakdown`, `LevelInfo` (Task 1); `usePlayXp` (Task 2); `LevelHero` (Task 4); existing `useDailyChallenge` (`@/state/daily-challenge`).

This task is integration wiring of already-unit-tested units (Task 1 `resolveProfileLevel`, Task 4 `LevelHero`). `PlayerProfileBody` is a network-driven shell with no existing unit test (consistent with the project's testing norms), so it is verified by the type-checker, the production build, and the full suite rather than a new unit test.

- [ ] **Step 1: Update imports**

In `frontend/components/player/PlayerProfileBody.tsx`:

Replace this line (15):

```ts
import { LevelBadge } from "./LevelBadge";
```

with:

```ts
import { LevelHero } from "./LevelHero";
```

Replace this line (16):

```ts
import { computeLevel, type LevelInfo } from "@/lib/level";
```

with:

```ts
import { resolveProfileLevel, type LevelInfo, type XpBreakdown } from "@/lib/level";
```

Add these two imports after the existing `import { useMintTx } from "@/state/mint-tx";` line (20):

```ts
import { usePlayXp } from "@/state/play-xp";
import { useDailyChallenge } from "@/state/daily-challenge";
```

- [ ] **Step 2: Read play XP + best streak and resolve the hybrid level**

In the `PlayerProfileBody` function body, just after the existing selector
`const mintStatus = useMintTx((s) => s.status);` (line 51), add:

```ts
  const playXp = usePlayXp((s) => s.lifetimeXp);
  const bestStreak = useDailyChallenge((s) => s.bestStreak);
  const isOwnProfile = walletAddress === address;

  // Ensure the persisted daily-challenge streak is loaded for the hero.
  useEffect(() => {
    useDailyChallenge.getState().hydrate();
  }, []);
```

Then, just after the existing `const stats = useMemo(...)` line (107), add:

```ts
  const resolvedLevel = useMemo(
    () =>
      stats
        ? resolveProfileLevel({ stats, isOwnProfile, playXp, bestStreak })
        : null,
    [stats, isOwnProfile, playXp, bestStreak],
  );
```

- [ ] **Step 3: Pass the resolved level + breakdown to ProfileHeader**

In the `<ProfileHeader ... />` JSX, replace this prop (line 143):

```tsx
        levelInfo={stats ? computeLevel(stats) : null}
```

with:

```tsx
        levelInfo={resolvedLevel?.info ?? null}
        levelBreakdown={resolvedLevel?.breakdown ?? null}
```

Also replace the now-redundant local `isOwnProfile` comparisons that read `walletAddress === address` **only if you wish** — leave them as-is to keep this diff minimal (they are still correct). Do NOT remove the existing `walletAddress === address` usages elsewhere.

- [ ] **Step 4: Update ProfileHeader to accept the breakdown and render LevelHero**

In the `ProfileHeader` prop type, add `levelBreakdown` next to `levelInfo` (around line 342):

```tsx
  levelInfo?: LevelInfo | null;
  levelBreakdown?: XpBreakdown | null;
```

Add `levelBreakdown` to the destructured params of `ProfileHeader` (around line 332, next to `levelInfo`):

```tsx
  levelInfo,
  levelBreakdown,
```

Replace the LevelBadge render (line 402):

```tsx
      {levelInfo && <LevelBadge info={levelInfo} />}
```

with:

```tsx
      {levelInfo && <LevelHero info={levelInfo} breakdown={levelBreakdown} />}
```

- [ ] **Step 5: Verify (typecheck + build + full suite)**

Run: `npx tsc --noEmit && npm run build && npx vitest run`
Expected: tsc clean; build succeeds; full suite green (previous count + the new level/play-xp/record-run/LevelHero tests). Confirm there is no unused-import error for the removed `computeLevel` / `LevelBadge` references in `PlayerProfileBody.tsx`.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/player/PlayerProfileBody.tsx
git commit -m "feat(profile): hybrid XP Level hero (play + streak) on own profile"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full gate**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all tests pass; tsc clean; build succeeds.

- [ ] **Step 2: Playwright spot-check (optional, desktop viewport)**

Start the dev server (if components look stale, stop and `rm -rf .next`, then restart — known Turbopack persistent-cache gotcha). With the wallet **connected**, open the player profile and confirm:
- The Level hero shows `Lv N`, the title, a filled XP bar, and a "Next: «Title» @ Lv N" line.
- The own-profile XP breakdown row shows On-chain / Play / Streak.
- Finishing a game (without minting) increases the play XP — re-open the profile and confirm the bar/level moved.
- Viewing a different player's address shows the hero with **no** breakdown row.

- [ ] **Step 3: Record outcome**

No commit. Report the gate output and any spot-check observations.

---

## Self-Review

**Spec coverage:**
- §2.A hybrid formula additive on `totalScore`, `STREAK_XP`, backward-compatible `computeLevel` → Task 1. ✓
- §2.A `nextTitleUnlock` → Task 1. ✓
- §2.B persisted play-XP store + `playXpForRun` → Task 2. ✓
- §2.C record at the game-over chokepoint alongside `recordResult` → Task 3 (`recordFinishedRun` from `useGameSession`). ✓
- §2.D own-profile hybrid vs others derived-only, `LevelHero`, breakdown, `bestStreak` from daily-challenge → Tasks 1 (`resolveProfileLevel`), 4, 5. ✓
- §Titles keep 5 existing names + add Ace(15)/Master(25), no rename → Task 1 `TITLE_BANDS` (existing `levelTitle` test stays green). ✓
- §3 data flow (game over → three stores; profile resolve by own/other) → Tasks 3, 5. ✓
- §4 testing (level opts/nextTitleUnlock/resolve, play-xp formula+store, LevelHero render+a11y) → Tasks 1, 2, 4; record-run wiring → Task 3. ✓
- §5 no contract change; tamper accepted; others base-only; v2 items out of scope → respected across all tasks. ✓
- §6 files touched → matches File Structure. ✓ (`LevelBadge` intentionally kept, not deleted.)

**Placeholder scan:** No TBD/TODO; every code step shows complete code; the one task without a new unit test (Task 5) states why and lists concrete verification commands. ✓

**Type consistency:** `LevelInfo` shape unchanged; `XpBreakdown { base, play, streak }` defined in Task 1 and consumed in Tasks 4/5; `resolveProfileLevel(args)` return `{ info, breakdown }` consumed in Task 5; `playXpForRun`/`PLAY_FINISH_XP` defined in Task 2 and used in Tasks 2/3 tests; `recordFinishedRun(gameId, score)` defined in Task 3 and called in `useGameSession`; `usePlayXp` state `{ lifetimeXp, byGame, addPlay, reset }` consistent across Tasks 2/3/5. ✓
