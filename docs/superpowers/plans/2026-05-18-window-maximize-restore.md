# XP Window Maximize / Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing (currently dead) Maximize titlebar button toggle every XP window between normal geometry and a maximized state filling the desktop above the taskbar, with a Restore affordance.

**Architecture:** Add a `maximized?` boolean to `WindowEntry` and a `toggleMaximize` store action that flips it and raises z. `Window.tsx` renders fixed full-desktop geometry when maximized, locks drag, swaps the button's `aria-label` to `Restore`, and toggles on titlebar double-click. No previous geometry is stored — `x/y` stay in the store and `width` is a static prop, so clearing the flag restores exactly.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Zustand 5, Vitest 3 (jsdom), xp.css.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `frontend/state/window-manager.ts` | Window store | `maximized?` on `WindowEntry`; `toggleMaximize` action |
| `frontend/state/window-manager.test.ts` | Store unit tests | Append `toggleMaximize` describe block |
| `frontend/components/windows/Window.tsx` | Window chrome/render | Maximized geometry, button wire + Restore label, drag lock, double-click, body overflow |
| `HANDOFF.md` | Manual-test checklist | Append manual steps |

All commands run from `frontend/` unless noted. Repo root: `/Users/vanhuy/Desktop/xp-snake`; frontend workspace: `/Users/vanhuy/Desktop/xp-snake/frontend`. Reliable type-check is `npx tsc --noEmit 2>&1 | grep -v '\.next/'` (empty = clean; raw `tsc` is noisy from pre-existing `.next/` generated-cache errors — a known project quirk). Branch for this work: `feat/window-maximize` (create from `main`).

---

### Task 1: `maximized` state + `toggleMaximize` action + tests

**Files:**
- Modify: `frontend/state/window-manager.ts`
- Test: `frontend/state/window-manager.test.ts`

- [ ] **Step 1: Write the failing tests**

In `frontend/state/window-manager.test.ts`, change the first two import lines from:
```ts
import { describe, it, expect } from "vitest";
import { isWindowActive, type WindowEntry } from "./window-manager";
```
to:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { isWindowActive, useWindows, type WindowEntry } from "./window-manager";
```

Then append at the END of the file:
```ts

describe("toggleMaximize", () => {
  beforeEach(() => {
    useWindows.setState({ windows: [], topZ: 10 });
  });

  it("sets maximized from undefined to true, raises z, keeps x/y", () => {
    useWindows.setState({
      windows: [
        { id: "a", type: "game", x: 5, y: 6, z: 11, minimized: false },
      ],
      topZ: 11,
    });
    useWindows.getState().toggleMaximize("a");
    const st = useWindows.getState();
    const w = st.windows.find((win) => win.id === "a")!;
    expect(w.maximized).toBe(true);
    expect(w.z).toBe(12);
    expect(st.topZ).toBe(12);
    expect(w.x).toBe(5);
    expect(w.y).toBe(6);
  });

  it("flips maximized true -> false on a second call", () => {
    useWindows.setState({
      windows: [
        {
          id: "a",
          type: "game",
          x: 0,
          y: 0,
          z: 11,
          minimized: false,
          maximized: true,
        },
      ],
      topZ: 11,
    });
    useWindows.getState().toggleMaximize("a");
    expect(
      useWindows.getState().windows.find((w) => w.id === "a")!.maximized,
    ).toBe(false);
  });

  it("is a true no-op for an unknown id (no topZ bump, no change)", () => {
    useWindows.setState({
      windows: [
        { id: "a", type: "game", x: 0, y: 0, z: 11, minimized: false },
      ],
      topZ: 11,
    });
    useWindows.getState().toggleMaximize("ghost");
    const st = useWindows.getState();
    expect(st.topZ).toBe(11);
    const w = st.windows.find((win) => win.id === "a")!;
    expect(w.maximized).toBeUndefined();
    expect(w.z).toBe(11);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- window-manager`
Expected: the 3 new `toggleMaximize` tests FAIL (TypeScript/runtime: `toggleMaximize` is not a function); the existing `isWindowActive` tests still pass.

- [ ] **Step 3: Add `maximized?` to `WindowEntry`**

In `frontend/state/window-manager.ts`, change:
```ts
export type WindowEntry = {
  id: string;
  type: WindowType;
  x: number;
  y: number;
  z: number;
  minimized: boolean;
  payload?: WindowPayload;
};
```
to:
```ts
export type WindowEntry = {
  id: string;
  type: WindowType;
  x: number;
  y: number;
  z: number;
  minimized: boolean;
  maximized?: boolean;
  payload?: WindowPayload;
};
```

- [ ] **Step 4: Declare `toggleMaximize` in the store type**

In the same file, change:
```ts
  minimize: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
};
```
to:
```ts
  minimize: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  toggleMaximize: (id: string) => void;
};
```

- [ ] **Step 5: Implement the `toggleMaximize` action**

In the same file, change:
```ts
  move: (id, x, y) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)),
    })),
}));
```
to:
```ts
  move: (id, x, y) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)),
    })),
  toggleMaximize: (id) =>
    set((s) => {
      if (!s.windows.some((w) => w.id === id)) return s;
      const z = s.topZ + 1;
      return {
        topZ: z,
        windows: s.windows.map((w) =>
          w.id === id ? { ...w, maximized: !w.maximized, z } : w,
        ),
      };
    }),
}));
```
(The early `return s` for an unknown id keeps it a true no-op — no spurious `topZ` increment. This insertion is before the `}));` that closes `create(...)`, i.e. above the previously-appended `isWindowActive` function — do not move that function.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- window-manager`
Expected: PASS — all `isWindowActive` tests plus the 3 new `toggleMaximize` tests (7 total in this file).

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -v '\.next/'`
Expected: empty (no source-level type errors).

- [ ] **Step 8: Commit**

```bash
git add frontend/state/window-manager.ts frontend/state/window-manager.test.ts
git commit -m "feat: add maximized state + toggleMaximize action + tests"
```

---

### Task 2: Wire Maximize/Restore in `Window.tsx`

**Files:**
- Modify: `frontend/components/windows/Window.tsx`

- [ ] **Step 1: Subscribe `toggleMaximize`**

In `frontend/components/windows/Window.tsx`, change:
```tsx
  const move = useWindows((s) => s.move);
```
to:
```tsx
  const move = useWindows((s) => s.move);
  const toggleMaximize = useWindows((s) => s.toggleMaximize);
```

- [ ] **Step 2: Maximized outer geometry**

In the same file, change:
```tsx
    <div
      className={`window window-opening${closing ? " window-closing" : ""}`}
      style={{ position: "absolute", left: win.x, top: win.y, zIndex: win.z, width }}
      onMouseDown={() => focus(id)}
```
to:
```tsx
    <div
      className={`window window-opening${closing ? " window-closing" : ""}`}
      style={
        win.maximized
          ? {
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 28,
              zIndex: win.z,
              display: "flex",
              flexDirection: "column",
            }
          : {
              position: "absolute",
              left: win.x,
              top: win.y,
              zIndex: win.z,
              width,
            }
      }
      onMouseDown={() => focus(id)}
```
(`bottom: 28` clears the 28px taskbar. `display:flex; flexDirection:column` lets the body fill remaining height — used in Step 5.)

- [ ] **Step 3: Lock drag + add double-click toggle on the titlebar**

In the same file, change:
```tsx
      <div
        ref={titlebarRef}
        className={`title-bar${isActive ? "" : " inactive"}`}
        onMouseDown={(e) => {
          // Flash only when window becomes active (was not active before)
          if (!isActive && titlebarRef.current && !flashingRef.current) {
            flashingRef.current = true;
            titlebarRef.current.style.filter = "brightness(1.4)";
            setTimeout(() => {
              if (titlebarRef.current) titlebarRef.current.style.filter = "";
              flashingRef.current = false;
            }, 80);
          }
          dragRef.current = { ox: e.clientX - win.x, oy: e.clientY - win.y };
```
to:
```tsx
      <div
        ref={titlebarRef}
        className={`title-bar${isActive ? "" : " inactive"}`}
        onDoubleClick={() => toggleMaximize(id)}
        onMouseDown={(e) => {
          // Flash only when window becomes active (was not active before)
          if (!isActive && titlebarRef.current && !flashingRef.current) {
            flashingRef.current = true;
            titlebarRef.current.style.filter = "brightness(1.4)";
            setTimeout(() => {
              if (titlebarRef.current) titlebarRef.current.style.filter = "";
              flashingRef.current = false;
            }, 80);
          }
          // No window dragging while maximized (focus/flash above still run).
          if (win.maximized) return;
          dragRef.current = { ox: e.clientX - win.x, oy: e.clientY - win.y };
```
(Only the `onDoubleClick` line and the `if (win.maximized) return;` line plus its comment are added; everything else in this block is unchanged.)

- [ ] **Step 4: Wire the Maximize button + Restore label**

In the same file, change:
```tsx
          <button aria-label="Minimize" onClick={() => minimize(id)} />
          <button aria-label="Maximize" />
          <button aria-label="Close" onClick={() => setClosing(true)} />
```
to:
```tsx
          <button aria-label="Minimize" onClick={() => minimize(id)} />
          <button
            aria-label={win.maximized ? "Restore" : "Maximize"}
            onClick={() => toggleMaximize(id)}
          />
          <button aria-label="Close" onClick={() => setClosing(true)} />
```

- [ ] **Step 5: Make the body scroll when maximized**

In the same file, change:
```tsx
      <div className="window-body">{children}</div>
```
to:
```tsx
      <div
        className="window-body"
        style={win.maximized ? { flex: 1, overflow: "auto" } : undefined}
      >
        {children}
      </div>
```
(With the maximized outer being a flex column, `flex:1` makes the body fill the space below the titlebar and `overflow:auto` scrolls tall content instead of clipping. Non-maximized passes `undefined` so existing behavior is unchanged.)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -v '\.next/'`
Expected: empty (no source-level type errors).

- [ ] **Step 7: Verify no test regressions**

Run: `npm test`
Expected: all pass (the new `toggleMaximize` tests from Task 1 plus all pre-existing tests; no regressions).

- [ ] **Step 8: Manual smoke (canvas/DOM not unit-testable)**

Run: `npm run dev`, open `http://localhost:3000`.
- Open High Scores → click the middle titlebar button → window fills the desktop and stops above the taskbar; the button now shows the Restore (double-rectangle) glyph.
- Click it again (or double-click the titlebar) → window returns to its exact previous position and width.
- While maximized, try to drag the titlebar → window does not move.
- Open Snake, maximize it → the 320px canvas is shown in the larger frame, game still playable; restore works.
- Maximize a window, minimize it via the left button, reopen it from the taskbar → it is still maximized.
- Maximize the My NFTs window when it has many NFTs → the body scrolls; nothing is clipped behind the taskbar.

- [ ] **Step 9: Commit**

```bash
git add frontend/components/windows/Window.tsx
git commit -m "feat(window): wire Maximize/Restore button, drag lock, double-click"
```

---

### Task 3: Manual-test steps in HANDOFF.md

**Files:**
- Modify: `HANDOFF.md` (repo root — `/Users/vanhuy/Desktop/xp-snake/HANDOFF.md`)

- [ ] **Step 1: Append the manual-test steps**

In `HANDOFF.md`, find this existing line in the **"As non-owner player:"** checklist:
```markdown
- [ ] Leaderboard → top-10 shows real addresses + scores (no "undefined"/NaN); countdown ticks
```
Immediately AFTER that line, insert these bullets (match the existing `- [ ] ` checkbox format and indentation):
```markdown
- [ ] Any window: click the middle titlebar button → fills desktop, stops above taskbar, button shows Restore glyph; click again restores exact prior position/size
- [ ] Double-click a titlebar → toggles maximize/restore; titlebar drag is disabled while maximized
- [ ] Maximize then minimize to taskbar then reopen → window is still maximized; maximizing the Snake window keeps the game playable; a maximized window with tall content scrolls (no clip behind taskbar)
```
Do not change anything else in the file.

- [ ] **Step 2: Verify only those lines were added**

Run (from repo root): `git diff HANDOFF.md`
Expected: exactly 3 added lines at the stated location, nothing else changed.

- [ ] **Step 3: Commit**

```bash
git add HANDOFF.md
git commit -m "docs: add manual-test steps for window maximize"
```

---

## Self-Review

**Spec coverage:**
- `maximized?` on `WindowEntry` + `toggleMaximize` (flips, raises z, no-op for unknown id, does not mutate x/y) → Task 1 Steps 3-5; tests Step 1. ✓
- Maximized geometry fixed above 28px taskbar, ignores x/y/width → Task 2 Step 2. ✓
- Button onClick + `aria-label` Restore swap → Task 2 Step 4. ✓
- Drag locked while maximized (focus/flash preserved) → Task 2 Step 3. ✓
- Double-click titlebar toggles → Task 2 Step 3. ✓
- `maximized` independent of `minimized` (retained across minimize/restore) → no code needed: `minimize`/`focus`/`open` never touch `maximized`; covered by Task 2 Step 8 manual check. ✓
- Body scrolls when maximized → Task 2 Step 5. ✓
- Unaffected auto-pause/active-detection: `toggleMaximize` only bumps z like `focus`; `isWindowActive`/`maxZ` unchanged → no task needed (verified by Task 1 tests still green + Task 2 Step 7). ✓
- Testing: unit for `toggleMaximize` (Task 1), manual in HANDOFF (Task 3). ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete before/after code; every command has expected output. ✓

**Type consistency:** `toggleMaximize: (id: string) => void` declared in the store type (Task 1 Step 4), implemented with matching `(id)` signature (Step 5), selected as `useWindows((s) => s.toggleMaximize)` and called `toggleMaximize(id)` in Task 2. `maximized?: boolean` added to `WindowEntry` (Step 3) and read as `win.maximized` in Task 2. Test literals include all required `WindowEntry` fields (`id/type/x/y/z/minimized`) with optional `maximized`. Names consistent across all tasks. ✓
