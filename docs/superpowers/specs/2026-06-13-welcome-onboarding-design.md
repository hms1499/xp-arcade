# First-Run Welcome Dialog — Design Spec

**Date:** 2026-06-13
**Status:** Approved (brainstorming) — ready for implementation plan
**Author:** brainstorming session

## 1. Goal

Give a brand-new visitor an immediate, on-brand explanation of what makes
XP Arcade special: play retro games → mint scores as NFTs → climb the on-chain
top-10 → split a real STX season prize pool. Today a first-time user lands on the
Win95 desktop with game icons and a leaderboard but **zero framing of the unique
value prop**. This is the single biggest first-impression gap and the strongest
hook (real STX + competition).

This is a **cosmetic, client-only** feature. It does **not** touch `contract/`
or any `.clar` file, and adds no public contract functions.

## 2. Scope (decisions locked in brainstorming)

- **Format:** a single static Win95 dialog (one screen), not a multi-step wizard.
- **Primary CTA:** one button, "Play Now" — closes the dialog and opens the most
  recent game (`lastGame ?? "snake"`). No guided tour.
- **Trigger/gate:** shown automatically once, after the BootScreen fade completes,
  gated by a `localStorage` flag that persists across sessions. Once dismissed it
  never auto-shows again.
- **Re-access:** a "Welcome" item in the Start Menu re-opens it at any time
  (without clearing the flag).
- **Out of scope (YAGNI):** multi-step tour, balloon-hint sequence, "don't show
  again" checkbox (redundant — it is already one-time by default), any contract
  change, any change to the existing technical `AboutDialog` (kept separate).

## 3. Architecture

Follows the established project pattern: a pure storage module + a focused Zustand
store + a presentational component + render/unit tests, wired into existing shells.

| File | Status | Responsibility |
|------|--------|----------------|
| `frontend/lib/welcome.ts` | create | Pure storage helpers. `WELCOME_STORAGE_KEY`, `hasSeenWelcome()`, `markWelcomeSeen()`. SSR-safe (guard `typeof window === "undefined"`). |
| `frontend/state/welcome.ts` | create | Zustand store `{ isOpen: boolean; open(): void; close(): void }`. Shared so both Desktop (auto-open) and StartMenu (re-open) drive the same dialog. |
| `frontend/components/dialogs/WelcomeDialog.tsx` | create | Presentational dialog. Props `{ onPlay: () => void; onClose: () => void }`. Uses the `.window` / `.title-bar` Win95 classes like `AboutDialog`. |
| `frontend/components/desktop/Desktop.tsx` | modify | Mount `<WelcomeDialog>` once. On first client mount, if `!hasSeenWelcome()` call `open()`. Wire `onPlay` → open `lastGame ?? "snake"` + close; wire `onClose` → close. Both paths call `markWelcomeSeen()`. |
| `frontend/components/desktop/StartMenu.tsx` | modify | Add a "Welcome" `MenuItem` (icon 👋) near "About XP Arcade" that calls `useWelcome.getState().open()`. |

Reference (do not modify): `frontend/components/dialogs/AboutDialog.tsx` (Win95 dialog
markup pattern; a separate technical "About box"), `frontend/lib/game-registry.ts`
(`GAMES`, `GameId`), `frontend/components/player/AchievementsPanel.tsx` (render-test
pattern). The desktop already tracks `lastGame` via `localStorage["xp-arcade:last-game"]`.

### 3.1 `lib/welcome.ts`

```ts
export const WELCOME_STORAGE_KEY = "xp-arcade:welcomed";

export function hasSeenWelcome(): boolean {
  if (typeof window === "undefined") return true; // SSR: never auto-open
  try {
    return window.localStorage.getItem(WELCOME_STORAGE_KEY) === "1";
  } catch {
    return true; // storage blocked → don't nag
  }
}

export function markWelcomeSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WELCOME_STORAGE_KEY, "1");
  } catch {
    /* storage blocked → no-op */
  }
}
```

`hasSeenWelcome()` returns `true` (i.e. "already seen", so do **not** auto-open) on
SSR and when storage is unavailable — conservative: never auto-pop where we cannot
persist a dismissal.

### 3.2 `state/welcome.ts`

```ts
import { create } from "zustand";

type WelcomeState = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

export const useWelcome = create<WelcomeState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
```

Gating logic lives in `lib/welcome.ts`, not the store — the store only holds open
state, matching the focused-store convention.

### 3.3 Gating flow

1. Desktop mounts. A `useEffect` (runs once, client-only) checks `hasSeenWelcome()`.
   If `false`, calls `useWelcome.getState().open()`.
2. User dismisses via X / "Maybe later" / "Play Now". Each path calls
   `markWelcomeSeen()` then `close()` (Play Now also opens a game).
3. Future visits: flag is set → no auto-open.
4. Start Menu → "Welcome" calls `open()` only (does **not** clear the flag). Closing
   again calls `markWelcomeSeen()` (idempotent).

The Desktop already renders after `BootScreen` finishes (BootScreen wraps the
desktop tree and only renders children once booted), so mounting the dialog inside
Desktop naturally appears after the boot fade — no extra timing code needed.

## 4. UI / Layout

Win95 dialog using existing `98.css` classes (`.window`, `.title-bar`,
`.title-bar-text`, `.title-bar-controls`, `button.default`). Centered fixed overlay
like `AboutDialog` (`top/left 50%`, `translate(-50%, -50%)`), width ~360px, high
`zIndex` so it sits above desktop content.

```
+================================================+
| 🎮 Welcome to XP Arcade                  [ X ] |
+================================================+
|                                                |
|   🕹️   A Windows 95 arcade where your scores   |
|        become NFTs — and top players split     |
|        a real STX prize pool each season.      |
|                                                |
|   ┌──────────────────────────────────────┐    |
|   │ 1. 🎯 PLAY   5 retro games            │    |
|   │ 2. 💾 MINT   your score as a Score NFT│    |
|   │ 3. 🏆 CLIMB  the on-chain top-10 &    │    |
|   │              split the STX prize pool │    |
|   └──────────────────────────────────────┘    |
|                                                |
|   No wallet needed to play — connect only      |
|   when you want to mint.                        |
|                                                |
|                       [ Maybe later ] [▶ Play ]|
+================================================+
```

- Title bar: text "Welcome to XP Arcade" + a Close button (`aria-label="Close"`)
  that calls `onClose`.
- Body: 🕹️ icon + one-sentence tagline; a bordered inset panel listing the 3 steps
  (PLAY / MINT / CLIMB); the "No wallet needed to play" friction-reducer line.
- Footer buttons (right-aligned): **"Maybe later"** → `onClose`; **"▶ Play Now"**
  (`className="default"`, bold) → `onPlay`.
- Copy is accurate to the contract model (mint fees fund per-game season pools;
  top-10 split on-chain) — consistent with `AboutDialog` wording and
  `.claude/docs/prize-logic.md`.

## 5. Testing (TDD)

- `frontend/lib/welcome.test.ts` — with a mocked `localStorage`:
  `hasSeenWelcome()` is `false` when unset and `true` after `markWelcomeSeen()`;
  `markWelcomeSeen()` writes `"1"` under `WELCOME_STORAGE_KEY`. (jsdom provides
  `window.localStorage`.)
- `frontend/state/welcome.test.ts` — `open()` sets `isOpen` true, `close()` sets it
  false (mirrors existing `state/*.test.ts` files).
- `frontend/components/dialogs/WelcomeDialog.test.tsx` — via `renderToStaticMarkup`:
  renders the tagline + all three step labels (PLAY/MINT/CLIMB) and both buttons.
  A jsdom render test asserts clicking "Play Now" calls `onPlay` and the Close /
  "Maybe later" controls call `onClose`.

Verification pass after wiring: `npx tsc --noEmit`, `npm test` (all green, new files
present), `npm run lint`.

## 6. Non-goals / constraints

- No contract change; no `.clar` edits; no new public contract functions.
- Do not merge the focused Zustand stores into one (`state/welcome.ts` stays its own
  store).
- Keep the existing `AboutDialog` untouched and separate (system/credits box vs.
  onboarding).
- ASCII-only source where the project requires it does not apply to `.tsx`, but keep
  the dialog copy plain (no exotic glyphs that break fonts); emoji are already used
  throughout the desktop UI.
