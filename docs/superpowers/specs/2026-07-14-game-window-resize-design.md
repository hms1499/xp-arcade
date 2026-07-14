# Resizable game windows — design (2026-07-14)

## 1. Problem

Game windows cannot be resized at all. `isResizableType()`
(`state/window-manager.ts:85`) excludes every `game-*` type, so Snake, Tetris,
Pac-Man, XP Bricks, Minesweeper and Solitaire open at one fixed size and stay
there. A player who wants a bigger play field (or a smaller one, to make room for
High Scores next to it) has no way to get one.

The reason games were excluded is real: they are not `<canvas>` elements that
stretch. They are DOM grids laid out in hard pixels — Tetris pins
`CELL_SIZE = 24`, Pac-Man draws a fixed maze, Bricks runs physics in pixel
coordinates. Widening the window would only add empty space around a play field
that never changes size.

## 2. Goals

- Drag any game window's edges/corners to scale the play field continuously.
- One mechanism that serves all six games, with no change to any game engine.
- No gameplay change: identical physics, scoring, keyboard and mouse behaviour.

## Non-goals

- Lowering the 300x200 floor on utility windows (a separate concern, not touched).
- Reflowing games responsively (re-deriving `CELL_SIZE` and friends per game).
  Rejected: six different layouts, each a separate risk of altering the feel of a
  game that already runs against a mainnet contract.
- Discrete zoom presets in a menu. Rejected: the request is free-form dragging.

## 3. Approach — uniform CSS scale

The play field keeps its natural pixel layout and is scaled with a CSS
`transform`. `transform` does not affect layout, so the element's own box stays
at its natural size and the browser maps pointer coordinates through the
transform for free — Minesweeper and Solitaire clicks land where they look.

`GameShellWindow` wraps the game body in two layers:

- **Viewport layer** — `flex: 1; overflow: hidden;` centring its child. This is
  the space the window's current geometry leaves for the play field.
- **Stage layer** — `transform: scale(k); transform-origin: center;` holding the
  game body unchanged.

Because the stage's layout box ignores its own transform, `offsetWidth` /
`offsetHeight` on it read the **natural** size of the game at any scale. A
`ResizeObserver` on the stage supplies that natural size, so no per-game size
constant exists to drift when someone edits `CELL_SIZE`.

### Scale is a pure function

`lib/game-scale.ts`:

```ts
computeGameScale({ availW, availH, naturalW, naturalH }): number
  // clamp(min(availW / naturalW, availH / naturalH), MIN_SCALE, MAX_SCALE)
  // MIN_SCALE = 0.25, MAX_SCALE = 3
```

Taking the **minimum** of the two ratios preserves aspect ratio: the field never
distorts, and leftover space on the long axis becomes Win95 grey letterbox around
a centred field. Returns `1` when the natural size is not measured yet
(`naturalW` or `naturalH` is 0), so the first paint is the size games have today.

**The floor must never bind.** A scale floor that clamps *above* the ratio the
window actually affords would push the field past the viewport layer, and
`overflow: hidden` would silently clip the play area — a game you cannot fully
see is worse than a small one. `MIN_SCALE = 0.25` is chosen to sit below anything
reachable: the smallest window the manager permits is 300x200
(`MIN_WINDOW_W/H`), and the widest game is well under 1200px natural, so the
worst real ratio stays above 0.25. The floor exists only to stop a degenerate
value (a zero-sized viewport during a layout transition) from collapsing the
field to nothing. `MAX_SCALE = 3` is the one bound meant to be felt: it stops a
maximized window on a large display from blowing the field up into abstract art.

Shrinking is therefore bounded by the window minimum, not by the scale floor —
which is the honest place for that limit to live, since it is what the user is
actually dragging.

### Chrome does not scale

Only the play field scales. `GameShellWindow`'s score bar, mint controls and
"High Scores" / "My NFTs" buttons stay at their native size, outside the stage
layer. Scaling them too would shrink buttons below a usable tap size at 0.5x and
make the score unreadable — an emulator zooms the picture, not the menu bar.

### What is not touched

Game engines, keyboard handling, collision, scoring, minting: unchanged. The
existing 8-direction resize handles in `Window.tsx` already work once the type
allowlist admits games; `compactViewport` still disables resize on phones, so
mobile keeps its one-window full-screen behaviour.

## 4. Components

| Unit | Responsibility |
|---|---|
| `lib/game-scale.ts` | Pure `computeGameScale` + the two bounds. Unit-tested alone. |
| `components/shared/GameShellWindow.tsx` | Viewport + stage layers; `ResizeObserver` for natural size; applies `k`. |
| `state/window-manager.ts` | `isResizableType` stops excluding `game-*`. |

## 5. Testing

- `lib/game-scale.test.ts` — aspect ratio preserved (limiting axis wins); clamps
  at both bounds; unmeasured natural size yields `1`; a window exactly the
  natural size yields `1`; **the field always fits the viewport it was given** at
  the smallest window the manager permits (300x200 against the largest game),
  i.e. the floor does not bind and nothing is clipped.
- `state/window-manager.test.ts` — game types now report resizable.
- Manual, in a browser: drag each game bigger and smaller; confirm Minesweeper
  and Solitaire clicks still hit the intended cell/card at a non-1 scale, and
  that Tetris/Snake keyboard play is unaffected.

## 6. Risks

- **Blur at fractional scale.** Accepted deliberately: smooth dragging was chosen
  over snapping to integer multiples. Cell borders may soften by a pixel.
- **Small text in a small window.** Minesweeper's digits get hard to read as the
  field shrinks. The 300x200 window minimum bounds how bad this gets, and the user
  opts into it by dragging.
- **Solitaire opens maximized** (`window-manager.ts:194`). Resize handles are
  hidden while maximized, which is existing behaviour — restore, then resize.
