# Win95 Shell Authenticity + Screensaver — Design

**Date:** 2026-06-24
**Status:** Approved for planning
**Scope:** Frontend only. **No contract changes.** No new dependencies.

## 1. Goal & Rationale

Create a strong first impression for **new users** in the **first 60 seconds**,
where the chosen "wow" is **Win95 nostalgia / polish** (not a new game, not new
social features).

The boot screen, wallpapers, leaderboard ticker, procedural Web-Audio sounds,
and 19 keyframes are already well-crafted — marginal returns on *more* of those
are low. The untouched, high-leverage surface is the **OS shell** itself: the
parts a new user *clicks on first*, before committing to a game. Nailing these
details is what makes the app feel "made with care" and screenshot-worthy.

Verified current state (grep, 2026-06-24):

- **No desktop right-click context menu** exists (only `MinesweeperBoard` uses
  `onContextMenu`, for flagging — must not be disturbed).
- `StartMenu.tsx` (287 lines) exists with hover states + a "Shut Down" item, but
  is **flat** — no cascading submenus, no vertical sidebar band.
- **No idle screensaver** anywhere.
- Reusable building blocks already present: `AboutDialog`, `BalloonNotification`,
  `WelcomeDialog`, `lib/sounds.ts` (mutable via the settings store),
  `lib/game-registry.ts`.

Non-goals (YAGNI for this pack): CRT scanlines/flicker, BSOD easter egg, multiple
screensaver styles, keyboard navigation for menus. These can be added later as
isolated follow-ups.

## 2. Architecture

Four independent units, each with one clear purpose, a well-defined interface,
and its own co-located test (matching repo convention). They share only existing
infrastructure (`lib/sounds.ts`, settings store, `game-registry`).

```
Desktop.tsx
 ├─ DesktopContextMenu      (Unit 1) — right-click shell on desktop background
 ├─ StartMenu.tsx (enhance) (Unit 2) — sidebar band + cascading submenus
 ├─ SystemDialog            (Unit 3) — Win95 message-box + Shut Down sequence
 └─ Screensaver + useIdle   (Unit 4) — idle overlay
```

### Unit 1 — Desktop context menu (`components/desktop/DesktopContextMenu.tsx`)

- Right-click on the **desktop background element only** opens a Win95-styled
  context menu positioned at the cursor: `Arrange Icons`, `Line up Icons`,
  `Refresh`, separator, `Properties`.
- Behaviour:
  - `Refresh` → brief icon re-render flicker (the satisfying nostalgia beat).
  - `Properties` → opens the existing Control Panel / Display window.
  - `Arrange Icons` / `Line up Icons` → resets desktop icon layout to the default
    grid.
- Closes on outside click or `Escape`. Plays a soft menu-open tick via
  `lib/sounds.ts`.
- **Critical constraint:** the `onContextMenu`/`preventDefault` handler is scoped
  to the desktop background container, so in-game right-click (Minesweeper flag,
  any future game) is unaffected. A test asserts the handler does not attach to
  game surfaces.
- Interface: `<DesktopContextMenu onProperties={...} onArrangeIcons={...} />`
  rendered by `Desktop.tsx`; menu open/position state is local to the component
  (driven by an `onContextMenu` handler on the desktop background).

### Unit 2 — Start menu authenticity (enhance `components/desktop/StartMenu.tsx`)

- Add the iconic **vertical gradient sidebar** (navy→blue band) on the left with
  a rotated "XP Arcade 95" wordmark.
- Add a cascading **`Programs ▸`** submenu that lists the games sourced from
  `lib/game-registry.ts` (single source of truth — no hardcoded game list).
- Keep the existing `Shut Down` item; wire it to Unit 3.
- Hover-to-expand submenu with the right-arrow affordance. Submenu open state is
  local component state. Closes with the parent menu.
- Mouse-only for v1 (keyboard nav is out of scope).

### Unit 3 — Win95 system dialog (`components/dialogs/SystemDialog.tsx`)

- A reusable modal matching Win95 message boxes: leading icon
  (`info | warning | error`), title-bar text, message body, `OK` / `Cancel`
  buttons. Plays the "ding" through `lib/sounds.ts` on open (respects mute).
- Interface:
  `<SystemDialog kind="warning" title="Shut Down" message="…" onOk onCancel />`.
- Wire **Shut Down**: Start menu → `SystemDialog` confirm → on confirm, run the
  **shutdown sequence**: fade the screen to black and show
  *"It's now safe to turn off your computer."* in amber, centered. Any click
  returns to the desktop. Pure easter-egg delight; the single borrowed
  "signature beat" from the brainstorm, kept because it is cheap and iconic.

### Unit 4 — Idle screensaver (`components/desktop/Screensaver.tsx` + `hooks/useIdle.ts`)

- `useIdle(ms)` hook: returns `true` after `ms` (~60s) with no `mousemove`,
  `keydown`, `pointerdown`, or `touchstart`. Resets on any of those. Returns
  `false` (never idle) when `document.hidden` (tab not visible).
- `Screensaver` overlays a full-screen canvas rendering **Flying Windows**:
  Win95 logos drifting toward the viewer (the most iconic, simplest variant).
- Dismiss on any input → returns to the exact desktop state underneath.
- Respects `prefers-reduced-motion` (renders a static frame or skips entirely).
- **Does not activate while a game is actively being played** — the active-game
  signal comes from the existing window/game state so gameplay is never
  interrupted.
- Idle threshold is a named constant (configurable in one place).

## 3. Data Flow

- **Sounds:** every new sound routes through `lib/sounds.ts`, so the settings
  store mute toggle covers them with no extra wiring.
- **Game list (Unit 2):** read from `lib/game-registry.ts`; no duplicated list.
- **Active-game gate (Unit 4):** derived from existing window-manager / game
  state; the screensaver subscribes read-only.
- **Settings:** `prefers-reduced-motion` and the existing mute setting are the
  only cross-cutting inputs. No new persisted state required (idle timing is
  ephemeral).

## 4. Error Handling & Edge Cases

- Context menu near a screen edge clamps so it stays fully on-screen.
- Right-click suppression is strictly limited to the desktop background; verified
  by test and by manual Minesweeper smoke.
- Screensaver: guard against activating over modal dialogs / active gameplay;
  guard against `AudioContext`/canvas being unavailable (degrade to nothing).
- Reduced-motion users: screensaver static or disabled; submenu/context-menu
  transitions reduced.
- All overlays are dismissible by `Escape` and by outside click where applicable.

## 5. Testing

Co-located tests per unit (repo convention — nearly every `lib/` module has a
sibling `.test.ts`):

- `useIdle.test.ts` — fake timers: fires after threshold, resets on input,
  suppressed when `document.hidden`.
- `DesktopContextMenu.test.tsx` — opens at cursor, action callbacks dispatch,
  closes on Escape/outside-click, does **not** attach to game surfaces.
- `StartMenu` submenu test — `Programs` expands on hover, lists registry games,
  collapses with parent.
- `SystemDialog.test.tsx` — renders kind/title/message, OK/Cancel callbacks,
  ding gated by mute.
- Manual smoke: shutdown sequence, Flying Windows visual, Minesweeper right-click
  still flags.

Gate before done (per CLAUDE.md): `npx tsc --noEmit`, `npm run lint`,
`npm test` — read output before claiming done.

## 6. Risks

- **Right-click regression** into games — mitigated by background-scoped handler
  + explicit test. Highest-attention item.
- **Screensaver interrupting gameplay** — mitigated by the active-game gate.
- **Scope creep** — the four units are independently shippable; each can land as
  its own small green commit. CRT/BSOD/extra screensavers are explicitly deferred.

## 7. Out of Scope

CRT scanlines/flicker toggle, BSOD easter egg, additional screensaver styles
(Starfield/Maze), keyboard navigation for menus, any contract/on-chain change.
