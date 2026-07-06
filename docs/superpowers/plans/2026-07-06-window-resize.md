# Window Edge-Resize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Utility windows (everything except `game-*`) can be resized by dragging any of the 4 edges / 4 corners, with correct cursors, min/max clamping, and remembered geometry on reopen.

**Architecture:** Pure geometry helpers + a `resize` action in the existing Zustand window-manager store; `Window.tsx` renders 8 invisible resize handles that drive the same mousedown→window-mousemove pattern the title-bar drag already uses. Game windows, maximize, and compact-viewport behavior are untouched.

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5, Zustand 5, Vitest 3 (jsdom, raw `createRoot` + `act` for component tests — this repo does NOT use @testing-library).

**Spec:** `docs/superpowers/specs/2026-07-06-window-resize-design.md`

## Global Constraints

- Frontend only — no contract changes, no new npm dependencies.
- All commands run from `frontend/` unless noted.
- Min window size **300 × 200** px; max = viewport width × (viewport height − 28px taskbar).
- Game windows (`game-*`, incl. `game-solitaire`) are never resizable. The browser IS resizable — do not reuse `isUtilityType` for this.
- Tests are colocated (`foo.test.ts` next to `foo.ts`). jsdom lacks `matchMedia`; stub it as existing tests do.
- Git: conventional prefixes, small green commits, **no Co-Authored-By**, stage explicit files.
- Run the actual test command and read its output before claiming a step done.

---

### Task 1: Pure geometry helpers (`isResizableType`, `clampGeometry`, `resizeGeometry`)

**Files:**
- Modify: `frontend/state/window-manager.ts`
- Test: `frontend/state/window-manager.test.ts`

**Interfaces:**
- Consumes: existing `WindowType` union in `window-manager.ts`.
- Produces (later tasks rely on these exact names/types):
  ```ts
  export type WindowGeometry = { x: number; y: number; w: number; h: number };
  export type ResizeEdges = { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean };
  export function isResizableType(type: WindowType): boolean;
  export function clampGeometry(geom: WindowGeometry, viewport: { width: number; height: number }): WindowGeometry;
  export function resizeGeometry(start: WindowGeometry, edges: ResizeEdges, dx: number, dy: number, viewport: { width: number; height: number }): WindowGeometry;
  ```

- [ ] **Step 1: Write the failing tests**

Append to `frontend/state/window-manager.test.ts` (add `isResizableType`, `clampGeometry`, `resizeGeometry` to the existing import from `./window-manager`):

```ts
describe("isResizableType", () => {
  it("allows utility windows and the browser", () => {
    expect(isResizableType("highscore")).toBe(true);
    expect(isResizableType("browser")).toBe(true);
    expect(isResizableType("swap")).toBe(true);
  });

  it("excludes every game window", () => {
    expect(isResizableType("game-snake")).toBe(false);
    expect(isResizableType("game-solitaire")).toBe(false);
  });
});

describe("clampGeometry", () => {
  const vp = { width: 1024, height: 768 };

  it("enforces the 300x200 minimum size", () => {
    const g = clampGeometry({ x: 50, y: 50, w: 100, h: 80 }, vp);
    expect(g.w).toBe(300);
    expect(g.h).toBe(200);
  });

  it("caps size to the viewport minus the 28px taskbar", () => {
    const g = clampGeometry({ x: 0, y: 0, w: 5000, h: 5000 }, vp);
    expect(g.w).toBe(1024);
    expect(g.h).toBe(740);
  });

  it("keeps the title bar reachable (same bounds as drag)", () => {
    const g = clampGeometry({ x: -900, y: -50, w: 400, h: 300 }, vp);
    expect(g.x).toBe(-400 + 60);
    expect(g.y).toBe(0);
  });

  it("lets min size win over a degenerate viewport", () => {
    const g = clampGeometry({ x: 0, y: 0, w: 400, h: 300 }, { width: 200, height: 100 });
    expect(g.w).toBe(300);
    expect(g.h).toBe(200);
  });
});

describe("resizeGeometry", () => {
  const vp = { width: 1024, height: 768 };
  const start = { x: 100, y: 80, w: 400, h: 300 };

  it("grows from the right/bottom edges by the pointer delta", () => {
    const g = resizeGeometry(start, { right: true, bottom: true }, 50, 40, vp);
    expect(g).toEqual({ x: 100, y: 80, w: 450, h: 340 });
  });

  it("dragging the left edge moves x and anchors the right edge", () => {
    const g = resizeGeometry(start, { left: true }, 50, 0, vp);
    expect(g).toEqual({ x: 150, y: 80, w: 350, h: 300 });
    expect(g.x + g.w).toBe(start.x + start.w);
  });

  it("keeps the right edge anchored when a left drag hits min width", () => {
    const g = resizeGeometry(start, { left: true }, 999, 0, vp);
    expect(g.w).toBe(300);
    expect(g.x + g.w).toBe(start.x + start.w);
  });

  it("dragging the top edge moves y and anchors the bottom edge", () => {
    const g = resizeGeometry(start, { top: true }, 0, 30, vp);
    expect(g).toEqual({ x: 100, y: 110, w: 400, h: 270 });
    expect(g.y + g.h).toBe(start.y + start.h);
  });

  it("resizes both axes from a corner", () => {
    const g = resizeGeometry(start, { top: true, right: true }, 20, -10, vp);
    expect(g).toEqual({ x: 100, y: 70, w: 420, h: 310 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run state/window-manager.test.ts`
Expected: FAIL — `isResizableType`, `clampGeometry`, `resizeGeometry` are not exported.

- [ ] **Step 3: Implement the helpers**

Add to `frontend/state/window-manager.ts` (below `isUtilityType`):

```ts
export type WindowGeometry = { x: number; y: number; w: number; h: number };
export type ResizeEdges = {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
};

export const MIN_WINDOW_W = 300;
export const MIN_WINDOW_H = 200;
const TASKBAR_H = 28;

/**
 * Resizable = every non-game window. Deliberately NOT isUtilityType: that
 * helper is Escape-close semantics and excludes the browser, which must
 * still be resizable.
 */
export function isResizableType(type: WindowType): boolean {
  return !type.startsWith("game-");
}

/**
 * Clamp a window's geometry: 300x200 minimum (which wins over a degenerate
 * viewport), viewport-minus-taskbar maximum, and position bounds matching
 * the title-bar drag clamp so the title bar stays reachable.
 */
export function clampGeometry(
  geom: WindowGeometry,
  viewport: { width: number; height: number },
): WindowGeometry {
  const w = Math.min(geom.w, Math.max(MIN_WINDOW_W, viewport.width));
  const h = Math.min(geom.h, Math.max(MIN_WINDOW_H, viewport.height - TASKBAR_H));
  const cw = Math.max(w, MIN_WINDOW_W);
  const ch = Math.max(h, MIN_WINDOW_H);
  return {
    x: Math.max(-cw + 60, Math.min(geom.x, viewport.width - 60)),
    y: Math.max(0, Math.min(geom.y, viewport.height - TASKBAR_H)),
    w: cw,
    h: ch,
  };
}

/**
 * Apply a pointer delta to the edges being dragged. Size is clamped first
 * and position derived from it, so when a left/top drag hits the size
 * limit the opposite edge stays anchored (real-Windows behavior).
 */
export function resizeGeometry(
  start: WindowGeometry,
  edges: ResizeEdges,
  dx: number,
  dy: number,
  viewport: { width: number; height: number },
): WindowGeometry {
  const raw: WindowGeometry = {
    x: start.x,
    y: start.y,
    w: edges.right ? start.w + dx : edges.left ? start.w - dx : start.w,
    h: edges.bottom ? start.h + dy : edges.top ? start.h - dy : start.h,
  };
  const clamped = clampGeometry(raw, viewport);
  return clampGeometry(
    {
      ...clamped,
      x: edges.left ? start.x + (start.w - clamped.w) : clamped.x,
      y: edges.top ? start.y + (start.h - clamped.h) : clamped.y,
    },
    viewport,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run state/window-manager.test.ts`
Expected: PASS (all suites in the file, old and new).

- [ ] **Step 5: Commit**

```bash
cd frontend
git add state/window-manager.ts state/window-manager.test.ts
git commit -m "feat(windows): pure geometry helpers for edge-resize"
```

---

### Task 2: Store — `w`/`h` on entries, `resize` action, geometry memory

**Files:**
- Modify: `frontend/state/window-manager.ts`
- Test: `frontend/state/window-manager.test.ts`

**Interfaces:**
- Consumes: `clampGeometry`, `WindowGeometry` from Task 1.
- Produces (Task 3 relies on these):
  - `WindowEntry` gains `w?: number; h?: number` (`undefined` = never resized: component-default width, auto height).
  - Store action `resize: (id: string, geom: WindowGeometry) => void` — no-op (same state ref) for unknown ids; clamps against the live viewport; updates per-type memory.
  - `lastPos` values widen to `{ x: number; y: number; w?: number; h?: number }`; `open` seeds `w`/`h` from memory; `move` preserves remembered `w`/`h`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/state/window-manager.test.ts`. jsdom's default viewport is 1024×768, so the geometries below survive the store's clamp. Reuse the `matchMedia` stub pattern from the existing "compact viewport" describe block:

```ts
describe("resize action + geometry memory", () => {
  const matchMedia = (matches: boolean) =>
    ((q: string) => ({
      matches,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;

  beforeEach(() => {
    useWindows.setState({ windows: [], topZ: 10, lastPos: {} });
    window.matchMedia = matchMedia(false);
  });

  it("applies geometry to the target window", () => {
    useWindows.getState().open("highscore");
    const id = useWindows.getState().windows[0].id;
    useWindows.getState().resize(id, { x: 40, y: 30, w: 640, h: 480 });
    const w = useWindows.getState().windows[0];
    expect([w.x, w.y, w.w, w.h]).toEqual([40, 30, 640, 480]);
  });

  it("clamps below-minimum geometry", () => {
    useWindows.getState().open("highscore");
    const id = useWindows.getState().windows[0].id;
    useWindows.getState().resize(id, { x: 40, y: 30, w: 10, h: 10 });
    const w = useWindows.getState().windows[0];
    expect([w.w, w.h]).toEqual([300, 200]);
  });

  it("is a same-ref no-op for unknown ids", () => {
    useWindows.getState().open("highscore");
    const before = useWindows.getState().windows;
    useWindows.getState().resize("nope", { x: 0, y: 0, w: 400, h: 300 });
    expect(useWindows.getState().windows).toBe(before);
  });

  it("remembers geometry so reopen restores it", () => {
    useWindows.getState().open("highscore");
    const id = useWindows.getState().windows[0].id;
    useWindows.getState().resize(id, { x: 40, y: 30, w: 640, h: 480 });
    useWindows.getState().close(id);
    useWindows.getState().open("highscore");
    const w = useWindows.getState().windows[0];
    expect([w.x, w.y, w.w, w.h]).toEqual([40, 30, 640, 480]);
  });

  it("move updates position without clobbering remembered size", () => {
    useWindows.getState().open("highscore");
    const id = useWindows.getState().windows[0].id;
    useWindows.getState().resize(id, { x: 40, y: 30, w: 640, h: 480 });
    useWindows.getState().move(id, 200, 150);
    useWindows.getState().close(id);
    useWindows.getState().open("highscore");
    const w = useWindows.getState().windows[0];
    expect([w.x, w.y, w.w, w.h]).toEqual([200, 150, 640, 480]);
  });

  it("windows that never resized reopen without w/h", () => {
    useWindows.getState().open("highscore");
    const id = useWindows.getState().windows[0].id;
    useWindows.getState().move(id, 200, 150);
    useWindows.getState().close(id);
    useWindows.getState().open("highscore");
    const w = useWindows.getState().windows[0];
    expect([w.x, w.y, w.w, w.h]).toEqual([200, 150, undefined, undefined]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run state/window-manager.test.ts`
Expected: FAIL — `resize` is not a function / TypeScript error on the `S` type.

- [ ] **Step 3: Implement the store changes**

In `frontend/state/window-manager.ts`:

1. `WindowEntry` — add after `maximized?: boolean;`:

```ts
  /** Set once the user has resized; undefined = default width, auto height. */
  w?: number;
  h?: number;
```

2. The `S` type — widen `lastPos` and add `resize`:

```ts
  lastPos: Partial<Record<WindowType, { x: number; y: number; w?: number; h?: number }>>;
  resize: (id: string, geom: WindowGeometry) => void;
```

3. In `open`, seed size from memory. The existing lines:

```ts
    const remembered = get().lastPos[type];
    const pos = remembered ?? cascadePosition(get().windows.length);
```

stay as-is; in the new-window object add after `y: pos.y,`:

```ts
          w: remembered?.w,
          h: remembered?.h,
```

4. In `move`, preserve remembered size — replace the `lastPos` line with:

```ts
        lastPos: win
          ? { ...s.lastPos, [win.type]: { ...s.lastPos[win.type], x, y } }
          : s.lastPos,
```

5. Add the `resize` action (next to `move`):

```ts
  resize: (id, geom) =>
    set((s) => {
      const win = s.windows.find((w) => w.id === id);
      // no-op: unknown id — same state ref so Zustand skips re-render
      if (!win) return s;
      const g =
        typeof window === "undefined"
          ? geom
          : clampGeometry(geom, {
              width: window.innerWidth,
              height: window.innerHeight,
            });
      return {
        windows: s.windows.map((w) =>
          w.id === id ? { ...w, x: g.x, y: g.y, w: g.w, h: g.h } : w,
        ),
        lastPos: { ...s.lastPos, [win.type]: { x: g.x, y: g.y, w: g.w, h: g.h } },
      };
    }),
```

- [ ] **Step 4: Run tests + type-check**

Run: `cd frontend && npx vitest run state/window-manager.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add state/window-manager.ts state/window-manager.test.ts
git commit -m "feat(windows): resize action + per-type geometry memory"
```

---

### Task 3: `Window.tsx` — 8 resize handles + height-aware layout

**Files:**
- Modify: `frontend/components/windows/Window.tsx`
- Create: `frontend/components/windows/Window.test.tsx`

**Interfaces:**
- Consumes (exact, from Tasks 1–2): `isResizableType(type)`, `resizeGeometry(start, edges, dx, dy, viewport)`, store action `resize(id, geom)`, entry fields `win.w` / `win.h`, types `WindowGeometry`, `ResizeEdges`.
- Produces: handles carry `data-resize="n|s|e|w|nw|ne|sw|se"` (the component test and any e2e hook onto this attribute).

- [ ] **Step 1: Write the failing component test**

Create `frontend/components/windows/Window.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Window } from "./Window";
import { useWindows, type WindowType } from "@/state/window-manager";

// Enable React act() so createRoot + act() flush effects synchronously
// @ts-expect-error -- non-standard React internal flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const matchMedia = (matches: boolean) =>
  ((q: string) => ({
    matches,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;

let container: HTMLDivElement;
let root: Root;

function seed(type: WindowType, opts: { maximized?: boolean } = {}) {
  useWindows.setState({
    windows: [
      {
        id: "test-win",
        type,
        x: 100,
        y: 80,
        z: 11,
        minimized: false,
        maximized: opts.maximized,
      },
    ],
    topZ: 11,
    lastPos: {},
  });
}

function render() {
  act(() => {
    root.render(
      <Window id="test-win" title="Test">
        <p>body</p>
      </Window>,
    );
  });
}

beforeEach(() => {
  window.matchMedia = matchMedia(false);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
});

describe("Window resize handles", () => {
  it("renders all 8 handles for a resizable window", () => {
    seed("highscore");
    render();
    const dirs = [...container.querySelectorAll("[data-resize]")].map((el) =>
      el.getAttribute("data-resize"),
    );
    expect(dirs.sort()).toEqual(["e", "n", "ne", "nw", "s", "se", "sw", "w"]);
  });

  it("renders no handles for a game window", () => {
    seed("game-snake");
    render();
    expect(container.querySelectorAll("[data-resize]").length).toBe(0);
  });

  it("renders no handles while maximized", () => {
    seed("highscore", { maximized: true });
    render();
    expect(container.querySelectorAll("[data-resize]").length).toBe(0);
  });

  it("renders no handles on compact viewports", () => {
    window.matchMedia = matchMedia(true);
    seed("highscore");
    render();
    expect(container.querySelectorAll("[data-resize]").length).toBe(0);
  });

  it("applies a dragged size to the window frame", () => {
    seed("highscore");
    useWindows.setState({
      windows: useWindows
        .getState()
        .windows.map((w) => ({ ...w, w: 640, h: 480 })),
    });
    render();
    const frame = container.querySelector(".window") as HTMLElement;
    expect(frame.style.width).toBe("640px");
    expect(frame.style.height).toBe("480px");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run components/windows/Window.test.tsx`
Expected: FAIL — zero `[data-resize]` elements found for the resizable cases.

- [ ] **Step 3: Implement handles and layout in `Window.tsx`**

In `frontend/components/windows/Window.tsx`:

1. Extend the imports — add `CSSProperties` to the react import and pull the new helpers from the store:

```ts
import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";
import {
  useWindows,
  isResizableType,
  resizeGeometry,
  type ResizeEdges,
} from "@/state/window-manager";
```

2. Module-level handle specs (above the component). Edge strips are inset by the corner size so corners win the hit test without z-order tricks:

```ts
const EDGE = 6;
const CORNER = 12;

const RESIZE_HANDLES: {
  dir: string;
  edges: ResizeEdges;
  style: CSSProperties;
}[] = [
  { dir: "n", edges: { top: true }, style: { top: 0, left: CORNER, right: CORNER, height: EDGE, cursor: "ns-resize" } },
  { dir: "s", edges: { bottom: true }, style: { bottom: 0, left: CORNER, right: CORNER, height: EDGE, cursor: "ns-resize" } },
  { dir: "e", edges: { right: true }, style: { top: CORNER, bottom: CORNER, right: 0, width: EDGE, cursor: "ew-resize" } },
  { dir: "w", edges: { left: true }, style: { top: CORNER, bottom: CORNER, left: 0, width: EDGE, cursor: "ew-resize" } },
  { dir: "nw", edges: { top: true, left: true }, style: { top: 0, left: 0, width: CORNER, height: CORNER, cursor: "nwse-resize" } },
  { dir: "ne", edges: { top: true, right: true }, style: { top: 0, right: 0, width: CORNER, height: CORNER, cursor: "nesw-resize" } },
  { dir: "sw", edges: { bottom: true, left: true }, style: { bottom: 0, left: 0, width: CORNER, height: CORNER, cursor: "nesw-resize" } },
  { dir: "se", edges: { bottom: true, right: true }, style: { bottom: 0, right: 0, width: CORNER, height: CORNER, cursor: "nwse-resize" } },
];
```

3. Inside the component: grab the action, a root ref, and the effective width. After the existing `toggleMaximize` line add `const resize = useWindows((s) => s.resize);`. Add `const rootRef = useRef<HTMLDivElement>(null);` next to the other refs. After the `isActive` line:

```ts
  const effectiveWidth = win.w ?? width;
  const resizable =
    isResizableType(win.type) && !win.maximized && !compactViewport;

  const startResize =
    (edges: ResizeEdges) => (e: React.MouseEvent) => {
      e.preventDefault();
      const start = {
        x: win.x,
        y: win.y,
        w: effectiveWidth,
        // First-ever resize: measure the current auto height.
        h: win.h ?? rootRef.current?.offsetHeight ?? 200,
      };
      const sx = e.clientX;
      const sy = e.clientY;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const onMove = (ev: MouseEvent) => {
        resize(id, resizeGeometry(start, edges, ev.clientX - sx, ev.clientY - sy, viewport));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
```

4. Attach `ref={rootRef}` to the root `div` (the one with `role="dialog"`).

5. Non-maximized style branch — replace the current object with one that honors `win.w`/`win.h` (once `h` is set the frame becomes a fixed-height flex column and the body scrolls, same treatment as maximized):

```ts
          : {
              position: "absolute",
              left: win.x,
              top: win.y,
              zIndex: win.z,
              width: effectiveWidth,
              maxWidth: "calc(100vw - 8px)",
              ...(win.h
                ? {
                    height: win.h,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }
                : { maxHeight: "calc(100vh - 36px)", overflow: "auto" }),
            }
```

6. Drag clamp uses the effective width — in the title-bar `onMouseDown`, change

```ts
            const clampedX = Math.max(-width + 60, Math.min(rawX, vw - 60));
```

to

```ts
            const clampedX = Math.max(-effectiveWidth + 60, Math.min(rawX, vw - 60));
```

7. `window-body` style condition — include the fixed-height case:

```ts
        style={
          win.maximized || compactViewport || win.h
            ? { flex: 1, overflow: "auto" }
            : undefined
        }
```

8. Render the handles as the last children of the root `div`, after the `window-body` div:

```tsx
      {resizable &&
        RESIZE_HANDLES.map((h) => (
          <div
            key={h.dir}
            data-resize={h.dir}
            onMouseDown={startResize(h.edges)}
            style={{ position: "absolute", zIndex: 3, ...h.style }}
          />
        ))}
```

(No `stopPropagation`: the mousedown bubbles to the root div, which focuses the window — desired. The title-bar drag handler is a sibling, so it is unaffected.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run components/windows/Window.test.tsx state/window-manager.test.ts`
Expected: PASS (all cases in both files).

- [ ] **Step 5: Commit**

```bash
cd frontend
git add components/windows/Window.tsx components/windows/Window.test.tsx
git commit -m "feat(windows): 8-direction edge-resize handles on utility windows"
```

---

### Task 4: Full gate + runtime verification

**Files:**
- No new files; read-only verification.

**Interfaces:**
- Consumes: everything above.
- Produces: green full gate; runtime-verified resize behavior.

- [ ] **Step 1: Full test suite**

Run: `cd frontend && npm test`
Expected: all suites pass (baseline was 683 tests; now strictly more). Read the summary line — do not claim green without it.

- [ ] **Step 2: Type-check and lint**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: no errors. (Gotcha from repo memory: if `tsc` reports phantom errors in `.next/`, delete `.next/` and re-run.)

- [ ] **Step 3: Runtime smoke via dev server + Playwright MCP**

Run `cd frontend && npm run dev`, open `http://localhost:3000`, then with the Playwright browser tools:
1. Open High Scores from the desktop/Start menu.
2. Verify 8 `[data-resize]` elements exist on the window and cursors are correct (`getComputedStyle(el).cursor`).
3. Drag the `se` handle (mouse down → move +150,+120 → up): window grows; body scrolls inside, no layout break.
4. Drag the `w` handle leftward: window widens while the right edge stays put.
5. Drag far past the minimum: window stops at 300×200.
6. Close and reopen High Scores: size and position restored.
7. Maximize: handles disappear; restore: dragged size returns.
8. Open Snake: no resize handles on a game window.

Expected: all 8 checks hold. Fix and re-run the gate if any fail.

- [ ] **Step 4: Update docs if behavior notes drift**

If `.claude/docs/frontend.md` describes windows as fixed-size, add one line about utility-window resize + geometry memory. Skip if not mentioned there.

- [ ] **Step 5: Final commit (only if Step 4 changed docs)**

```bash
git add .claude/docs/frontend.md
git commit -m "docs: note utility-window edge-resize in frontend docs"
```
