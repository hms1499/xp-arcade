# Level-Up Toast (XP/Level v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a Win95 balloon toast the moment the connected wallet crosses a level boundary live during a session.

**Architecture:** A reactive watcher hook mounted once at the app root computes the connected wallet's true level from all three XP sources (on-chain base + play + streak), compares it to a persisted per-address "acknowledged" level, and pushes a toast on a live increase. Pure messaging logic is isolated in `lib/level-up.ts`. No contract / mainnet change.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zustand 5 (+ `persist`), Vitest 3 (jsdom).

## Global Constraints

- Frontend only. No contract, no mainnet, no new dependency.
- Reuse existing toast infra: `useToasts.push({ title, body, type, duration })` rendered by `<Balloons/>`. Do NOT build a new toast UI.
- **`@testing-library/react` is NOT a project dependency — do not import it.** Pure logic is tested with plain Vitest. Anything needing React (hooks/components) is tested with `react`'s `act` + `react-dom/client`'s `createRoot` against a jsdom `container`, exactly like `components/desktop/DailyChallengeWidget.test.tsx`: set `globalThis.IS_REACT_ACT_ENVIRONMENT = true`, render a tiny probe component inside `act(() => root.render(...))`, drive updates by mutating the real Zustand stores inside `act`, and assert on store state (or a captured hook return). Prefer pushing logic into pure functions so React tests stay thin.
- Level + title come exclusively from `lib/level.ts` (`computeLevel`, `levelTitle`, `TITLE_BANDS`) — do not duplicate the curve or band names.
- `useDailyChallenge` is NOT a persist store; it needs an explicit `.hydrate()` call before `bestStreak` is real.
- Never toast for XP earned while the app was closed (baseline silently on first observation); never toast a wrong/too-low number while base XP is still loading (act only when `stats !== null`).
- Repo path must not contain spaces (Vitest). Keep `Desktop/xp-snake/`.
- Git: conventional prefixes, small green commits, stage explicit files, **no `Co-Authored-By`**. Each task is its own commit.
- Run the actual `tsc`/test/build/lint and read output before claiming done.

All commands run from `frontend/` unless noted.

---

### Task 1: Pure level-up toast decision (`lib/level-up.ts`)

**Files:**
- Create: `frontend/lib/level-up.ts`
- Test: `frontend/lib/level-up.test.ts`

**Interfaces:**
- Consumes: `levelTitle` from `@/lib/level`; `ToastType` from `@/state/toasts`.
- Produces:
  ```ts
  export type LevelUpToast = { title: string; body: string; type: ToastType };
  export function decideLevelUpToast(args: { prevLevel: number; nextLevel: number }): LevelUpToast | null;
  export function levelUpStep(args: { baselined: boolean; ack: number; level: number }):
    { ack: number; baselined: boolean; toast: LevelUpToast | null };
  ```
  `levelUpStep` is the pure watcher transition (so the hook in Task 4 stays a thin wiring layer): on the first observation (`baselined === false`) it baselines silently to `max(ack, level)` with no toast; once baselined, a `level > ack` yields the `decideLevelUpToast` result and raises `ack`; otherwise it is a no-op.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/level-up.test.ts
import { describe, it, expect } from "vitest";
import { decideLevelUpToast } from "./level-up";

describe("decideLevelUpToast", () => {
  it("returns null when level did not increase", () => {
    expect(decideLevelUpToast({ prevLevel: 7, nextLevel: 7 })).toBeNull();
    expect(decideLevelUpToast({ prevLevel: 7, nextLevel: 6 })).toBeNull();
  });

  it("returns an info toast for a same-title level increase", () => {
    // Lv6 and Lv7 are both 'Player' (band starts at 5, next at 10).
    const toast = decideLevelUpToast({ prevLevel: 6, nextLevel: 7 });
    expect(toast).not.toBeNull();
    expect(toast!.type).toBe("info");
    expect(toast!.title).toContain("7");
  });

  it("returns a success 'New title' toast when a title band is crossed", () => {
    // 9 is 'Player' (band starts at 5), 10 is 'Pro' (band starts at 10).
    const toast = decideLevelUpToast({ prevLevel: 9, nextLevel: 10 });
    expect(toast).not.toBeNull();
    expect(toast!.type).toBe("success");
    expect(toast!.title).toContain("Pro");
    expect(toast!.body).toContain("10");
  });
});

describe("levelUpStep", () => {
  it("baselines silently on first observation (no toast)", () => {
    const r = levelUpStep({ baselined: false, ack: 0, level: 6 });
    expect(r).toEqual({ ack: 6, baselined: true, toast: null });
  });

  it("baseline never lowers ack", () => {
    const r = levelUpStep({ baselined: false, ack: 9, level: 6 });
    expect(r).toEqual({ ack: 9, baselined: true, toast: null });
  });

  it("toasts and raises ack on a live increase after baseline", () => {
    const r = levelUpStep({ baselined: true, ack: 6, level: 8 });
    expect(r.ack).toBe(8);
    expect(r.toast).not.toBeNull();
    expect(r.toast!.title).toContain("8");
  });

  it("is a no-op when baselined and level did not rise", () => {
    const r = levelUpStep({ baselined: true, ack: 8, level: 8 });
    expect(r).toEqual({ ack: 8, baselined: true, toast: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/level-up.test.ts`
Expected: FAIL — cannot resolve `./level-up`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/lib/level-up.ts
import { levelTitle } from "./level";
import type { ToastType } from "@/state/toasts";

export type LevelUpToast = { title: string; body: string; type: ToastType };

/**
 * Decide what toast (if any) to show when level moves prevLevel -> nextLevel.
 * Returns null when nextLevel <= prevLevel. A jump that crosses a title band
 * (e.g. 9 -> 10 enters "Pro") yields a success "New title" toast; any other
 * increase yields a plain info "Level N" toast.
 */
export function decideLevelUpToast(args: {
  prevLevel: number;
  nextLevel: number;
}): LevelUpToast | null {
  const { prevLevel, nextLevel } = args;
  if (nextLevel <= prevLevel) return null;
  const newTitle = levelTitle(nextLevel);
  if (newTitle !== levelTitle(prevLevel)) {
    return {
      title: `New title: ${newTitle}!`,
      body: `Reached Level ${nextLevel}.`,
      type: "success",
    };
  }
  return {
    title: `Level ${nextLevel}!`,
    body: "Keep playing to level up.",
    type: "info",
  };
}

/**
 * Pure watcher transition. On the first observation for an address
 * (baselined === false) it absorbs the current level silently (no toast) so XP
 * earned while the app was closed is never announced. Once baselined, a rise
 * above ack produces a toast and raises ack; anything else is a no-op.
 */
export function levelUpStep(args: {
  baselined: boolean;
  ack: number;
  level: number;
}): { ack: number; baselined: boolean; toast: LevelUpToast | null } {
  const { baselined, ack, level } = args;
  if (!baselined) {
    return { ack: Math.max(ack, level), baselined: true, toast: null };
  }
  if (level > ack) {
    return {
      ack: level,
      baselined: true,
      toast: decideLevelUpToast({ prevLevel: ack, nextLevel: level }),
    };
  }
  return { ack, baselined: true, toast: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/level-up.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/level-up.ts frontend/lib/level-up.test.ts
git commit -m "feat(xp): pure decideLevelUpToast helper"
```

---

### Task 2: Persisted per-address acknowledged level (`state/level-progress.ts`)

**Files:**
- Create: `frontend/state/level-progress.ts`
- Test: `frontend/state/level-progress.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const useLevelProgress; // zustand store
  // state: { acknowledged: Record<string, number>; acknowledge: (address: string, level: number) => void }
  ```
- `acknowledge` stores `max(existing, level)` per address; never lowers. Persist key `xp-arcade-level-progress`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/state/level-progress.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useLevelProgress } from "./level-progress";

beforeEach(() => {
  useLevelProgress.setState({ acknowledged: {} });
});

describe("useLevelProgress", () => {
  it("records an acknowledged level per address", () => {
    useLevelProgress.getState().acknowledge("SP_A", 5);
    useLevelProgress.getState().acknowledge("SP_B", 12);
    expect(useLevelProgress.getState().acknowledged).toEqual({ SP_A: 5, SP_B: 12 });
  });

  it("never lowers an acknowledged level", () => {
    useLevelProgress.getState().acknowledge("SP_A", 9);
    useLevelProgress.getState().acknowledge("SP_A", 4);
    expect(useLevelProgress.getState().acknowledged.SP_A).toBe(9);
  });

  it("raises an acknowledged level", () => {
    useLevelProgress.getState().acknowledge("SP_A", 4);
    useLevelProgress.getState().acknowledge("SP_A", 9);
    expect(useLevelProgress.getState().acknowledged.SP_A).toBe(9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run state/level-progress.test.ts`
Expected: FAIL — cannot resolve `./level-progress`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/state/level-progress.ts
"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type LevelProgressState = {
  /** address -> last acknowledged level (so a reload / wallet switch never re-toasts). */
  acknowledged: Record<string, number>;
  acknowledge: (address: string, level: number) => void;
};

export const useLevelProgress = create<LevelProgressState>()(
  persist(
    (set) => ({
      acknowledged: {},
      acknowledge: (address, level) =>
        set((s) => {
          const prev = s.acknowledged[address] ?? 0;
          if (level <= prev) return s;
          return { acknowledged: { ...s.acknowledged, [address]: level } };
        }),
    }),
    {
      name: "xp-arcade-level-progress",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({ acknowledged: state.acknowledged }),
    },
  ),
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run state/level-progress.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/state/level-progress.ts frontend/state/level-progress.test.ts
git commit -m "feat(xp): persisted per-address acknowledged-level store"
```

---

### Task 3: Connected-wallet stats hook (`hooks/useConnectedPlayerStats.ts`)

**Files:**
- Create: `frontend/hooks/useConnectedPlayerStats.ts`
- Test: `frontend/hooks/useConnectedPlayerStats.test.tsx`

**Interfaces:**
- Consumes: `useWallet` (`s.address`), `useMintTx` (`s.status`), `fetchAllScoreHoldings` from `@/lib/holdings`, `computePlayerStats` + `PlayerStats` from `@/lib/player-stats`.
- Produces:
  ```ts
  export function useConnectedPlayerStats(): { stats: PlayerStats | null };
  ```
- `stats` is null while loading, not connected, on error, or while the loaded data belongs to a previous address. Refetches when `useMintTx.status` becomes `"success"`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/hooks/useConnectedPlayerStats.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ScoreNft } from "@/lib/holdings";
import type { PlayerStats } from "@/lib/player-stats";

const fetchMock = vi.fn();
vi.mock("@/lib/holdings", () => ({
  fetchAllScoreHoldings: (addr: string) => fetchMock(addr),
}));

import { useWallet } from "@/state/wallet";
import { useMintTx } from "@/state/mint-tx";
import { useConnectedPlayerStats } from "./useConnectedPlayerStats";

// Enable React act() so createRoot + act() flush effects synchronously.
// @ts-expect-error -- non-standard React internal flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function nft(score: number): ScoreNft {
  return { id: score, gameId: 1, score, season: 1 } as ScoreNft;
}

// A probe component captures the hook's return into a module-level variable so
// the test can assert on it (no @testing-library renderHook in this project).
let probed: { stats: PlayerStats | null };
function Probe() {
  probed = useConnectedPlayerStats();
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  fetchMock.mockReset();
  useWallet.setState({ address: null });
  useMintTx.setState({ status: "pending" });
  probed = { stats: null };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

describe("useConnectedPlayerStats", () => {
  it("is null when no wallet is connected", () => {
    act(() => { root.render(<Probe />); });
    expect(probed.stats).toBeNull();
  });

  it("loads stats for the connected address", async () => {
    fetchMock.mockResolvedValue([nft(40), nft(60)]);
    useWallet.setState({ address: "SP_A" });
    await act(async () => { root.render(<Probe />); });
    expect(fetchMock).toHaveBeenCalledWith("SP_A");
    expect(probed.stats).not.toBeNull();
    expect(probed.stats!.totalScore).toBe(100);
  });

  it("stays null on fetch error", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    useWallet.setState({ address: "SP_A" });
    await act(async () => { root.render(<Probe />); });
    expect(fetchMock).toHaveBeenCalled();
    expect(probed.stats).toBeNull();
  });
});
```

> Note: `await act(async () => { ... })` flushes the effect's fetch promise
> (a microtask) and the follow-up re-render, so no `waitFor` is needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run hooks/useConnectedPlayerStats.test.tsx`
Expected: FAIL — cannot resolve `./useConnectedPlayerStats`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/hooks/useConnectedPlayerStats.ts
"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@/state/wallet";
import { useMintTx } from "@/state/mint-tx";
import { fetchAllScoreHoldings } from "@/lib/holdings";
import { computePlayerStats, type PlayerStats } from "@/lib/player-stats";

/**
 * The connected wallet's aggregate stats (carries on-chain base XP = totalScore),
 * fetched globally so the level-up watcher can run without the profile being open.
 * `stats` is null while loading / disconnected / on error, and whenever the loaded
 * data belongs to a previous address (mirrors PlayerProfileBody's guard so a
 * wallet switch never exposes stale stats). Reads dedupe via cachedRead.
 */
export function useConnectedPlayerStats(): { stats: PlayerStats | null } {
  const address = useWallet((s) => s.address);
  const mintStatus = useMintTx((s) => s.status);
  const mintConfirmed = mintStatus === "success";
  const [loaded, setLoaded] = useState<{ address: string; stats: PlayerStats } | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    fetchAllScoreHoldings(address)
      .then((nfts) => {
        if (!cancelled) setLoaded({ address, stats: computePlayerStats(nfts) });
      })
      .catch(() => {
        /* leave prior state; stats is gated on address match below */
      });
    return () => {
      cancelled = true;
    };
  }, [address, mintConfirmed]);

  const stats = loaded?.address === address ? loaded.stats : null;
  return { stats };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run hooks/useConnectedPlayerStats.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/hooks/useConnectedPlayerStats.ts frontend/hooks/useConnectedPlayerStats.test.tsx
git commit -m "feat(xp): global connected-wallet stats hook"
```

---

### Task 4: Level-up watcher hook (`hooks/useLevelUpToast.ts`)

**Files:**
- Create: `frontend/hooks/useLevelUpToast.ts`
- Test: `frontend/hooks/useLevelUpToast.test.tsx`

**Interfaces:**
- Consumes: `useWallet`, `usePlayXp` (`s.lifetimeXp`), `useDailyChallenge` (`s.bestStreak`, `s.hydrate`), `useToasts`, `useLevelProgress` (Task 2), `computeLevel` from `@/lib/level`, `levelUpStep` (Task 1), `useConnectedPlayerStats` (Task 3).
- Produces: `export function useLevelUpToast(): void;`
- Behavior: baseline silently on the first observation per address; toast on subsequent live increases; idle while disconnected or while `stats` is null.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/hooks/useLevelUpToast.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PlayerStats } from "@/lib/player-stats";

// stats come from a mocked dependency hook; base XP is held constant per test and
// the *live* increase is driven by bumping the real play-XP store (as a game-over
// would), which re-renders the probe.
let mockStats: PlayerStats | null = null;
vi.mock("./useConnectedPlayerStats", () => ({
  useConnectedPlayerStats: () => ({ stats: mockStats }),
}));

import { useWallet } from "@/state/wallet";
import { usePlayXp } from "@/state/play-xp";
import { useDailyChallenge } from "@/state/daily-challenge";
import { useToasts } from "@/state/toasts";
import { useLevelProgress } from "@/state/level-progress";
import { useLevelUpToast } from "./useLevelUpToast";

// @ts-expect-error -- non-standard React internal flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  useLevelUpToast();
  return null;
}
function statsWithScore(totalScore: number): PlayerStats {
  return { totalScore } as PlayerStats;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear(); // keep daily-challenge hydrate() from pulling stale streak
  mockStats = null;
  useWallet.setState({ address: "SP_A" });
  // computeLevel: level = floor(sqrt(xp/100)) + 1. xp 0 -> Lv1; 2500 -> Lv6; 4900 -> Lv8.
  usePlayXp.setState({ lifetimeXp: 0 });
  useDailyChallenge.setState({ bestStreak: 0, currentStreak: 0, lastCompletedDate: null });
  useToasts.setState({ toasts: [] });
  useLevelProgress.setState({ acknowledged: {} });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

describe("useLevelUpToast", () => {
  it("does nothing while stats are still loading", () => {
    mockStats = null;
    act(() => { root.render(<Probe />); });
    expect(useToasts.getState().toasts).toHaveLength(0);
    expect(useLevelProgress.getState().acknowledged.SP_A).toBeUndefined();
  });

  it("baselines silently on first observation (no toast)", () => {
    mockStats = statsWithScore(2500); // Lv6
    act(() => { root.render(<Probe />); });
    expect(useToasts.getState().toasts).toHaveLength(0);
    expect(useLevelProgress.getState().acknowledged.SP_A).toBe(6);
  });

  it("toasts on a live level increase after baseline", () => {
    mockStats = statsWithScore(2500); // Lv6 baseline
    act(() => { root.render(<Probe />); });
    expect(useToasts.getState().toasts).toHaveLength(0);
    act(() => { usePlayXp.setState({ lifetimeXp: 2400 }); }); // xp 4900 -> Lv8
    expect(useToasts.getState().toasts.length).toBeGreaterThan(0);
    expect(useLevelProgress.getState().acknowledged.SP_A).toBe(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run hooks/useLevelUpToast.test.tsx`
Expected: FAIL — cannot resolve `./useLevelUpToast`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/hooks/useLevelUpToast.ts
"use client";
import { useEffect, useMemo, useRef } from "react";
import { useWallet } from "@/state/wallet";
import { usePlayXp } from "@/state/play-xp";
import { useDailyChallenge } from "@/state/daily-challenge";
import { useToasts } from "@/state/toasts";
import { useLevelProgress } from "@/state/level-progress";
import { computeLevel } from "@/lib/level";
import { levelUpStep } from "@/lib/level-up";
import { useConnectedPlayerStats } from "./useConnectedPlayerStats";

/**
 * Watch the connected wallet's true level (base + play + streak) and push a
 * balloon toast when it rises live during the session. Baselines silently on the
 * first observation per address so XP earned while away is never announced, and
 * acts only once base stats have loaded so the number is never wrong-low. The
 * transition itself lives in the pure levelUpStep; this hook is just wiring.
 */
export function useLevelUpToast(): void {
  const address = useWallet((s) => s.address);
  const { stats } = useConnectedPlayerStats();
  const playXp = usePlayXp((s) => s.lifetimeXp);
  const bestStreak = useDailyChallenge((s) => s.bestStreak);
  const hydrateDaily = useDailyChallenge((s) => s.hydrate);
  const baselinedFor = useRef<string | null>(null);

  // daily-challenge is not a persist store; hydrate once so bestStreak is real
  // before we baseline (this runs before the async stats fetch resolves).
  useEffect(() => {
    hydrateDaily();
  }, [hydrateDaily]);

  const level = useMemo(
    () => (stats ? computeLevel(stats, { playXp, bestStreak }).level : null),
    [stats, playXp, bestStreak],
  );

  useEffect(() => {
    if (!address || level === null) return;
    // Read ack via getState (not a reactive selector): this effect writes ack
    // itself and must not re-fire on its own write.
    const ack = useLevelProgress.getState().acknowledged[address] ?? 0;
    const step = levelUpStep({
      baselined: baselinedFor.current === address,
      ack,
      level,
    });
    baselinedFor.current = address;
    if (step.toast) useToasts.getState().push(step.toast);
    useLevelProgress.getState().acknowledge(address, step.ack);
  }, [address, level]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run hooks/useLevelUpToast.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/hooks/useLevelUpToast.ts frontend/hooks/useLevelUpToast.test.tsx
git commit -m "feat(xp): level-up watcher hook"
```

---

### Task 5: Mount the watcher at the app root

**Files:**
- Create: `frontend/components/desktop/LevelUpWatcher.tsx`
- Modify: `frontend/app/page.tsx` (add import + render alongside `<Balloons/>`)

**Interfaces:**
- Consumes: `useLevelUpToast` (Task 4).
- Produces: `export function LevelUpWatcher(): null;`

- [ ] **Step 1: Create the watcher component**

```tsx
// frontend/components/desktop/LevelUpWatcher.tsx
"use client";
import { useLevelUpToast } from "@/hooks/useLevelUpToast";

/** Invisible: runs the level-up watcher inside a client boundary. */
export function LevelUpWatcher() {
  useLevelUpToast();
  return null;
}
```

- [ ] **Step 2: Wire it into `app/page.tsx`**

Add the import after the `Balloons` import (line 19):

```tsx
import { LevelUpWatcher } from "@/components/desktop/LevelUpWatcher";
```

Render it next to `<Balloons />` inside `<Desktop>`:

```tsx
        <Balloons />
        <LevelUpWatcher />
```

- [ ] **Step 3: Type-check and build**

Run: `npx tsc --noEmit`
Expected: clean (no errors).

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/desktop/LevelUpWatcher.tsx frontend/app/page.tsx
git commit -m "feat(xp): mount level-up watcher at app root"
```

---

### Task 6: Full gate + docs

**Files:**
- Modify: `HANDOFF.md` (note v2 level-up toast shipped) — optional, only if it keeps the doc accurate.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all green (existing 638 + the new level-up tests). Read the output; if any pre-existing test regressed, stop and fix.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: (Optional) Update HANDOFF.md**

Add a short line under the XP/Level section noting the level-up toast (v2) shipped on `main`, dated 2026-06-30, frontend-only.

- [ ] **Step 6: Commit (if HANDOFF touched)**

```bash
git add HANDOFF.md
git commit -m "docs: note level-up toast (XP/Level v2) shipped"
```

---

## Notes for the implementer

- `computeLevel` curve: `level = floor(sqrt(xp / 100)) + 1`, `xp = totalScore + playXp + bestStreak * 50`. So `totalScore` 2500 → Lv6, 4900 → Lv8 (used in the Task 4 test).
- `TITLE_BANDS`: Lv1 Rookie, Lv5 Player, Lv10 Pro, Lv15 Ace, Lv20 Veteran, Lv25 Master, Lv30 Arcade Legend. A toast is a "New title" success toast exactly when `levelTitle(next) !== levelTitle(prev)`.
- Do not refactor `PlayerProfileBody`'s own fetch; `cachedRead` already dedupes the duplicate holdings request.
- The watcher reads `acknowledged[address]` via `useLevelProgress.getState()` inside the effect (not as a reactive selector) on purpose — it writes that value itself and must not re-trigger on its own write.
```
