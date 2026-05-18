# Snake Board Enlarge — Design

**Date:** 2026-05-18
**Status:** Approved (user, 2026-05-18)
**Topic:** Make the Snake game board visually larger ("nhỏ khó nhìn" / small, hard to see).

## Problem

The Snake playfield renders on a fixed **320×320px** canvas (`CELL = 16`, `GRID = 20` in
`frontend/components/game/GameCanvas.tsx`). Users find it too small to see comfortably.

## Decision

**Approach A — increase the `CELL` pixel scale only.** Set `CELL = 24`, giving a
**480×480px** canvas (1.5× per side, ~2.25× area). Nothing else changes.

Rejected alternatives:
- **Increase `GRID` (bigger board):** `GRID` is passed to `createGame({ gridSize: GRID })`,
  so enlarging it changes gameplay (wider field, sparser food, longer rounds, different
  difficulty). Not requested → rejected (YAGNI / no unrequested behavior change).
- **Responsive canvas tied to the Maximize button (Approach B):** the "proper" UX and it
  would make the recently-shipped Maximize button enlarge the game, but it is a
  substantially larger change (dynamic `CELL` → `ResizeObserver`, rebuild the offscreen
  grid canvas on resize, the RAF loop + food/popup math reference the module constant
  `CELL` in ~10 places, hardcoded overlay font px would need scaling). Deferred to its
  own future spec/plan; explicitly out of scope here.

## Why Approach A is sufficient

The canvas dimensions are `GRID * CELL`. Every drawn element — the offscreen dot-grid,
the snake `roundRect` segments, the food `arc`, the score-flash rects, the `+1` popups,
and the game-over overlay rects — is computed from `CELL`/`GRID`, so all of it scales
automatically when `CELL` changes. `GRID` stays `20`, so `createGame({ gridSize: GRID })`
is unchanged: identical difficulty, speed, and rules. The `snake-engine` unit tests do
not depend on `CELL`, so they are unaffected. Rendering happens at native resolution
(not CSS upscale), so the larger board stays crisp.

## Window fit

The Snake window uses the default width **520px** (`Window.tsx` default `width = 520`;
`GameWindow.tsx` passes no `width`). The 480px canvas + body `p-2` padding (8px each
side) + 1px canvas border ≈ 498px < 520px, so it fits the existing window with **no
window changes**.

## Scope (explicitly out)

- **Fonts not scaled.** The game-over overlay and HUD use hardcoded px sizes
  (16/13/11/10). They stay as-is — still legible at 480px. Not scaled to `CELL`
  because it was not requested (YAGNI). Accepted as-is.
- **Maximize interaction unchanged.** Maximizing the Snake window shows the 480px
  canvas inside the larger frame (works fine, just doesn't further enlarge the game).
  Known and accepted; Approach B (future) is where that would be addressed.

## Change

| File | Change |
|------|--------|
| `frontend/components/game/GameCanvas.tsx` | Line 8: `const CELL = 16;` → `const CELL = 24;` (only change) |

## Verification

- `cd frontend && npx tsc --noEmit 2>&1 | grep -v '\.next/'` → empty (clean).
- `cd frontend && npm test` → 34/34 pass (engine tests independent of `CELL`).
- `cd frontend && npm run build` → succeeds.
- Manual: open Snake → board visibly larger (~480px), fits inside the window, gameplay
  feel unchanged, game-over overlay text still readable.

## Risk

Minimal — a single module constant. No engine, state, API, or window-system change.
