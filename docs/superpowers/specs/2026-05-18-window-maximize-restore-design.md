# Design — XP window Maximize / Restore

**Date:** 2026-05-18
**Status:** Approved
**Scope class:** Frontend-only. No contract, API, or dependency changes.

## Background

`components/windows/Window.tsx:85` renders `<button aria-label="Maximize" />`
with **no `onClick` handler** — xp.css styles it so users see and click it, but
nothing happens. Minimize (`minimize(id)`) and Close work; Maximize is a dead
control. A non-functional affordance is worse than none: the UI implies a
capability it does not have.

`WindowEntry` (in `state/window-manager.ts`) holds `id, type, x, y, z,
minimized, payload`. `width` is a static prop passed per window type (default
520) in `Window.tsx`; height is content-driven. The desktop is `fixed inset-0`;
the taskbar is `position:absolute; bottom:0; height:28`. So the usable
maximized area is the viewport minus a 28px bottom strip.

## Goals

- Wire the existing Maximize button so it toggles a window between its normal
  geometry and a maximized state filling the desktop above the taskbar.
- Maximized button shows the XP "Restore" affordance and toggles back.
- Apply to **all** window types, including the Game window (its 320px canvas
  simply centers in the larger chrome — authentic XP behavior; no per-window
  exclusion logic).

## Non-goals

- No resizable windows / drag-resize handles.
- No persisted previous size (not needed — see Architecture).
- No contract/API/dependency change; no change to auto-pause, active-window
  detection, mint flow, or any other feature.
- No animation of the maximize transition (snap, like classic XP).

## Architecture

**Why no saved geometry:** restore target is fully recoverable without
storing it. `x`/`y` already live in the store and are not overwritten by
maximize (maximized rendering ignores them rather than mutating them).
`width` is a static prop per window type. So `toggleMaximize` only flips a
boolean; clearing it returns the window to its exact prior position and width.

**State — `state/window-manager.ts`**
- Add `maximized?: boolean` to `WindowEntry`.
- Add action `toggleMaximize(id)`: flips that window's `maximized`, and also
  brings it to front (same z-bump as `focus(id)`) so maximizing a background
  window raises it — consistent with XP and with `open`/`focus` semantics.
  Maximize does **not** otherwise alter z-order, so `isWindowActive` / `maxZ`
  and the Snake auto-pause feature are unaffected.
- `maximized` is independent of `minimized`. Minimizing a maximized window to
  the taskbar and restoring it preserves `maximized`.

**Component — `components/windows/Window.tsx`**
- Subscribe `toggleMaximize`.
- When `win.maximized` is true, render the outer window with
  `position: fixed; top:0; left:0; right:0; bottom:28px` (above the 28px
  taskbar), ignoring `win.x`, `win.y`, and the `width` prop. `zIndex`
  stays `win.z`.
- `window-body` gets `overflow: auto` when maximized so content taller than
  the available height scrolls instead of clipping.
- Maximize button: add `onClick={() => toggleMaximize(id)}`. When
  `win.maximized`, set the button's `aria-label` to `"Restore"` (xp.css
  renders the Restore glyph for that label — no custom CSS).
- Titlebar drag is disabled while maximized: the titlebar `onMouseDown`
  drag-start path returns early if `win.maximized` (the focus/flash behavior
  still runs).
- Double-clicking the titlebar toggles maximize (authentic XP), via
  `onDoubleClick` calling `toggleMaximize(id)`.

## Data flow

User clicks Maximize (or double-clicks titlebar) → `toggleMaximize(id)`
flips `maximized` + raises z → store notifies → `Window` re-renders with
maximized geometry and a `Restore`-labelled button. Restore reverses it; the
window reappears at its untouched `x/y/width`.

## Error handling / edge cases

- Minimized window: `Window` already returns `null` when `win.minimized`;
  `maximized` is orthogonal and retained for when it un-minimizes.
- Maximize then drag: drag is disabled while maximized, so geometry can't be
  corrupted; restore returns to the original `x/y`.
- A maximized non-Game window on top still covers the Game window, so the
  existing auto-pause (z-order based) keeps working unchanged.
- No SSR concern: `Window` is a client component.
- `toggleMaximize` on a non-existent id is a no-op (map over windows, match by
  id — same pattern as existing actions).

## Testing

- **Unit** (`state/window-manager.test.ts`, extend the existing file):
  `toggleMaximize` — sets `maximized` true from undefined/false; flips back to
  false; raises the target's `z` above the previous max; is a no-op for an
  unknown id; does not mutate `x`/`y`.
- **Manual** (canvas/DOM not unit-testable) — append to `HANDOFF.md`:
  - Open any window → click Maximize → fills desktop, stops above taskbar,
    button shows Restore glyph, titlebar drag disabled, double-click titlebar
    restores.
  - Maximize the Game window → 320px canvas centers in the large frame, game
    still playable.
  - Maximize a window, minimize it to taskbar, restore from taskbar → still
    maximized.
  - Maximize a window with tall content → window-body scrolls, no clip.

## Files touched

| File | Change |
|---|---|
| `state/window-manager.ts` | `maximized?` on `WindowEntry`; `toggleMaximize` action |
| `state/window-manager.test.ts` | Unit tests for `toggleMaximize` |
| `components/windows/Window.tsx` | Maximized geometry, button onClick + Restore label, drag lock, double-click toggle, body overflow |
| `HANDOFF.md` | Manual-test steps |

## Commit split (each commit green)

1. `feat: add maximized state + toggleMaximize action + tests`
2. `feat(window): wire Maximize/Restore button, drag lock, double-click`
3. `docs: add manual-test steps for window maximize`
