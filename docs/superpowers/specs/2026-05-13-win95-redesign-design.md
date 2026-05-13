# Win95 Redesign — Design Spec

**Date:** 2026-05-13
**Project:** xp-snake / frontend
**Status:** Approved

## Overview

Full redesign of the XP Snake frontend from Windows XP aesthetic to Windows 95 aesthetic. Only the presentation layer changes — game logic, contract calls, Zustand stores, and API routes are untouched.

## Goals

- Replace `xp.css` with `98.css` (Windows 95/98 accurate CSS library)
- Apply Win95 silver/navy palette throughout all UI components
- Redesign BootScreen to match Windows 95 startup sequence
- Update BalloonNotification to Win95 flat tooltip style
- Update all component class names to match `98.css` spec

## Out of Scope

- Game canvas rendering (keeps current logic and colors)
- Contract (Clarity), API routes, Zustand state
- Mobile responsiveness (desktop-first remains)
- Sound effects (already deferred)

---

## 1. CSS Library

**Remove:** `xp.css` npm package, `app/xp-patched.css`

**Keep:** MS Sans Serif woff/woff2 files in `app/` (98.css uses Arial by default; we declare `@font-face` to override with the pixel font)

**Install:** `98.css` npm package

**`app/globals.css`:**
```css
@import "tailwindcss";
@import "98.css";

@font-face {
  font-family: "MS Sans Serif";
  src: url("./ms_sans_serif.woff2") format("woff2"), url("./ms_sans_serif.woff") format("woff");
  font-weight: 400;
}
@font-face {
  font-family: "MS Sans Serif";
  src: url("./ms_sans_serif_bold.woff2") format("woff2"), url("./ms_sans_serif_bold.woff") format("woff");
  font-weight: 700;
}

html, body { height: 100%; margin: 0; font-family: "MS Sans Serif", Arial, sans-serif; font-size: 11px; }
body { overflow: hidden; background: #008080; }
```

---

## 2. Palette

| Token | Value | Usage |
|---|---|---|
| Desktop | `#008080` | body background |
| Silver | `#c0c0c0` | window chrome, taskbar, buttons |
| Navy | `#000080` | active title bar |
| Title text | `#ffffff` | title bar text |
| Inactive title | `#808080` | unfocused window title bar |
| Border light | `#ffffff` | beveled highlight |
| Border dark | `#808080` / `#000000` | beveled shadow |

All colors come from `98.css` automatically via its class system. Custom overrides only where needed.

---

## 3. Component Changes

### `components/windows/Window.tsx`

Update wrapper and child class names to `98.css` spec:

```
<div class="window">
  <div class="title-bar">
    <div class="title-bar-text">Title</div>
    <div class="title-bar-controls">
      <button aria-label="Minimize"></button>
      <button aria-label="Maximize"></button>
      <button aria-label="Close"></button>
    </div>
  </div>
  <div class="window-body">…</div>
</div>
```

Active/inactive title bar state: add/remove `inactive` class on `.title-bar` based on z-order (focused window = active).

### `components/desktop/Taskbar.tsx`

- Outer bar: no change to layout, apply `background: #c0c0c0`, `border-top: 2px solid` (beveled via 98.css tokens)
- Start button: custom SVG — 4-color Windows flag (red `#ff0000`, green `#00aa00`, blue `#0000aa`, yellow `#ffaa00`) + text "Start", beveled border via 98.css `.button` class

### `components/desktop/StartMenu.tsx`

- `<ul role="menu">` with 98.css menu item classes
- Left sidebar: `writing-mode: vertical-rl`, rotated "Windows 95" text, navy-to-navy gradient background (`#000080` → `#1084d0`), white text — this is the iconic Win95 Start Menu sidebar

### `components/desktop/DesktopIcon.tsx`

- Icon label: white text with 1px black text-shadow (Win95 icon label style)
- Selected state: navy highlight `#000080` behind label text
- No changes to icon images (emoji or existing SVG)

### `components/desktop/SystemTray.tsx`

- Inset border (sunken style via 98.css)
- Silver background, same clock/wallet button layout

### `components/dialogs/BalloonNotification.tsx`

Full style rewrite — Win95 flat tooltip:
- Background: `#ffffe1` (system tooltip yellow)
- Border: `1px solid #000000` (flat, no shadow, no rounded corners)
- Small icon on left, message text on right
- No drop shadow, no border-radius

### `components/dialogs/MintDialog.tsx` / `TrophyDialog.tsx`

Apply 98.css `window` + `window-body` class structure. No custom chrome needed — dialogs look like standard Win95 modal windows. Trophy tier icons: ★ Gold, ★ Silver, ★ Bronze, ✦ Top 10.

---

## 4. BootScreen Redesign

**File:** `components/desktop/BootScreen.tsx`

**Sequence (~2.5s total):**

1. Full-screen black background
2. Center: Windows 95 logo
   - 4-square flag: top-left red, top-right green, bottom-left blue, bottom-right yellow (each ~40x40px, 2px gap)
   - Below flag: "Windows" in bold serif, "95" in large weight
3. Below logo: loading bar container (dark inset border)
   - 16 white block segments animate left-to-right, ~150ms per block
4. Text: "Starting Windows 95..." below the bar, white, small

On complete: `onDone()` callback fires, Desktop mounts with fade-in.

---

## 5. What Stays the Same

- `components/game/GameCanvas.tsx` — no changes
- `components/windows/GameWindow.tsx` / `LeaderboardWindow.tsx` / `MyNftsWindow.tsx` — only window chrome class names update (handled by Window.tsx)
- `lib/` — snake engine, contract calls, metadata SVG unchanged
- `state/` — wallet, window-manager, toasts unchanged
- `app/api/` — metadata routes unchanged
- `contract/` — untouched

---

## 6. Testing

Manual smoke test (same checklist as HANDOFF.md §3):
- Boot screen renders Win95 logo + progress animation
- Desktop shows teal background, taskbar at bottom
- Start button shows flag icon + "Start" text, opens menu with sidebar
- Windows have navy title bar, silver chrome, beveled borders
- Balloon notifications are flat yellow tooltips
- All game, leaderboard, NFT flows work as before
