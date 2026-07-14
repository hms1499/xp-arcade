# Resizable Game Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player drag any game window's edges to scale the play field up or down, continuously, without touching a single game engine.

**Architecture:** The play field keeps its hard-pixel DOM layout and is scaled with a CSS `transform`. `GameShellWindow` wraps `{children}` in a **viewport layer** (`flex: 1; overflow: hidden`, centring) and a **stage layer** (`transform: scale(k)`). Because `transform` does not affect layout, the stage's `offsetWidth`/`offsetHeight` always report the game's *natural* size — a `ResizeObserver` reads it, so no per-game size constant exists. A pure `computeGameScale()` turns (available, natural) into `k`. `isResizableType()` stops excluding `game-*`, which activates the 8-direction resize handles `Window.tsx` already renders.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zustand 5, Vitest 3, `98.css`.

**Spec:** `docs/superpowers/specs/2026-07-14-game-window-resize-design.md`

## Global Constraints

- Only the play field scales. The toolbar, score row, goal row and `ChallengeBanner` in `GameShellWindow` keep their native size — never place them inside the stage layer.
- No game engine, keyboard handler, collision routine or scoring path may change. Files under `components/game/*/` are **not** touched by this plan.
- `MIN_GAME_SCALE = 0.25`, `MAX_GAME_SCALE = 3`. The floor must never bind at the smallest window the manager permits (`MIN_WINDOW_W = 300`, `MIN_WINDOW_H = 200`), or the field gets clipped by `overflow: hidden`.
- Aspect ratio is always preserved: `k = min(availW/naturalW, availH/naturalH)`. Leftover space becomes Win95 grey letterbox.
- Mobile is unchanged: `Window.tsx` already gates resize behind `!compactViewport`.
- Run from `frontend/`. Full gate before the final commit: `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
- Git: conventional prefixes, small green commits, stage explicit files, no `Co-Authored-By`.

---

### Task 1: Pure scale function

**Files:**
- Create: `frontend/lib/game-scale.ts`
- Test: `frontend/lib/game-scale.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `computeGameScale(input: GameScaleInput): number`, `type GameScaleInput = { availW: number; availH: number; naturalW: number; naturalH: number }`, `MIN_GAME_SCALE = 0.25`, `MAX_GAME_SCALE = 3`. Task 3 imports all of these.

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/game-scale.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeGameScale, MIN_GAME_SCALE, MAX_GAME_SCALE } from "./game-scale";

const NATURAL = { naturalW: 640, naturalH: 480 };

describe("computeGameScale", () => {
  it("returns 1 when the viewport exactly fits the natural size", () => {
    expect(computeGameScale({ availW: 640, availH: 480, ...NATURAL })).toBe(1);
  });

  it("scales by the limiting axis when width is the constraint", () => {
    // 320/640 = 0.5 vs 480/480 = 1 -> width wins, aspect ratio preserved.
    expect(computeGameScale({ availW: 320, availH: 480, ...NATURAL })).toBe(0.5);
  });

  it("scales by the limiting axis when height is the constraint", () => {
    // 1280/640 = 2 vs 240/480 = 0.5 -> height wins.
    expect(computeGameScale({ availW: 1280, availH: 240, ...NATURAL })).toBe(0.5);
  });

  it("clamps at MAX_GAME_SCALE on a very large viewport", () => {
    expect(computeGameScale({ availW: 6400, availH: 4800, ...NATURAL })).toBe(MAX_GAME_SCALE);
  });

  it("returns 1 while the natural size is still unmeasured", () => {
    expect(computeGameScale({ availW: 800, availH: 600, naturalW: 0, naturalH: 0 })).toBe(1);
  });

  it("returns 1 for a degenerate viewport mid-layout instead of collapsing", () => {
    expect(computeGameScale({ availW: 0, availH: 0, ...NATURAL })).toBe(1);
  });

  // The floor exists only as a guard. If it ever binds, the scaled field would be
  // wider than the viewport that clips it, and part of the game would be
  // invisible. The smallest window the manager allows is 300x200; assert the
  // field still fits inside it, for a game larger than any we ship.
  it("keeps the field inside the viewport at the smallest allowed window", () => {
    const availW = 300;
    const availH = 200;
    const big = { naturalW: 900, naturalH: 700 };
    const k = computeGameScale({ availW, availH, ...big });
    expect(k).toBeGreaterThan(MIN_GAME_SCALE);
    expect(big.naturalW * k).toBeLessThanOrEqual(availW);
    expect(big.naturalH * k).toBeLessThanOrEqual(availH);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd frontend && npx vitest run lib/game-scale.test.ts`
Expected: FAIL — the file `./game-scale` does not exist, so the suite cannot collect ("Failed to resolve import").

- [ ] **Step 3: Write the minimal implementation**

Create `frontend/lib/game-scale.ts`:

```ts
/**
 * The floor is a guard, not a design knob: a scale clamped ABOVE what the
 * window affords would push the field past the viewport that clips it, hiding
 * part of the game. It sits below anything reachable from the 300x200 window
 * minimum. The ceiling is the bound meant to be felt -- it stops a maximized
 * window on a large display from blowing the field up into abstract art.
 */
export const MIN_GAME_SCALE = 0.25;
export const MAX_GAME_SCALE = 3;

export type GameScaleInput = {
  availW: number;
  availH: number;
  naturalW: number;
  naturalH: number;
};

/**
 * Uniform scale that fits a game's natural pixel size into the space its window
 * currently affords. Takes the smaller ratio so the field never distorts; the
 * leftover space on the long axis becomes letterbox.
 *
 * Returns 1 when either size is unmeasured or degenerate (first paint, or a
 * transient zero-size box mid-layout), so games open at exactly the size they
 * have today.
 */
export function computeGameScale({
  availW,
  availH,
  naturalW,
  naturalH,
}: GameScaleInput): number {
  if (naturalW <= 0 || naturalH <= 0) return 1;
  if (availW <= 0 || availH <= 0) return 1;
  const fit = Math.min(availW / naturalW, availH / naturalH);
  return Math.min(MAX_GAME_SCALE, Math.max(MIN_GAME_SCALE, fit));
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd frontend && npx vitest run lib/game-scale.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/game-scale.ts frontend/lib/game-scale.test.ts
git commit -m "feat(games): pure fit-to-window scale for the play field"
```

---

### Task 2: Admit game windows to the resize allowlist

**Files:**
- Modify: `frontend/state/window-manager.ts:80-86` (the `isResizableType` doc comment + body)
- Test: `frontend/state/window-manager.test.ts:283-293` (the existing `isResizableType` describe block)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `isResizableType(type)` now returns `true` for every `WindowType`. `Window.tsx:76` already calls it, so the 8 resize handles start rendering on game windows with no change there.

- [ ] **Step 1: Flip the existing test to the new expectation**

In `frontend/state/window-manager.test.ts`, the block at line 283 currently asserts games are NOT resizable. Replace the whole `describe("isResizableType", ...)` block with:

```ts
describe("isResizableType", () => {
  it("allows utility windows", () => {
    expect(isResizableType("highscore")).toBe(true);
    expect(isResizableType("browser")).toBe(true);
    expect(isResizableType("swap")).toBe(true);
  });

  it("allows game windows -- the play field scales to fit", () => {
    expect(isResizableType("game-snake")).toBe(true);
    expect(isResizableType("game-solitaire")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd frontend && npx vitest run state/window-manager.test.ts -t isResizableType`
Expected: FAIL — "allows game windows" gets `false`, expected `true`.

- [ ] **Step 3: Write the minimal implementation**

In `frontend/state/window-manager.ts`, replace the comment + function at lines 80-86:

```ts
/**
 * Every window resizes. Games included: the play field keeps its hard-pixel
 * layout and GameShellWindow scales it to fit (see lib/game-scale.ts), so a
 * wider window means a bigger board, not empty space around a fixed one.
 */
export function isResizableType(_type: WindowType): boolean {
  return true;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd frontend && npx vitest run state/window-manager.test.ts`
Expected: PASS — the whole file, including the flipped block.

- [ ] **Step 5: Commit**

```bash
git add frontend/state/window-manager.ts frontend/state/window-manager.test.ts
git commit -m "feat(windows): let game windows resize"
```

---

### Task 3: Viewport + stage layers in GameShellWindow

**Files:**
- Modify: `frontend/components/shared/GameShellWindow.tsx` (imports; new refs/state/effect; line 121-124 outer style; line 235 stage div)

**Interfaces:**
- Consumes: `computeGameScale`, `GameScaleInput` from `frontend/lib/game-scale.ts` (Task 1). Relies on Task 2 for the resize handles to exist at all.
- Produces: nothing new for later tasks.

**Why a ResizeObserver and not a constant:** `transform` does not change an element's layout box, so the stage's `offsetWidth`/`offsetHeight` report the game's natural size *at any scale*. Measuring beats declaring a `NATURAL_SIZE` per game: nothing drifts when someone edits `CELL_SIZE`. There is no feedback loop — the viewport's size comes from the window's flex layout and never depends on the stage's size, which `overflow: hidden` isolates.

- [ ] **Step 1: Add the imports**

At the top of `frontend/components/shared/GameShellWindow.tsx`, the file already imports React hooks; ensure `useEffect`, `useRef` and `useState` are in the `react` import, then add:

```ts
import { computeGameScale } from "@/lib/game-scale";
```

- [ ] **Step 2: Add refs, state and the measuring effect**

Inside `GameShellWindow`, after the existing hooks and **before** `if (!w) return null;` (line 111) — hooks must not sit behind an early return:

```ts
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const viewport = viewportRef.current;
    const stage = stageRef.current;
    if (!viewport || !stage) return;

    // The viewport is the space the window's geometry leaves for the field.
    const viewportObserver = new ResizeObserver(() => {
      setAvail({ w: viewport.clientWidth, h: viewport.clientHeight });
    });
    // offsetWidth/offsetHeight ignore the stage's own transform, so this stays
    // the game's natural size no matter what scale is applied.
    const stageObserver = new ResizeObserver(() => {
      setNatural({ w: stage.offsetWidth, h: stage.offsetHeight });
    });

    viewportObserver.observe(viewport);
    stageObserver.observe(stage);
    setAvail({ w: viewport.clientWidth, h: viewport.clientHeight });
    setNatural({ w: stage.offsetWidth, h: stage.offsetHeight });

    return () => {
      viewportObserver.disconnect();
      stageObserver.disconnect();
    };
  }, []);

  const scale = computeGameScale({
    availW: avail.w,
    availH: avail.h,
    naturalW: natural.w,
    naturalH: natural.h,
  });
```

- [ ] **Step 3: Make the shell fill the window**

The stage can only claim leftover height if its ancestors have a height to give. At line 121-124, add `height: "100%"` to the outer content div:

```tsx
      <div
        className="game-shell-content"
        style={{ display: "flex", flexDirection: "column", height: "100%" }}
      >
```

- [ ] **Step 4: Replace the stage div with the two layers**

Replace line 235 — `<div className="game-shell-stage p-2">{children}</div>` — with:

```tsx
        <div
          ref={viewportRef}
          className="game-shell-stage"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            ref={stageRef}
            className="game-shell-stage-inner p-2"
            style={{
              flex: "none",
              transform: `scale(${scale})`,
              transformOrigin: "center",
            }}
          >
            {children}
          </div>
        </div>
```

- [ ] **Step 5: Type-check and run the full suite**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: `tsc` clean; every test passes (754 before this plan, plus Task 1's 7).

- [ ] **Step 6: Commit**

```bash
git add frontend/components/shared/GameShellWindow.tsx
git commit -m "feat(games): scale the play field to fit its window"
```

---

### Task 4: Verify in a real browser

**Files:** none (verification only).

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: evidence. A green unit suite cannot tell you a click lands on the right Minesweeper cell at 1.7x — only a browser can.

- [ ] **Step 1: Build and start the dev server**

Run: `cd frontend && npm run build && npm run dev`
Expected: build exits 0; dev server on `http://localhost:3000`.

- [ ] **Step 2: Drag a keyboard game bigger and smaller**

Open Tetris from the Start menu. Drag the bottom-right corner outward, then inward past the original size.
Expected: the board grows and shrinks, always centred, never distorted, with grey letterbox on the long axis. The toolbar, score row and goal row stay the same size throughout. Arrow keys still move pieces at both extremes.

- [ ] **Step 3: Verify pointer accuracy on a mouse game at a non-1 scale**

Open Minesweeper. Resize the window so the field is clearly scaled (not 1x). Click specific cells near the edges of the board and right-click to flag.
Expected: every click lands on the cell under the cursor. This is the one behaviour that would break if the transform and hit-testing disagreed.

- [ ] **Step 4: Verify the smallest window does not clip the field**

Drag a game window down to its minimum (300x200).
Expected: the whole play field is still visible inside the window — shrunken, not cut off. If any part is clipped, `MIN_GAME_SCALE` is binding and Task 1's floor is wrong.

- [ ] **Step 5: Verify Solitaire, which opens maximized**

Open Solitaire (it opens maximized: `window-manager.ts:194`). Restore it, then resize.
Expected: no handles while maximized (existing behaviour); after restore, handles appear and the board scales. Dragging a card at a non-1 scale drops it on the pile under the cursor.

- [ ] **Step 6: Commit any fixes, then record the result**

If steps 2-5 all pass, nothing to commit. If a step fails, fix it, re-run `npx vitest run`, and commit the fix with a `fix(games):` prefix describing the actual defect.

---

## Self-Review

**Spec coverage:**
- Spec §3 uniform CSS scale, viewport + stage layers → Task 3.
- Spec §3 pure `computeGameScale`, `MIN_GAME_SCALE`/`MAX_GAME_SCALE`, floor must not bind → Task 1 (including the "field fits at the smallest window" test).
- Spec §3 chrome does not scale → Global Constraints + Task 3 keeps toolbar/score/goal rows outside the stage.
- Spec §3 `isResizableType` admits games → Task 2.
- Spec §3 engines untouched, mobile unchanged → Global Constraints; no task touches `components/game/*/` or the `compactViewport` gate.
- Spec §5 testing: unit tests in Tasks 1-2; the manual browser pass (Minesweeper/Solitaire pointer accuracy, keyboard play) is Task 4.
- Spec §6 risk "Solitaire opens maximized" → Task 4 Step 5.

**Placeholders:** none. Every code step carries the code; every run step carries the command and the expected result.

**Type consistency:** `computeGameScale` takes `{ availW, availH, naturalW, naturalH }` in Task 1 and is called with exactly those four keys in Task 3. `MIN_GAME_SCALE`/`MAX_GAME_SCALE` are named identically in Task 1's implementation, its test, and this plan's constraints.
