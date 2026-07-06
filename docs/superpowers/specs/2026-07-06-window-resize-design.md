# Window Resize — Design

**Date:** 2026-07-06
**Status:** Approved (brainstorm with user)
**Scope:** Frontend only. No contract changes.

## 1. Problem

Windows in the Win95 shell have working Minimize / Maximize / Close buttons,
but they cannot be freely resized by dragging their edges the way a real
Windows application can. Every window renders at a fixed per-component width
with auto height.

## 2. Goals

- Utility windows (High Scores, My NFTs, Player Profile, Hall of Fame,
  Arcade Champion, Season Admin, Control Panel, How It Works, Internet, Swap)
  can be resized by dragging any of the 4 edges or 4 corners, with the
  correct directional cursor on hover — matching real Win95 behavior.
- Game windows stay fixed-size. This is authentic (Win95 Minesweeper is not
  resizable) and avoids touching game canvas scaling.
- Reopening a window restores both its last position **and** last size.

## 3. Non-goals

- Resizing game windows or scaling game canvases.
- Minimize/maximize animations, taskbar toggle-minimize (possible follow-ups,
  explicitly deferred by user choice).
- Touch-based resize. Compact viewports render windows full-screen already;
  resize is a desktop-pointer feature.
- Persisting sizes across page reloads (matches existing in-memory `lastPos`
  behavior).

## 4. Design

### 4.1 Store (`frontend/state/window-manager.ts`)

- `WindowEntry` gains `w?: number; h?: number`. `undefined` means "never
  resized": the window keeps its component-default width and auto height,
  exactly as today.
- New pure helper `isResizableType(type: WindowType): boolean` — true for
  every type that does **not** start with `game-`. (Deliberately not reusing
  `isUtilityType`, whose semantics are Escape-to-close and which excludes
  `browser`; the browser window must be resizable.)
- New action `resize(id, geom: { x: number; y: number; w: number; h: number })`:
  - Unknown id → return same state ref (no-op, mirrors `toggleMaximize`).
  - Sets `x/y/w/h` in one update — dragging the left or top edge moves the
    window while resizing, as in real Windows.
  - Updates the per-type memory so reopen restores geometry.
- `lastPos` entries widen from `{ x, y }` to
  `{ x: number; y: number; w?: number; h?: number }`. `open` seeds new
  windows from the remembered geometry; `move` keeps updating `x/y` without
  clobbering remembered `w/h`.

### 4.2 Size clamping

Clamping lives in the component (which knows the pointer math and viewport),
with the store treating `resize` input as authoritative but guarding against
nonsense via one pure function used by both:

- `clampGeometry(geom, viewport)` — pure, unit-tested:
  - min size **300 × 200** px;
  - max size = viewport width × (viewport height − taskbar 28px);
  - `x/y` clamped so at least part of the title bar stays reachable
    (reusing the same clamp bounds the drag handler uses today).
- When an edge drag hits min size, the opposite edge stays anchored (the
  window does not slide), which falls out naturally from clamping the size
  first and deriving position from the anchored edge.

### 4.3 `Window.tsx`

- Resize handles render only when **all** hold: window type is resizable,
  not maximized, not compact viewport.
- 8 absolutely-positioned invisible handles inside the window `div`:
  4 edge strips (6px thick) + 4 corner squares (12px), with cursors
  `ns-resize` (top/bottom), `ew-resize` (left/right), `nwse-resize`
  (top-left/bottom-right), `nesw-resize` (top-right/bottom-left). Corners
  render after edges so they win the hit test. *(Amended after runtime
  verification: cursors live in `globals.css` as `[data-resize=…]` rules
  with `!important`, not inline styles — the Win95 cursor theme's global
  `* { cursor: … !important }` rule clobbers inline cursors.)*
- `onMouseDown` on a handle: record start pointer + start geometry + which
  edges the handle controls; attach `mousemove`/`mouseup` listeners on
  `window` (same pattern as the existing title-bar drag); on move, compute
  the new geometry from the deltas for the controlled edges, run
  `clampGeometry`, call `resize`. No `stopPropagation`: the mousedown
  bubbles to the window container, which focuses the window (desired), and
  the title-bar drag handler is untouched because handles are siblings of
  the title bar.
- Rendering:
  - `width`: `win.w ?? width` (the existing prop default).
  - The non-maximized frame is always a flex column with `overflow: hidden`;
    `window-body` is the scroll container in every mode. With `win.h` set the
    frame gets `height: win.h` and the body `flex:1`; without it, height
    stays auto with the existing `maxHeight` cap and the body scrolls.
    *(Amended after runtime verification: the original design kept
    `overflow:auto` on the frame for untouched windows, but the handles are
    absolute children of the frame — if the frame scrolls, they drift with
    the content. Side effect of the fix, intended: the title bar stays
    pinned while content scrolls, matching real Windows.)*
- Maximize interaction unchanged: the maximized branch ignores `w/h`;
  restore returns to the user's dragged size.

### 4.4 What does not change

- Game windows (`game-*` types, incl. Solitaire) — no handles, fixed width.
- Compact-viewport behavior (full-screen windows, solo-visible).
- Drag, focus flash, open/close animations, Escape handling, cascade logic.

## 5. Error handling

- `resize` with unknown id: no-op with same state ref (no re-render).
- Degenerate viewport (smaller than min size): `clampGeometry` lets min size
  win over viewport max so the math never produces negative sizes; compact
  viewport handling makes this practically unreachable.

## 6. Testing

- `window-manager.test.ts`: `isResizableType` (game vs utility vs browser);
  `resize` happy path, unknown-id no-op, geometry remembered and restored on
  reopen, `move` not clobbering remembered size.
- `clampGeometry` unit tests: min clamp, viewport max clamp, left/top-edge
  anchor behavior, degenerate viewport.
- Component test (`Window` or a new `Window.test.tsx`): handles present on a
  resizable type, absent for `game-*`, absent when maximized.
- Full gate: `npm test` (all suites), `npx tsc --noEmit`, `npm run lint`.
