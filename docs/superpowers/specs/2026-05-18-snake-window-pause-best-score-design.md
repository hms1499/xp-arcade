# Design — Snake auto-pause on XP window blur + visible best score

**Date:** 2026-05-18
**Status:** Approved (scope locked to Item 1 + Item 2)
**Scope class:** Frontend-only. No contract, API, or dependency changes. The
deployed mainnet contract and the mint flow are untouched.

## Background

The Snake game already ships speed ramp, Esc pause, auto-pause on browser
tab/window blur, and localStorage personal-best recording (`lib/high-score.ts`
via `MintDialog`). Two real gaps remain in the "game feel" area:

1. **Auto-pause only covers the browser tab/window.** `GameCanvas` pauses on
   `document.visibilitychange` (tab hidden) and `window` `blur` (browser window
   loses focus). Clicking another XP desktop window in the *same* browser tab
   (e.g. Leaderboard, My NFTs) does **not** fire either event, so the snake
   keeps moving behind the newly focused window and the player dies blind.
2. **Personal best is invisible during play.** `getBestScore()` exists in
   `lib/high-score.ts` but is unused. The best score only surfaces *after*
   game over, inside `MintDialog` ("Personal best: N" / "New personal best!").
   The player has no target while playing or on the game-over splash.

## Goals

- Pause Snake whenever its XP window is not the active (top, non-minimized)
  window — closing the gap left by the browser-only blur handlers.
- Show the personal best in the in-game HUD and on the game-over canvas
  overlay, distinct from the existing on-chain top-10 "NEW HIGH SCORE" line.

## Non-goals

- Speed-curve tuning (deferred — subjective, low demo value).
- Combo/time bonus scoring (rejected — `score` is minted on-chain and ranked
  in the contract; changing it fragments the existing mainnet leaderboard.
  Requires a separate, deliberate spec if ever revisited).
- Any change to `recordScore` / localStorage write ownership, `MintDialog`,
  the mint flow, or the contract.
- Auto-resume on regaining focus. The user chose manual resume, consistent
  with the existing tab/window-blur behavior ("the snake never moves while
  they aren't looking").

## Design

### Item 1 — Auto-pause when not the active XP window

**Active-window detection.** Add a pure helper to `state/window-manager.ts`:

```ts
export function isWindowActive(
  entry: WindowEntry | undefined,
  topZ: number,
): boolean {
  return !!entry && !entry.minimized && entry.z === topZ;
}
```

This mirrors how `Window.tsx` already derives `isActive` (top z-order,
not minimized). It is the single testable seam — canvas/RAF code is not
unit-testable, but this predicate is.

**Wiring.**

- `GameWindow.tsx`: subscribe to `topZ` in addition to the existing game
  window entry; compute `windowActive = isWindowActive(w, topZ)`; pass it to
  `GameCanvas` as a `windowActive` prop.
- `GameCanvas.tsx`: accept `windowActive`. Add a `useEffect` keyed on
  `windowActive`:

  ```ts
  useEffect(() => {
    if (!windowActive && gameOverPhaseRef.current === null) {
      setPausedBoth(true);
    }
  }, [windowActive, setPausedBoth]);
  ```

  When `windowActive` becomes `false` during active play, force pause —
  the same effect the existing `onBlur`/`onHide` handlers have. When it
  becomes `true` again, do nothing: resume stays manual (Esc / Resume
  button). The `gameOverPhaseRef.current === null` guard prevents pausing
  during the 3-second game-over splash, which would freeze the overlay
  (the RAF loop returns early when `pausedRef.current` is true, before the
  overlay-draw branch).

**Why this is correct and conflict-free.** Focusing another XP window calls
`window-manager`'s `focus(id)`, which bumps `topZ` above the game window's
`z`; `isWindowActive` then returns `false`. A same-tab window switch does not
fire `window` `blur` or `visibilitychange`, so the existing handlers and this
new effect never double-fire on the same event — they cover disjoint cases.

### Item 2 — Visible best score (HUD + overlay)

Single-writer invariant preserved: `recordScore` (the only localStorage
*write*) stays in `MintDialog`. This change only *reads* via `getBestScore()`.

- **HUD.** The header currently renders `Score: {score}` plus the speed bar.
  Add `Best: {Math.max(best, score)}` where `best` is read once at mount
  (`useState(() => getBestScore())`). Showing the running max lets the player
  see when they are beating their record live. No write here.
- **Game-over canvas overlay.** `recordScore` runs in `MintDialog`, which
  mounts *after* the overlay, so at overlay-draw time localStorage still
  holds the *old* best. Compare `finalScoreRef.current` against
  `getBestScore()` (old value):
  - `finalScore > oldBest` → gold line `NEW PERSONAL BEST!`
  - else → `BEST: {oldBest}`
  Keep the existing `isTopScore` gold `NEW HIGH SCORE` line as-is — that is
  the on-chain top-10 signal, a *different* thing from the localStorage
  personal best. Both may show; label text keeps them distinct. Reuse the
  overlay's existing conditional vertical-offset pattern so the extra line
  does not overlap "Press any key..." on the ~320px canvas.

## Error handling / edge cases

- `getBestScore()` already returns `0` on SSR / missing / corrupt storage —
  no new guarding needed.
- Game-over splash: covered by the `gameOverPhaseRef` guard above.
- `reduce-motion`: irrelevant to both items (no new animation).
- No new failure modes introduced (no I/O, network, or contract calls added).

## Testing

- **Unit:** `isWindowActive` — table test: active when `{!minimized, z===topZ}`;
  inactive when `undefined`, when `minimized`, and when `z !== topZ`.
  Add `state/window-manager.test.ts` (or co-locate per existing convention).
- **Existing:** `getBestScore` is already covered by `lib/high-score.test.ts`.
- **Manual (canvas/RAF not unit-testable):** add to the `HANDOFF.md` manual
  checklist —
  - Start Snake, click another XP window → snake pauses immediately; PAUSED
    overlay shows; clicking back does not auto-resume; Esc/Resume resumes.
  - HUD shows `Best: N`; exceeding it mid-game makes the HUD value climb.
  - Game-over overlay shows `NEW PERSONAL BEST!` on a record, else `BEST: N`;
    the on-chain `NEW HIGH SCORE` line still appears independently when
    `isTopScore`.

## Files touched

| File | Change |
|---|---|
| `state/window-manager.ts` | Add exported pure `isWindowActive` helper |
| `state/window-manager.test.ts` | New — unit test for the helper |
| `components/windows/GameWindow.tsx` | Derive `windowActive`, pass as prop |
| `components/game/GameCanvas.tsx` | `windowActive` prop + pause effect; HUD `Best`; overlay personal-best line |
| `HANDOFF.md` | Append manual-test steps |

## Commit split (each commit green)

1. `feat: add isWindowActive helper + test`
2. `feat(game): auto-pause snake when its XP window loses focus`
3. `feat(game): show personal best in HUD and game-over overlay`
