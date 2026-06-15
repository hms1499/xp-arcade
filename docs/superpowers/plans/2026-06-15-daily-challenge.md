# Daily Challenge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a client-side Daily Challenge — each day spotlights one of the five
games with a fixed target; beating it advances a strict streak (miss = reset),
shown in an always-on desktop widget, with milestone badges in the achievements panel.

**Architecture:** Pure logic in `lib/daily-challenge.ts` (deterministic day→game
selection, target table, streak math), a thin localStorage-backed Zustand store
(`state/daily-challenge.ts`), a presentational `DailyChallengeWidget`, and one hook
point in the shared `useGameSession.handleGameOver`. Mirrors existing client-side
patterns (`lib/welcome.ts`, `state/session-stats.ts`). **No contract change.**

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5 / Zustand 5 / Vitest 3 / 98.css.

**Reference spec:** `docs/superpowers/specs/2026-06-15-daily-challenge-design.md`

**Working directory for all frontend commands:** `frontend/`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `frontend/lib/daily-challenge.ts` | Pure: day-key, day→game, target table, streak math | Create |
| `frontend/lib/daily-challenge.test.ts` | Unit tests for the pure logic | Create |
| `frontend/state/daily-challenge.ts` | localStorage-backed Zustand store + `recordPlay` | Create |
| `frontend/state/daily-challenge.test.ts` | Store behavior tests | Create |
| `frontend/hooks/useGameSession.ts` | Call `recordPlay` on game over | Modify |
| `frontend/lib/achievements.ts` | 3 streak-milestone badges via `extra.bestStreak` | Modify |
| `frontend/lib/achievements.test.ts` | Tests for the 3 streak badges | Modify |
| `frontend/components/player/AchievementsPanel.tsx` | Thread `bestStreak` into evaluation | Modify |
| `frontend/components/desktop/DailyChallengeWidget.tsx` | Desktop widget UI | Create |
| `frontend/components/desktop/DailyChallengeWidget.test.tsx` | Widget render tests | Create |
| `frontend/components/desktop/DesktopLeaderboardShowcase.tsx` | Mount widget under PrizePoolHero | Modify |
| `HANDOFF.md` | Note the new feature | Modify |

---

## Task 1: Day key (local YYYY-MM-DD)

**Files:**
- Create: `frontend/lib/daily-challenge.ts`
- Test: `frontend/lib/daily-challenge.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/daily-challenge.test.ts
import { describe, it, expect } from "vitest";
import { todayKey } from "./daily-challenge";

describe("todayKey", () => {
  it("formats a date as local YYYY-MM-DD with zero padding", () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe("2026-01-05"); // Jan 5
    expect(todayKey(new Date(2026, 11, 31))).toBe("2026-12-31"); // Dec 31
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run lib/daily-challenge.test.ts`
Expected: FAIL — `Cannot find module './daily-challenge'`.

- [ ] **Step 3: Write the implementation**

```ts
// frontend/lib/daily-challenge.ts
import { GAME_IDS, type GameId } from "./game-registry";

/** Local-date day key, e.g. "2026-06-15". Local (not UTC) so a player's day
 *  follows their own midnight (friendlier streaks, Wordle-style). */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run lib/daily-challenge.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/daily-challenge.ts frontend/lib/daily-challenge.test.ts
git commit -m "feat(daily): local day-key helper"
```

---

## Task 2: Deterministic day → game selection

**Files:**
- Modify: `frontend/lib/daily-challenge.ts`
- Test: `frontend/lib/daily-challenge.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
// add to frontend/lib/daily-challenge.test.ts
import { dailyGame } from "./daily-challenge";
import { GAME_IDS } from "./game-registry";

describe("dailyGame", () => {
  it("is deterministic for a given day key", () => {
    expect(dailyGame("2026-06-15")).toBe(dailyGame("2026-06-15"));
  });

  it("always returns a registered game id", () => {
    expect(GAME_IDS).toContain(dailyGame("2026-06-15"));
  });

  it("rotates across every game over a year of days", () => {
    const seen = new Set<string>();
    const start = new Date(2026, 0, 1);
    for (let i = 0; i < 365; i++) {
      const d = new Date(start.getTime() + i * 86_400_000);
      seen.add(dailyGame(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`));
    }
    for (const id of GAME_IDS) expect(seen.has(id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run lib/daily-challenge.test.ts`
Expected: FAIL — `dailyGame is not a function`.

- [ ] **Step 3: Implement the hash + selector**

```ts
// add to frontend/lib/daily-challenge.ts
/** DJB2 string hash → unsigned 32-bit int. Dependency-free, deterministic. */
function hashDayKey(key: string): number {
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** The single spotlighted game for a day. Same key → same game for everyone. */
export function dailyGame(dayKey: string): GameId {
  return GAME_IDS[hashDayKey(dayKey) % GAME_IDS.length];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run lib/daily-challenge.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/daily-challenge.ts frontend/lib/daily-challenge.test.ts
git commit -m "feat(daily): deterministic day-to-game selection"
```

---

## Task 3: Target table + challenge combiner

**Files:**
- Modify: `frontend/lib/daily-challenge.ts`
- Test: `frontend/lib/daily-challenge.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
// add to frontend/lib/daily-challenge.test.ts
import { DAILY_TARGETS, dailyChallenge } from "./daily-challenge";

describe("DAILY_TARGETS / dailyChallenge", () => {
  it("has a target for every registered game", () => {
    for (const id of GAME_IDS) {
      expect(typeof DAILY_TARGETS[id]).toBe("number");
      expect(DAILY_TARGETS[id]).toBeGreaterThan(0);
    }
  });

  it("minesweeper target encodes a 180s clear", () => {
    expect(DAILY_TARGETS.minesweeper).toBe(9819); // 9999 - 180
  });

  it("combines today's game and its target", () => {
    const c = dailyChallenge("2026-06-15");
    expect(c.gameId).toBe(dailyGame("2026-06-15"));
    expect(c.target).toBe(DAILY_TARGETS[c.gameId]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run lib/daily-challenge.test.ts`
Expected: FAIL — `DAILY_TARGETS` undefined.

- [ ] **Step 3: Implement the table + combiner**

```ts
// add to frontend/lib/daily-challenge.ts
/** Raw on-chain score targets per game. Tuned below score-risk practicalHigh,
 *  above casual. One table → easy to retune. Minesweeper = 9999 - 180s. */
export const DAILY_TARGETS: Record<GameId, number> = {
  snake: 150,
  tetris: 180,
  pacman: 180,
  breakout: 200,
  minesweeper: 9819,
};

export type DailyChallenge = { gameId: GameId; target: number };

export function dailyChallenge(dayKey: string): DailyChallenge {
  const gameId = dailyGame(dayKey);
  return { gameId, target: DAILY_TARGETS[gameId] };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run lib/daily-challenge.test.ts`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/daily-challenge.ts frontend/lib/daily-challenge.test.ts
git commit -m "feat(daily): per-game target table + challenge combiner"
```

---

## Task 4: Calendar-day adjacency helper

**Files:**
- Modify: `frontend/lib/daily-challenge.ts`
- Test: `frontend/lib/daily-challenge.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
// add to frontend/lib/daily-challenge.test.ts
import { isYesterday } from "./daily-challenge";

describe("isYesterday", () => {
  it("true when prev is the calendar day before today", () => {
    expect(isYesterday("2026-06-14", "2026-06-15")).toBe(true);
    expect(isYesterday("2026-02-28", "2026-03-01")).toBe(true); // month boundary
    expect(isYesterday("2025-12-31", "2026-01-01")).toBe(true); // year boundary
  });

  it("false for same day, gaps, or future", () => {
    expect(isYesterday("2026-06-15", "2026-06-15")).toBe(false);
    expect(isYesterday("2026-06-13", "2026-06-15")).toBe(false);
    expect(isYesterday("2026-06-16", "2026-06-15")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run lib/daily-challenge.test.ts`
Expected: FAIL — `isYesterday is not a function`.

- [ ] **Step 3: Implement the helper**

```ts
// add to frontend/lib/daily-challenge.ts
/** Parse a "YYYY-MM-DD" key to a local-midnight epoch (ms). */
function dayKeyToMs(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

const ONE_DAY_MS = 86_400_000;

/** True when `prev` is exactly the calendar day before `today`. */
export function isYesterday(prev: string, today: string): boolean {
  return dayKeyToMs(today) - dayKeyToMs(prev) === ONE_DAY_MS;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run lib/daily-challenge.test.ts`
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/daily-challenge.ts frontend/lib/daily-challenge.test.ts
git commit -m "feat(daily): calendar-day adjacency helper"
```

---

## Task 5: applyCompletion (streak advance / reset)

**Files:**
- Modify: `frontend/lib/daily-challenge.ts`
- Test: `frontend/lib/daily-challenge.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
// add to frontend/lib/daily-challenge.test.ts
import { applyCompletion, type DailyChallengeState } from "./daily-challenge";

const EMPTY: DailyChallengeState = {
  lastCompletedDate: null,
  currentStreak: 0,
  bestStreak: 0,
};

describe("applyCompletion", () => {
  it("starts a streak at 1 on first ever completion", () => {
    const s = applyCompletion(EMPTY, "2026-06-15");
    expect(s).toEqual({ lastCompletedDate: "2026-06-15", currentStreak: 1, bestStreak: 1 });
  });

  it("increments on a consecutive day", () => {
    const day1 = applyCompletion(EMPTY, "2026-06-14");
    const day2 = applyCompletion(day1, "2026-06-15");
    expect(day2.currentStreak).toBe(2);
    expect(day2.bestStreak).toBe(2);
  });

  it("resets to 1 after a gap but keeps bestStreak", () => {
    let s = applyCompletion(EMPTY, "2026-06-10");
    s = applyCompletion(s, "2026-06-11"); // streak 2, best 2
    s = applyCompletion(s, "2026-06-15"); // gap -> reset to 1
    expect(s.currentStreak).toBe(1);
    expect(s.bestStreak).toBe(2);
  });

  it("is idempotent for the same day", () => {
    const once = applyCompletion(EMPTY, "2026-06-15");
    const twice = applyCompletion(once, "2026-06-15");
    expect(twice).toEqual(once);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run lib/daily-challenge.test.ts`
Expected: FAIL — `applyCompletion is not a function`.

- [ ] **Step 3: Implement applyCompletion + the state type**

```ts
// add to frontend/lib/daily-challenge.ts
export type DailyChallengeState = {
  lastCompletedDate: string | null; // YYYY-MM-DD of last completed day
  currentStreak: number;
  bestStreak: number;
};

/** Record a completion for `today`. Idempotent for a repeated same-day call. */
export function applyCompletion(
  state: DailyChallengeState,
  today: string,
): DailyChallengeState {
  if (state.lastCompletedDate === today) return state;
  const continues =
    state.lastCompletedDate != null && isYesterday(state.lastCompletedDate, today);
  const currentStreak = continues ? state.currentStreak + 1 : 1;
  return {
    lastCompletedDate: today,
    currentStreak,
    bestStreak: Math.max(state.bestStreak, currentStreak),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run lib/daily-challenge.test.ts`
Expected: PASS (13 tests total).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/daily-challenge.ts frontend/lib/daily-challenge.test.ts
git commit -m "feat(daily): applyCompletion streak math"
```

---

## Task 6: viewStreak (lazy decay on read)

**Files:**
- Modify: `frontend/lib/daily-challenge.ts`
- Test: `frontend/lib/daily-challenge.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
// add to frontend/lib/daily-challenge.test.ts
import { viewStreak } from "./daily-challenge";

describe("viewStreak", () => {
  it("shows the live streak when last completion is today", () => {
    const s = applyCompletion(EMPTY, "2026-06-15");
    expect(viewStreak(s, "2026-06-15")).toEqual({
      currentStreak: 1,
      bestStreak: 1,
      completedToday: true,
    });
  });

  it("keeps the streak alive when last completion was yesterday", () => {
    const s = { lastCompletedDate: "2026-06-14", currentStreak: 3, bestStreak: 5 };
    expect(viewStreak(s, "2026-06-15")).toEqual({
      currentStreak: 3,
      bestStreak: 5,
      completedToday: false,
    });
  });

  it("decays a stale streak to 0 but preserves bestStreak", () => {
    const s = { lastCompletedDate: "2026-06-10", currentStreak: 3, bestStreak: 5 };
    expect(viewStreak(s, "2026-06-15")).toEqual({
      currentStreak: 0,
      bestStreak: 5,
      completedToday: false,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run lib/daily-challenge.test.ts`
Expected: FAIL — `viewStreak is not a function`.

- [ ] **Step 3: Implement viewStreak**

```ts
// add to frontend/lib/daily-challenge.ts
export type StreakView = {
  currentStreak: number;
  bestStreak: number;
  completedToday: boolean;
};

/** Derived view for rendering: a streak older than yesterday reads as broken. */
export function viewStreak(state: DailyChallengeState, today: string): StreakView {
  const completedToday = state.lastCompletedDate === today;
  const alive =
    completedToday ||
    (state.lastCompletedDate != null && isYesterday(state.lastCompletedDate, today));
  return {
    currentStreak: alive ? state.currentStreak : 0,
    bestStreak: state.bestStreak,
    completedToday,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run lib/daily-challenge.test.ts`
Expected: PASS (16 tests total).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/daily-challenge.ts frontend/lib/daily-challenge.test.ts
git commit -m "feat(daily): viewStreak lazy decay"
```

---

## Task 7: meetsDailyTarget (completion predicate)

**Files:**
- Modify: `frontend/lib/daily-challenge.ts`
- Test: `frontend/lib/daily-challenge.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
// add to frontend/lib/daily-challenge.test.ts
import { meetsDailyTarget } from "./daily-challenge";

describe("meetsDailyTarget", () => {
  it("true only for today's game at or above its target", () => {
    const day = "2026-06-15";
    const { gameId, target } = dailyChallenge(day);
    const other = GAME_IDS.find((g) => g !== gameId)!;
    expect(meetsDailyTarget(gameId, target, day)).toBe(true);
    expect(meetsDailyTarget(gameId, target - 1, day)).toBe(false);
    expect(meetsDailyTarget(other, 999_999, day)).toBe(false); // wrong game
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run lib/daily-challenge.test.ts`
Expected: FAIL — `meetsDailyTarget is not a function`.

- [ ] **Step 3: Implement the predicate**

```ts
// add to frontend/lib/daily-challenge.ts
/** Did this game-over result satisfy today's challenge? */
export function meetsDailyTarget(gameId: GameId, score: number, dayKey: string): boolean {
  const c = dailyChallenge(dayKey);
  return gameId === c.gameId && score >= c.target;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run lib/daily-challenge.test.ts`
Expected: PASS (17 tests total).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/daily-challenge.ts frontend/lib/daily-challenge.test.ts
git commit -m "feat(daily): meetsDailyTarget completion predicate"
```

---

## Task 8: localStorage load/save helpers

**Files:**
- Modify: `frontend/lib/daily-challenge.ts`
- Test: `frontend/lib/daily-challenge.test.ts`

SSR-safe persistence, following the `lib/welcome.ts` convention (try/catch, safe
default when storage is unavailable).

- [ ] **Step 1: Add the failing test**

```ts
// add to frontend/lib/daily-challenge.test.ts
import { loadDailyState, saveDailyState, DAILY_STORAGE_KEY } from "./daily-challenge";

describe("load/save daily state", () => {
  it("round-trips through localStorage", () => {
    localStorage.removeItem(DAILY_STORAGE_KEY);
    expect(loadDailyState()).toEqual({
      lastCompletedDate: null,
      currentStreak: 0,
      bestStreak: 0,
    });
    saveDailyState({ lastCompletedDate: "2026-06-15", currentStreak: 2, bestStreak: 4 });
    expect(loadDailyState()).toEqual({
      lastCompletedDate: "2026-06-15",
      currentStreak: 2,
      bestStreak: 4,
    });
  });

  it("returns the safe default on malformed storage", () => {
    localStorage.setItem(DAILY_STORAGE_KEY, "not json");
    expect(loadDailyState()).toEqual({
      lastCompletedDate: null,
      currentStreak: 0,
      bestStreak: 0,
    });
  });
});
```

> Note: the Vitest jsdom environment provides `localStorage`. The frontend test
> setup already runs in jsdom (other tests use `localStorage`, e.g.
> `lib/welcome.test.ts`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run lib/daily-challenge.test.ts`
Expected: FAIL — `loadDailyState is not a function`.

- [ ] **Step 3: Implement the helpers**

```ts
// add to frontend/lib/daily-challenge.ts
export const DAILY_STORAGE_KEY = "xp-arcade:daily";

const DEFAULT_STATE: DailyChallengeState = {
  lastCompletedDate: null,
  currentStreak: 0,
  bestStreak: 0,
};

export function loadDailyState(): DailyChallengeState {
  if (typeof window === "undefined") return { ...DEFAULT_STATE };
  try {
    const raw = window.localStorage.getItem(DAILY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<DailyChallengeState>;
    return {
      lastCompletedDate:
        typeof parsed.lastCompletedDate === "string" ? parsed.lastCompletedDate : null,
      currentStreak: Number.isFinite(parsed.currentStreak) ? Number(parsed.currentStreak) : 0,
      bestStreak: Number.isFinite(parsed.bestStreak) ? Number(parsed.bestStreak) : 0,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveDailyState(state: DailyChallengeState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage blocked → no-op */
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run lib/daily-challenge.test.ts`
Expected: PASS (19 tests total).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/daily-challenge.ts frontend/lib/daily-challenge.test.ts
git commit -m "feat(daily): SSR-safe localStorage load/save"
```

---

## Task 9: Zustand store (recordPlay + hydrate)

**Files:**
- Create: `frontend/state/daily-challenge.ts`
- Test: `frontend/state/daily-challenge.test.ts`

The store starts at the SSR-safe default (so server and first client render match);
a `hydrate()` action loads persisted state in a client effect (mirrors how the
welcome flow reads storage in an effect). `recordPlay` checks the predicate and
applies a completion at most once per day, persisting the result.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/state/daily-challenge.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useDailyChallenge } from "./daily-challenge";
import {
  DAILY_STORAGE_KEY,
  dailyChallenge,
  todayKey,
} from "@/lib/daily-challenge";
import { GAME_IDS } from "@/lib/game-registry";

beforeEach(() => {
  localStorage.removeItem(DAILY_STORAGE_KEY);
  useDailyChallenge.setState({
    lastCompletedDate: null,
    currentStreak: 0,
    bestStreak: 0,
  });
});

describe("useDailyChallenge store", () => {
  it("completes today's challenge when the target game hits the target", () => {
    const today = todayKey();
    const { gameId, target } = dailyChallenge(today);
    useDailyChallenge.getState().recordPlay(gameId, target);
    const s = useDailyChallenge.getState();
    expect(s.lastCompletedDate).toBe(today);
    expect(s.currentStreak).toBe(1);
    expect(s.bestStreak).toBe(1);
  });

  it("ignores a non-target game and a below-target score", () => {
    const today = todayKey();
    const { gameId, target } = dailyChallenge(today);
    const other = GAME_IDS.find((g) => g !== gameId)!;
    useDailyChallenge.getState().recordPlay(other, 999_999);
    useDailyChallenge.getState().recordPlay(gameId, target - 1);
    expect(useDailyChallenge.getState().lastCompletedDate).toBeNull();
  });

  it("does not double-count a second completion the same day", () => {
    const today = todayKey();
    const { gameId, target } = dailyChallenge(today);
    useDailyChallenge.getState().recordPlay(gameId, target);
    useDailyChallenge.getState().recordPlay(gameId, target + 50);
    expect(useDailyChallenge.getState().currentStreak).toBe(1);
  });

  it("persists completions and reloads them via hydrate", () => {
    const today = todayKey();
    const { gameId, target } = dailyChallenge(today);
    useDailyChallenge.getState().recordPlay(gameId, target);
    // wipe in-memory, then hydrate from localStorage
    useDailyChallenge.setState({ lastCompletedDate: null, currentStreak: 0, bestStreak: 0 });
    useDailyChallenge.getState().hydrate();
    expect(useDailyChallenge.getState().lastCompletedDate).toBe(today);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run state/daily-challenge.test.ts`
Expected: FAIL — `Cannot find module './daily-challenge'`.

- [ ] **Step 3: Implement the store**

```ts
// frontend/state/daily-challenge.ts
"use client";
import { create } from "zustand";
import { type GameId } from "@/lib/game-registry";
import {
  type DailyChallengeState,
  applyCompletion,
  loadDailyState,
  meetsDailyTarget,
  saveDailyState,
  todayKey,
} from "@/lib/daily-challenge";

type DailyChallengeStore = DailyChallengeState & {
  hydrate: () => void;
  recordPlay: (gameId: GameId, score: number) => void;
};

export const useDailyChallenge = create<DailyChallengeStore>((set, get) => ({
  lastCompletedDate: null,
  currentStreak: 0,
  bestStreak: 0,

  hydrate: () => set(loadDailyState()),

  recordPlay: (gameId, score) => {
    const today = todayKey();
    if (!meetsDailyTarget(gameId, score, today)) return;
    const { lastCompletedDate, currentStreak, bestStreak } = get();
    const next = applyCompletion({ lastCompletedDate, currentStreak, bestStreak }, today);
    set(next);
    saveDailyState(next);
  },
}));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run state/daily-challenge.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/state/daily-challenge.ts frontend/state/daily-challenge.test.ts
git commit -m "feat(daily): localStorage-backed Zustand store"
```

---

## Task 10: Wire completion into useGameSession

**Files:**
- Modify: `frontend/hooks/useGameSession.ts`

`handleGameOver` runs for every game on game over. Record the play against the
daily challenge there. No test change — this is a one-line wiring of already-tested
units; covered by the build/typecheck gate.

- [ ] **Step 1: Add the import**

In `frontend/hooks/useGameSession.ts`, after the existing `useSessionStats` import
(line 6), add:
```ts
import { useDailyChallenge } from "@/state/daily-challenge";
```

- [ ] **Step 2: Call recordPlay in handleGameOver**

In `handleGameOver`, immediately after the existing
`useSessionStats.getState().recordResult(gameId, s);` line, add:
```ts
      useDailyChallenge.getState().recordPlay(gameId, s);
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/hooks/useGameSession.ts
git commit -m "feat(daily): record challenge completion on game over"
```

---

## Task 11: Streak milestone badges in achievements

**Files:**
- Modify: `frontend/lib/achievements.ts`
- Test: `frontend/lib/achievements.test.ts`

Streak data is local, not part of on-chain `PlayerStats`, so pass it as an optional
second arg. Keep existing entries' `progress: (s) => number` signature unchanged and
special-case the three streak ids inside `evaluateAchievements`.

- [ ] **Step 1: Add the failing test**

```ts
// add to frontend/lib/achievements.test.ts
import { evaluateAchievements } from "./achievements";
// Reuse the existing test's stats factory if present; otherwise build a minimal
// PlayerStats via computePlayerStats([]) (an empty NFT list = all-zero stats).
import { computePlayerStats } from "./player-stats";

describe("streak milestone achievements", () => {
  const zero = computePlayerStats([]);

  it("earns streak badges at 7 / 30 / 100 best-streak", () => {
    const list = evaluateAchievements(zero, { bestStreak: 100 });
    const ids = list.filter((a) => a.earned).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["streak-7", "streak-30", "streak-100"]));
  });

  it("leaves streak badges unearned below their target and when extra omitted", () => {
    const some = evaluateAchievements(zero, { bestStreak: 10 });
    const byId = Object.fromEntries(some.map((a) => [a.id, a]));
    expect(byId["streak-7"].earned).toBe(true);
    expect(byId["streak-30"].earned).toBe(false);

    const none = evaluateAchievements(zero);
    expect(none.find((a) => a.id === "streak-7")!.earned).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run lib/achievements.test.ts`
Expected: FAIL — streak ids not present / `evaluateAchievements` takes one arg.

- [ ] **Step 3: Implement the badges + extended evaluator**

In `frontend/lib/achievements.ts`:

3a. Add the three achievement entries to the `ACHIEVEMENTS` array, after the
`veteran` entry (their `progress` is a placeholder `() => 0`; the real value comes
from `extra` in `evaluateAchievements`):
```ts
  {
    id: "streak-7",
    label: "Week Warrior",
    icon: "🔥",
    description: "Reach a 7-day challenge streak",
    target: 7,
    progress: () => 0,
  },
  {
    id: "streak-30",
    label: "Monthly Master",
    icon: "📆",
    description: "Reach a 30-day challenge streak",
    target: 30,
    progress: () => 0,
  },
  {
    id: "streak-100",
    label: "Century Streak",
    icon: "💎",
    description: "Reach a 100-day challenge streak",
    target: 100,
    progress: () => 0,
  },
```

3b. Replace the `evaluateAchievements` function with the extra-aware version:
```ts
const STREAK_IDS = new Set(["streak-7", "streak-30", "streak-100"]);

export function evaluateAchievements(
  s: PlayerStats,
  extra?: { bestStreak?: number },
): EvaluatedAchievement[] {
  const bestStreak = extra?.bestStreak ?? 0;
  return ACHIEVEMENTS.map((a) => {
    const raw = STREAK_IDS.has(a.id) ? bestStreak : a.progress(s);
    return { ...a, earned: raw >= a.target, current: Math.min(raw, a.target) };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run lib/achievements.test.ts`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/achievements.ts frontend/lib/achievements.test.ts
git commit -m "feat(daily): streak milestone achievement badges"
```

---

## Task 12: Thread bestStreak into AchievementsPanel

**Files:**
- Modify: `frontend/components/player/AchievementsPanel.tsx`

- [ ] **Step 1: Read bestStreak from the store and pass it**

In `frontend/components/player/AchievementsPanel.tsx`:

1a. Add imports after the existing `achievements` import (line 4):
```tsx
import { useDailyChallenge } from "@/state/daily-challenge";
import { viewStreak, todayKey } from "@/lib/daily-challenge";
```

1b. Replace the body's first line (`const list = evaluateAchievements(stats);`) with:
```tsx
  const daily = useDailyChallenge();
  const { bestStreak } = viewStreak(daily, todayKey());
  const list = evaluateAchievements(stats, { bestStreak });
```

> `useDailyChallenge()` with no selector returns the whole store object; `daily`
> structurally matches `DailyChallengeState` (the extra action fields are ignored
> by `viewStreak`). `bestStreak` is monotonic, so it is correct even before
> `hydrate()` runs (defaults to 0).

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/player/AchievementsPanel.tsx
git commit -m "feat(daily): show streak badges in achievements panel"
```

---

## Task 13: DailyChallengeWidget component

**Files:**
- Create: `frontend/components/desktop/DailyChallengeWidget.tsx`
- Test: `frontend/components/desktop/DailyChallengeWidget.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/components/desktop/DailyChallengeWidget.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DailyChallengeWidget } from "./DailyChallengeWidget";
import { useDailyChallenge } from "@/state/daily-challenge";
import { dailyChallenge, todayKey } from "@/lib/daily-challenge";
import { GAMES } from "@/lib/game-registry";

beforeEach(() => {
  useDailyChallenge.setState({ lastCompletedDate: null, currentStreak: 0, bestStreak: 0 });
});

describe("DailyChallengeWidget", () => {
  it("shows today's game label and a not-done status", () => {
    render(<DailyChallengeWidget />);
    const { gameId } = dailyChallenge(todayKey());
    expect(screen.getByText(new RegExp(GAMES[gameId].label, "i"))).toBeTruthy();
    expect(screen.getByText(/today's challenge/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /play/i })).toBeTruthy();
  });

  it("shows a completed state and the streak once done today", () => {
    const today = todayKey();
    useDailyChallenge.setState({ lastCompletedDate: today, currentStreak: 3, bestStreak: 5 });
    render(<DailyChallengeWidget />);
    expect(screen.getByText(/✓|done|completed/i)).toBeTruthy();
    expect(screen.getByText(/3/)).toBeTruthy(); // current streak
  });
});
```

> The frontend already uses `@testing-library/react` + jsdom (see
> `PrizePoolHero.test.tsx`). If `@testing-library/jest-dom` matchers are set up in
> the existing test setup, prefer `toBeInTheDocument()`; the `.toBeTruthy()` form
> above works without it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run components/desktop/DailyChallengeWidget.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the widget**

```tsx
// frontend/components/desktop/DailyChallengeWidget.tsx
"use client";
import { useEffect } from "react";
import { useWindows } from "@/state/window-manager";
import { useDailyChallenge } from "@/state/daily-challenge";
import { GAMES } from "@/lib/game-registry";
import { dailyChallenge, todayKey, viewStreak } from "@/lib/daily-challenge";
import { formatScoreValue } from "@/lib/score-format";

export function DailyChallengeWidget() {
  const open = useWindows((s) => s.open);
  const daily = useDailyChallenge();
  const hydrate = useDailyChallenge((s) => s.hydrate);

  // Load persisted streak after mount (avoids SSR hydration mismatch).
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const day = todayKey();
  const { gameId, target } = dailyChallenge(day);
  const game = GAMES[gameId];
  const { currentStreak, bestStreak, completedToday } = viewStreak(daily, day);

  const targetLabel =
    gameId === "minesweeper"
      ? `Clear in ≤ ${formatScoreValue(gameId, target)}`
      : `Reach ${formatScoreValue(gameId, target)}`;

  return (
    <section
      style={{
        background: "#c0c0c0",
        border: "2px solid",
        borderColor: "#fff #7b7b7b #7b7b7b #fff",
        padding: 8,
        width: 220,
        fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
        fontSize: 11,
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: 4 }}>
        ⭐ Today&apos;s Challenge
      </div>
      <div style={{ marginBottom: 2 }}>
        {game.emoji} {game.label}
      </div>
      <div style={{ color: "#000080", marginBottom: 4 }}>{targetLabel}</div>
      <div style={{ marginBottom: 6 }}>
        {completedToday ? (
          <span style={{ color: "#007700", fontWeight: "bold" }}>✓ Completed today</span>
        ) : (
          <span style={{ color: "#777" }}>⬜ Not done yet</span>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span>🔥 Streak: <b>{currentStreak}</b></span>
        <span style={{ color: "#777" }}>Best: {bestStreak}</span>
      </div>
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => open(`game-${gameId}`)}
        style={{ width: "100%", height: 22 }}
      >
        Play {game.label}
      </button>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run components/desktop/DailyChallengeWidget.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/desktop/DailyChallengeWidget.tsx frontend/components/desktop/DailyChallengeWidget.test.tsx
git commit -m "feat(daily): desktop challenge widget"
```

---

## Task 14: Mount the widget under PrizePoolHero

**Files:**
- Modify: `frontend/components/desktop/DesktopLeaderboardShowcase.tsx`

The showcase renders a vertical column (top-right) with `<PrizePoolHero …/>` then
the Hall of Fame `<section>`. Insert the widget between them.

- [ ] **Step 1: Add the import**

In `frontend/components/desktop/DesktopLeaderboardShowcase.tsx`, after the existing
`import { PrizePoolHero } from "./PrizePoolHero";` line (line 15), add:
```tsx
import { DailyChallengeWidget } from "./DailyChallengeWidget";
```

- [ ] **Step 2: Render it after PrizePoolHero**

Immediately after the `<PrizePoolHero … />` element (the block closing with `/>`
around line 106), add:
```tsx
      <DailyChallengeWidget />
```

- [ ] **Step 3: Build to verify the desktop renders**

Run: `cd frontend && npm run build`
Expected: build succeeds. (Manual: `npm run dev` → the desktop top-right column
shows the Daily Challenge widget under the prize-pool hero, with today's game,
target, streak, and a Play button.)

- [ ] **Step 4: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/desktop/DesktopLeaderboardShowcase.tsx
git commit -m "feat(daily): mount challenge widget on desktop"
```

---

## Task 15: HANDOFF note

**Files:**
- Modify: `HANDOFF.md`

- [ ] **Step 1: Add a feature note**

In `HANDOFF.md`, under the most recent "done" / features area, add:
```markdown
### Daily Challenge — shipped client-side (2026-06-15)

Desktop widget spotlights one of the 5 games per day with a fixed target
(`lib/daily-challenge.ts`). Beating the target in a play session (no wallet/mint)
advances a strict streak (miss = reset; best-streak preserved). Streak milestones
(7/30/100) earn badges in the achievements panel. State persists in localStorage
(`xp-arcade:daily`). No contract change. `tsc` clean · tests ✓ · build ✓.

- [ ] Optional: retune `DAILY_TARGETS` after observing real scores.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add HANDOFF.md
git commit -m "docs(daily): handoff note"
```

---

## Task 16: Full verification gate

**Files:** none (gate before done).

- [ ] **Step 1: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 3: Unit tests**

Run: `cd frontend && npm test`
Expected: all pass, including the new daily-challenge / store / achievements / widget tests.

- [ ] **Step 4: Production build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual smoke (record result, do not fake)**

`cd frontend && npm run dev`, then in the browser:
- Desktop top-right shows the Daily Challenge widget: today's game + target + streak + Play.
- Click Play → the spotlighted game opens.
- Score below target → widget still "Not done yet".
- Score at/above target (for today's game) → widget flips to "✓ Completed today", streak → 1.
- Reload → completion + streak persist (localStorage).
- Open a player profile / achievements → streak badges show progress toward 7/30/100.

- [ ] **Step 6: Commit (if any lint/tsc fixups were needed)**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add -A frontend
git commit -m "chore(daily): verification fixups" || echo "nothing to commit"
```

---

## Self-Review notes (reconciled against the spec)

- **§3 architecture / file structure:** Tasks 1–9 build the pure lib + store; Task
  10 the single hook point; Tasks 11–12 achievements; Tasks 13–14 UI. Matches the
  spec's unit table.
- **§4 deterministic selection:** Task 2 (`hashDayKey`/`dailyGame`), Task 3
  (`DAILY_TARGETS`/`dailyChallenge`); local day-key in Task 1. Targets match the
  spec table incl. minesweeper `9819`.
- **§5 streak math:** Task 4 (`isYesterday`), Task 5 (`applyCompletion`), Task 6
  (`viewStreak` lazy decay). Strict reset + best-streak preserved.
- **§6 completion detection:** Task 7 (`meetsDailyTarget`), Task 9 (`recordPlay`
  once/day), Task 10 (wire into `handleGameOver`). No wallet/mint.
- **§7 achievements:** Task 11 adds streak-7/30/100 via `extra.bestStreak`,
  existing badges unchanged (single call site updated in Task 12).
- **§8 UI widget:** Task 13 (`DailyChallengeWidget`, SSR-safe `hydrate` in effect),
  Task 14 mounts under `PrizePoolHero`.
- **§9 testing:** Tasks 1–9,11,13 are TDD; Task 16 runs the full gate.
- **Naming consistency across tasks:** `todayKey`, `dailyGame`, `DAILY_TARGETS`,
  `dailyChallenge`, `isYesterday`, `applyCompletion`, `viewStreak`,
  `meetsDailyTarget`, `loadDailyState`/`saveDailyState`/`DAILY_STORAGE_KEY`,
  `DailyChallengeState`/`StreakView`/`DailyChallenge`, store `useDailyChallenge`
  with `hydrate`/`recordPlay` — identical everywhere they appear.
- **No contract change:** confirmed — frontend only.
```
