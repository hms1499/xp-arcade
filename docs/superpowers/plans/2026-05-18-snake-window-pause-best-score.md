# Snake XP-Window Auto-Pause + Visible Best Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pause Snake when its XP window is not the active desktop window, and show the player's personal best in the HUD and game-over overlay.

**Architecture:** Add a pure `isWindowActive` predicate to the Zustand window-manager (unit-tested seam). `GameWindow` derives active state and passes it to `GameCanvas`, which force-pauses on a new effect. Best score is read-only via existing `getBestScore()`; the single localStorage writer (`recordScore` in `MintDialog`) is untouched.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Zustand 5, Vitest 3 (jsdom), HTML canvas.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `frontend/state/window-manager.ts` | Window store + active-window predicate | Add exported pure `isWindowActive` |
| `frontend/state/window-manager.test.ts` | Unit test for the predicate | Create |
| `frontend/components/windows/GameWindow.tsx` | Owns game window, derives active state | Subscribe `topZ`, pass `windowActive` prop |
| `frontend/components/game/GameCanvas.tsx` | Render loop, pause, HUD, overlay | New prop + pause effect; HUD `Best`; overlay best line |
| `HANDOFF.md` | Manual-test checklist | Append manual steps |

All commands run from `frontend/` unless noted. Vitest default include (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) already covers `state/`; no config change needed.

---

### Task 1: `isWindowActive` helper + test

**Files:**
- Modify: `frontend/state/window-manager.ts` (append after the `useWindows` store)
- Test: `frontend/state/window-manager.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `frontend/state/window-manager.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isWindowActive, type WindowEntry } from "./window-manager";

function entry(partial: Partial<WindowEntry> = {}): WindowEntry {
  return {
    id: "game-1",
    type: "game",
    x: 0,
    y: 0,
    z: 5,
    minimized: false,
    ...partial,
  };
}

describe("isWindowActive", () => {
  it("is active when top-z and not minimized", () => {
    expect(isWindowActive(entry({ z: 5 }), 5)).toBe(true);
  });

  it("is inactive when entry is undefined", () => {
    expect(isWindowActive(undefined, 5)).toBe(false);
  });

  it("is inactive when minimized even at top z", () => {
    expect(isWindowActive(entry({ z: 5, minimized: true }), 5)).toBe(false);
  });

  it("is inactive when not the top z", () => {
    expect(isWindowActive(entry({ z: 3 }), 5)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- window-manager`
Expected: FAIL — `isWindowActive` is not exported (TypeScript/import error or "is not a function").

- [ ] **Step 3: Add the helper**

In `frontend/state/window-manager.ts`, append at the end of the file (after the closing `}));` of the `useWindows` `create(...)` call):

```ts

/**
 * A window is "active" (the one the player is interacting with) when it
 * exists, is not minimized, and sits at the top of the z-order. Mirrors the
 * isActive logic in Window.tsx. Pure so it can be unit-tested.
 */
export function isWindowActive(
  entry: WindowEntry | undefined,
  topZ: number,
): boolean {
  return !!entry && !entry.minimized && entry.z === topZ;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- window-manager`
Expected: PASS — 4 passing.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/state/window-manager.ts frontend/state/window-manager.test.ts
git commit -m "feat: add isWindowActive helper + test"
```

---

### Task 2: Auto-pause Snake when its XP window loses focus

**Files:**
- Modify: `frontend/components/windows/GameWindow.tsx`
- Modify: `frontend/components/game/GameCanvas.tsx`

- [ ] **Step 1: Import the helper and subscribe to `topZ` in GameWindow**

In `frontend/components/windows/GameWindow.tsx`, change the import line:

```tsx
import { useWindows } from "@/state/window-manager";
```

to:

```tsx
import { useWindows, isWindowActive } from "@/state/window-manager";
```

Then change:

```tsx
  const w = useWindows((s) => s.windows.find((win) => win.type === "game"));
  const address = useWallet((s) => s.address);
```

to:

```tsx
  const w = useWindows((s) => s.windows.find((win) => win.type === "game"));
  const topZ = useWindows((s) => s.topZ);
  const address = useWallet((s) => s.address);
```

- [ ] **Step 2: Pass `windowActive` prop to GameCanvas**

In the same file, change:

```tsx
          <GameCanvas key={resetKey} onGameOver={handleGameOver} isTopScore={isTopScore} />
```

to:

```tsx
          <GameCanvas
            key={resetKey}
            onGameOver={handleGameOver}
            isTopScore={isTopScore}
            windowActive={isWindowActive(w, topZ)}
          />
```

(This expression is evaluated after the existing `if (!w) return null;` guard, so `w` is defined here.)

- [ ] **Step 3: Accept the prop in GameCanvas**

In `frontend/components/game/GameCanvas.tsx`, change the component signature:

```tsx
export function GameCanvas({
  onGameOver,
  isTopScore = false,
}: {
  onGameOver: (score: number) => void;
  isTopScore?: boolean;
}) {
```

to:

```tsx
export function GameCanvas({
  onGameOver,
  isTopScore = false,
  windowActive = true,
}: {
  onGameOver: (score: number) => void;
  isTopScore?: boolean;
  windowActive?: boolean;
}) {
```

- [ ] **Step 4: Add the auto-pause effect**

In `frontend/components/game/GameCanvas.tsx`, immediately after the `setPausedBoth` `useCallback` block:

```tsx
  // Stable so the game-loop effect doesn't re-run when it changes.
  const setPausedBoth = useCallback((v: boolean) => {
    pausedRef.current = v;
    setPaused(v);
  }, []);
```

insert:

```tsx

  // Pause when this Snake window is no longer the active XP window. Covers
  // the same-tab case the browser blur/visibilitychange handlers miss
  // (clicking another XP window does not blur the browser window). Resume
  // stays manual, consistent with those handlers. Skipped during the
  // game-over splash so the overlay keeps drawing.
  useEffect(() => {
    if (!windowActive && gameOverPhaseRef.current === null) {
      setPausedBoth(true);
    }
  }, [windowActive, setPausedBoth]);
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Verify existing tests still pass**

Run: `npm test`
Expected: all existing tests PASS (snake-engine, metadata-svg, high-score, window-manager, etc.) — no regressions.

- [ ] **Step 7: Manual smoke (canvas/RAF is not unit-testable)**

Run: `npm run dev`, open `http://localhost:3000`.
- Open Snake, start playing.
- Click another XP window (e.g. open Leaderboard from Start menu and click it).
  Expected: Snake pauses immediately; "⏸ PAUSED" overlay shows.
- Click back onto the Snake window.
  Expected: it does NOT auto-resume; overlay still shows.
- Press Esc or click "Resume (Esc)".
  Expected: game resumes from where it paused (no fast-forwarded tick).

- [ ] **Step 8: Commit**

```bash
git add frontend/components/windows/GameWindow.tsx frontend/components/game/GameCanvas.tsx
git commit -m "feat(game): auto-pause snake when its XP window loses focus"
```

---

### Task 3: Show personal best in HUD and game-over overlay

**Files:**
- Modify: `frontend/components/game/GameCanvas.tsx`

- [ ] **Step 1: Import `getBestScore`**

In `frontend/components/game/GameCanvas.tsx`, after:

```tsx
import { playEat, playDead, playStart } from "@/lib/sounds";
```

add:

```tsx
import { getBestScore } from "@/lib/high-score";
```

- [ ] **Step 2: Add `best` state and a game-over best ref**

Find the state declarations:

```tsx
  const [score, setScore] = useState(0);
  const [paused, setPaused] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
```

change to:

```tsx
  const [score, setScore] = useState(0);
  const [best] = useState(() => getBestScore());
  const [paused, setPaused] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
```

Then find the ref declarations near the top of the component (the block containing `finalScoreRef`):

```tsx
  const finalScoreRef    = useRef<number>(0);
```

add directly after it:

```tsx
  const gameOverBestRef  = useRef<number>(0);
```

- [ ] **Step 3: Capture the old best at game over**

Find, inside the game-loop, the game-over trigger:

```tsx
        if (s.gameOver && gameOverPhaseRef.current === null) {
          playDead();
          finalScoreRef.current = s.score;
          gameOverPhaseRef.current = "flash";
```

change to (capture the still-old localStorage best once, avoiding per-frame I/O — `recordScore` runs later in `MintDialog`):

```tsx
        if (s.gameOver && gameOverPhaseRef.current === null) {
          playDead();
          finalScoreRef.current = s.score;
          gameOverBestRef.current = getBestScore();
          gameOverPhaseRef.current = "flash";
```

- [ ] **Step 4: Add the personal-best line to the overlay**

Find, in `drawOverlays`, this block:

```tsx
        ctx.fillStyle = "#7fff7f";
        ctx.font = "13px monospace";
        ctx.fillText(`SCORE: ${finalScoreRef.current}`, W / 2, H / 2);

        if (isTopScore) {
          ctx.fillStyle = "#ffd700";
          ctx.font = "11px monospace";
          ctx.fillText("NEW HIGH SCORE", W / 2, H / 2 + 18);
        }

        ctx.fillStyle = "#555555";
        ctx.font = "10px monospace";
        ctx.fillText("Press any key...", W / 2, H / 2 + (isTopScore ? 36 : 22));
```

replace the entire block with (running y-offset so lines never overlap on the 320px canvas):

```tsx
        ctx.fillStyle = "#7fff7f";
        ctx.font = "13px monospace";
        ctx.fillText(`SCORE: ${finalScoreRef.current}`, W / 2, H / 2);

        let y = H / 2 + 18;
        if (finalScoreRef.current > gameOverBestRef.current) {
          ctx.fillStyle = "#ffd700";
          ctx.font = "11px monospace";
          ctx.fillText("NEW PERSONAL BEST!", W / 2, y);
        } else {
          ctx.fillStyle = "#7fff7f";
          ctx.font = "11px monospace";
          ctx.fillText(`BEST: ${gameOverBestRef.current}`, W / 2, y);
        }
        y += 18;

        if (isTopScore) {
          ctx.fillStyle = "#ffd700";
          ctx.font = "11px monospace";
          ctx.fillText("NEW HIGH SCORE", W / 2, y);
          y += 18;
        }

        ctx.fillStyle = "#555555";
        ctx.font = "10px monospace";
        ctx.fillText("Press any key...", W / 2, y + 4);
```

- [ ] **Step 5: Add `Best` to the HUD**

Find the HUD header:

```tsx
      <div className="text-xs mb-1 font-bold flex justify-between">
        <span>Score: {score}</span>
```

change the span to:

```tsx
      <div className="text-xs mb-1 font-bold flex justify-between">
        <span>Score: {score} · Best: {Math.max(best, score)}</span>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Verify existing tests still pass**

Run: `npm test`
Expected: all tests PASS — no regressions.

- [ ] **Step 8: Manual smoke**

Run: `npm run dev`.
- Play Snake. HUD shows `Score: n · Best: m`.
- Eat food until score exceeds your stored best.
  Expected: the `Best:` value climbs with the score (live max).
- Lose with a score below your best.
  Expected: overlay shows `BEST: <oldBest>` (white), no "NEW PERSONAL BEST!".
- Lose with a new record (clear `localStorage` key `xp-snake:best-score` in
  devtools first if needed).
  Expected: overlay shows gold `NEW PERSONAL BEST!`. If also in on-chain
  top-10, the separate gold `NEW HIGH SCORE` line still shows below it,
  and `Press any key...` is not overlapped.

- [ ] **Step 9: Commit**

```bash
git add frontend/components/game/GameCanvas.tsx
git commit -m "feat(game): show personal best in HUD and game-over overlay"
```

---

### Task 4: Update manual-test checklist in HANDOFF.md

**Files:**
- Modify: `HANDOFF.md` (repo root)

- [ ] **Step 1: Append the manual-test steps**

In `HANDOFF.md`, under the **"As non-owner player:"** checklist (after the `Play Snake → game over → MintDialog opens` line), add these bullets:

```markdown
- [ ] While playing, click another XP window → Snake auto-pauses ("⏸ PAUSED"); clicking back does NOT auto-resume; Esc/Resume continues
- [ ] HUD shows `Score: n · Best: m`; beating the stored best makes `Best` climb live
- [ ] Game-over overlay shows gold `NEW PERSONAL BEST!` on a record, else white `BEST: n`; on-chain `NEW HIGH SCORE` line (if top-10) still appears separately without overlapping `Press any key...`
```

- [ ] **Step 2: Commit**

```bash
git add HANDOFF.md
git commit -m "docs: add manual-test steps for snake pause + best score"
```

---

## Self-Review

**Spec coverage:**
- Item 1 active-window detection → Task 1 (`isWindowActive` + test). ✓
- Item 1 wiring (GameWindow derives, GameCanvas pause effect, manual resume, game-over guard) → Task 2. ✓
- Item 2 HUD `Best` (read-only, single-writer preserved) → Task 3 Steps 1,2,5. ✓
- Item 2 overlay personal-best line, distinct from on-chain `NEW HIGH SCORE`, no overlap on 320px canvas → Task 3 Steps 3,4. ✓
- Spec testing section (unit `isWindowActive`, existing `getBestScore` coverage, manual checklist in HANDOFF) → Task 1 + Task 4. ✓
- Non-goals (no contract/API/dep, no `recordScore`/`MintDialog` change, no auto-resume, no speed/combo) → none of the tasks touch those. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has expected output. ✓

**Type consistency:** `isWindowActive(entry: WindowEntry | undefined, topZ: number): boolean` defined in Task 1, called identically in Task 2. `windowActive?: boolean` prop default `true` consistent between GameWindow pass-site and GameCanvas signature. `gameOverBestRef` declared (Task 3 Step 2), set (Step 3), read (Step 4) — same name throughout. `best` state read in HUD only. ✓
