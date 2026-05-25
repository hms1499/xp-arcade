# UI/UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the XP Snake frontend across six areas: game feel, game over flow, boot screen, wallet onboarding, window animations, and leaderboard/NFT display.

**Architecture:** All changes are frontend-only in `frontend/`. No contract changes, no new Zustand stores (only new fields on existing ones), no new npm packages. Canvas changes stay inside `GameCanvas.tsx`; new components are placed alongside their related file. Each phase is independently shippable.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, xp.css, Zustand 5, `@stacks/connect` v8, canvas 2D API, CSS transitions/keyframes.

---

## File Map

| File | Change |
|------|--------|
| `frontend/components/game/GameCanvas.tsx` | Area 1 + 2: canvas rendering, game-over sequence |
| `frontend/components/windows/GameWindow.tsx` | Area 2: isTopScore prop wiring |
| `frontend/components/dialogs/MintDialog.tsx` | Area 2 + 4: slide-up anim, mintPending |
| `frontend/components/desktop/BootScreen.tsx` | Area 3: full rewrite |
| `frontend/state/toasts.ts` | Area 4: add type + duration fields |
| `frontend/components/dialogs/BalloonNotification.tsx` | Area 4: render typed icons |
| `frontend/components/desktop/WalletBalloon.tsx` | Area 4: NEW — XP balloon component |
| `frontend/components/desktop/SystemTray.tsx` | Area 4: render WalletBalloon + pending spinner |
| `frontend/components/desktop/Taskbar.tsx` | Area 4: wallet chip |
| `frontend/state/wallet.ts` | Area 4: add mintPending field |
| `frontend/components/windows/Window.tsx` | Area 5: open/close anim, focus flash, drag clamp |
| `frontend/components/windows/LeaderboardWindow.tsx` | Area 6: rank badges, YOU highlight, rank change |
| `frontend/components/windows/MyNftsWindow.tsx` | Area 6: XP-terminal card grid |

---

## Phase 1 — Game Feel (Area 1)

### Task 1: Canvas background + dot-grid

**Files:**
- Modify: `frontend/components/game/GameCanvas.tsx`

- [ ] **Step 1: Change background fill colour**

  In `GameCanvas.tsx`, find the line `ctx.fillStyle = "#000"` inside the `loop` function and replace:

  ```ts
  ctx.fillStyle = "#050f05";
  ctx.fillRect(0, 0, GRID * CELL, GRID * CELL);
  ```

- [ ] **Step 2: Add offscreen dot-grid canvas**

  Add a ref just before `canvasRef`:

  ```ts
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  ```

  At the top of the `useEffect` (after `gameRef.current = createGame(…)`), build the offscreen canvas:

  ```ts
  const gridCanvas = document.createElement("canvas");
  gridCanvas.width = GRID * CELL;
  gridCanvas.height = GRID * CELL;
  const gCtx = gridCanvas.getContext("2d")!;
  gCtx.fillStyle = "#0a2a0a";
  for (let gx = 0; gx <= GRID; gx++) {
    for (let gy = 0; gy <= GRID; gy++) {
      gCtx.fillRect(gx * CELL, gy * CELL, 1, 1);
    }
  }
  gridCanvasRef.current = gridCanvas;
  ```

  In the `loop` draw section, after the background fill and before drawing the snake, blit the grid:

  ```ts
  if (gridCanvasRef.current) {
    ctx.drawImage(gridCanvasRef.current, 0, 0);
  }
  ```

- [ ] **Step 3: Start dev server and verify**

  ```bash
  cd frontend && npm run dev
  ```

  Open http://localhost:3000, open the Snake window. Background should be very dark green with barely-visible dot grid instead of pure black.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/components/game/GameCanvas.tsx
  git commit -m "feat(canvas): dark green bg + dot-grid overlay"
  ```

---

### Task 2: Snake gradient body + rounded segments

**Files:**
- Modify: `frontend/components/game/GameCanvas.tsx`

- [ ] **Step 1: Add lerp helper at top of file**

  Add after the constants (`CELL`, `GRID`, etc.):

  ```ts
  function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
  }

  function lerpHex(fromHex: string, toHex: string, t: number): string {
    const from = parseInt(fromHex.slice(1), 16);
    const to   = parseInt(toHex.slice(1), 16);
    const r = Math.round(lerp((from >> 16) & 0xff, (to >> 16) & 0xff, t));
    const g = Math.round(lerp((from >> 8)  & 0xff, (to >> 8)  & 0xff, t));
    const b = Math.round(lerp( from        & 0xff,  to        & 0xff, t));
    return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
  }
  ```

- [ ] **Step 2: Replace flat snake rendering with gradient + rounded rects**

  Find the existing snake draw loop:

  ```ts
  s.snake.forEach((c, i) => {
    ctx.fillStyle = i === 0 ? "#7fff7f" : "#0f0";
    ctx.fillRect(c.x * CELL, c.y * CELL, CELL - 1, CELL - 1);
  });
  ```

  Replace with:

  ```ts
  s.snake.forEach((c, i) => {
    const t = s.snake.length > 1 ? i / (s.snake.length - 1) : 0;
    if (reduceMotion) {
      ctx.fillStyle = "#0f0";
    } else {
      ctx.fillStyle = i === 0
        ? "#7fff7f"
        : lerpHex("#4aee4a", "#0f660f", t);
    }
    if (i === 0 && !reduceMotion) {
      ctx.shadowBlur = 4;
      ctx.shadowColor = "#7fff7f";
    } else {
      ctx.shadowBlur = 0;
    }
    const x = c.x * CELL;
    const y = c.y * CELL;
    const size = CELL - 1;
    const r = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, r);
    ctx.fill();
  });
  ctx.shadowBlur = 0;
  ```

  > `roundRect` is available in all modern browsers. No polyfill needed.

- [ ] **Step 3: Verify visually**

  Snake head should be bright green with a faint glow; body should fade to dark green toward the tail. Segments have slightly rounded corners.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/components/game/GameCanvas.tsx
  git commit -m "feat(canvas): gradient snake body + rounded segments"
  ```

---

### Task 3: Food glow + pulse animation

**Files:**
- Modify: `frontend/components/game/GameCanvas.tsx`

- [ ] **Step 1: Add food pulse ref**

  Add a ref after `flashUntilRef`:

  ```ts
  const foodPulseRef = useRef(0); // last timestamp of pulse toggle
  const foodGlowRef  = useRef(8); // current shadowBlur: 6 or 12
  ```

- [ ] **Step 2: Pulse logic in draw loop**

  In the draw loop, before drawing food, add:

  ```ts
  if (!reduceMotion) {
    if (t - foodPulseRef.current >= 600) {
      foodGlowRef.current = foodGlowRef.current === 6 ? 12 : 6;
      foodPulseRef.current = t;
    }
  }
  ```

- [ ] **Step 3: Replace food rect with glowing circle**

  Find:

  ```ts
  ctx.fillStyle = "#f80";
  ctx.fillRect(s.food.x * CELL, s.food.y * CELL, CELL - 1, CELL - 1);
  ```

  Replace with:

  ```ts
  ctx.fillStyle = "#ff8800";
  ctx.shadowBlur   = reduceMotion ? 6 : foodGlowRef.current;
  ctx.shadowColor  = "#ff8800";
  const fx = s.food.x * CELL + (CELL - 1) / 2;
  const fy = s.food.y * CELL + (CELL - 1) / 2;
  const fr = (CELL - 1) / 2 - 1;
  ctx.beginPath();
  ctx.arc(fx, fy, fr, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ```

- [ ] **Step 4: Verify**

  Food should be a glowing orange circle that pulses between dim and bright glow every 600ms.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/components/game/GameCanvas.tsx
  git commit -m "feat(canvas): food as glowing pulsing circle"
  ```

---

### Task 4: Score popup (+1 float)

**Files:**
- Modify: `frontend/components/game/GameCanvas.tsx`

- [ ] **Step 1: Add popup tracking ref**

  Add a ref for score popups:

  ```ts
  const popupsRef = useRef<{ x: number; y: number; born: number }[]>([]);
  ```

- [ ] **Step 2: Spawn popup on score increase**

  Find the existing score-increase block:

  ```ts
  if (s.score > prevScore) {
    setScore(s.score);
    playEat();
  }
  ```

  Replace with:

  ```ts
  if (s.score > prevScore) {
    setScore(s.score);
    playEat();
    if (!reduceMotion) {
      const head = s.snake[0];
      popupsRef.current.push({
        x: head.x * CELL + CELL / 2,
        y: head.y * CELL,
        born: t,
      });
    }
  }
  ```

- [ ] **Step 3: Render and expire popups in draw loop**

  After the food draw, before checking `s.gameOver`, add:

  ```ts
  const POPUP_MS = 500;
  popupsRef.current = popupsRef.current.filter((p) => t - p.born < POPUP_MS);
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  for (const p of popupsRef.current) {
    const elapsed = t - p.born;
    const alpha = 1 - elapsed / POPUP_MS;
    const yOff  = -elapsed * 0.04;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#7fff7f";
    ctx.fillText("+1", p.x, p.y + yOff);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
  ```

- [ ] **Step 4: Verify**

  Eat a piece of food — a faint "+1" should float upward and fade above the head.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/components/game/GameCanvas.tsx
  git commit -m "feat(canvas): +1 score popup float on eat"
  ```

---

### Task 5: Speed bar

**Files:**
- Modify: `frontend/components/game/GameCanvas.tsx`

- [ ] **Step 1: Replace text speed indicator with a bar**

  Find the JSX speed indicator:

  ```tsx
  <span style={{ color: tickMs(score) <= 60 ? "#ff4444" : tickMs(score) <= 90 ? "#ffaa00" : "#888" }}>
    {tickMs(score) <= 60 ? "⚡ MAX SPEED" : tickMs(score) <= 90 ? "🔥 FAST" : ""}
  </span>
  ```

  Replace with:

  ```tsx
  <div
    style={{
      flex: 1,
      height: 5,
      background: "#222",
      borderRadius: 2,
      overflow: "hidden",
      margin: "0 4px",
      alignSelf: "center",
    }}
  >
    <div
      style={{
        height: "100%",
        width: `${Math.round(lerp(0, 100, (BASE_TICK_MS - tickMs(score)) / (BASE_TICK_MS - MIN_TICK_MS)))}%`,
        background: tickMs(score) <= 60
          ? "#ff4444"
          : tickMs(score) <= 90
          ? "#ffaa00"
          : "#4aee4a",
        transition: "width 120ms linear, background 120ms linear",
      }}
    />
  </div>
  ```

  Note: `lerp` is already defined in this file from Task 2.

- [ ] **Step 2: Verify**

  Play until fast — the small bar below the score should grow and change colour from green → yellow → red.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/components/game/GameCanvas.tsx
  git commit -m "feat(canvas): speed bar replaces text indicator"
  ```

---

## Phase 2 — Game Over Flow (Area 2)

### Task 6: Death flash + gameOverPhase ref

**Files:**
- Modify: `frontend/components/game/GameCanvas.tsx`

- [ ] **Step 1: Add gameOverPhase ref and deferred callback ref**

  Add two refs near the other refs:

  ```ts
  const gameOverPhaseRef = useRef<null | "flash" | "overlay">(null);
  const finalScoreRef    = useRef<number>(0);
  ```

- [ ] **Step 2: Change death handling — do not call onGameOver immediately**

  Find:

  ```ts
  if (s.gameOver) {
    stopped = true;
    playDead();
    onGameOver(s.score);
    return;
  }
  ```

  Replace with:

  ```ts
  if (s.gameOver && gameOverPhaseRef.current === null) {
    playDead();
    finalScoreRef.current = s.score;
    gameOverPhaseRef.current = "flash";
    // flash for 200ms, then switch to overlay
    setTimeout(() => {
      gameOverPhaseRef.current = "overlay";
    }, 200);
  }
  ```

- [ ] **Step 3: Draw red flash during "flash" phase**

  In the draw section, after the regular frame draw (after the `if (ctx)` block closes), add:

  ```ts
  if (gameOverPhaseRef.current === "flash") {
    const ctx2 = canvasRef.current?.getContext("2d");
    if (ctx2) {
      ctx2.fillStyle = "rgba(255,0,0,0.35)";
      ctx2.fillRect(0, 0, GRID * CELL, GRID * CELL);
    }
  }
  ```

- [ ] **Step 4: Keep RAF loop running during game-over phases**

  After the `if (s.gameOver)` block, ensure the loop continues when we're in flash/overlay:

  ```ts
  if (gameOverPhaseRef.current === null) {
    raf = requestAnimationFrame(loop);
  } else {
    raf = requestAnimationFrame(loop); // keep running to draw overlay
  }
  ```

  (The existing `raf = requestAnimationFrame(loop)` at the end of `loop` handles this already — just remove the early `return` from the old death handler. Ensure the function does **not** `return` early when in a game-over phase.)

- [ ] **Step 5: Verify**

  Die in the game — canvas should briefly flash red, then keep running (overlay phase comes in Task 7).

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/components/game/GameCanvas.tsx
  git commit -m "feat(game-over): death flash sequence before dialog"
  ```

---

### Task 7: Game-over canvas overlay

**Files:**
- Modify: `frontend/components/game/GameCanvas.tsx`

- [ ] **Step 1: Accept new optional prop `isTopScore`**

  Change the component signature:

  ```ts
  export function GameCanvas({
    onGameOver,
    isTopScore = false,
  }: {
    onGameOver: (score: number) => void;
    isTopScore?: boolean;
  }) {
  ```

- [ ] **Step 2: Draw overlay when in "overlay" phase**

  In the canvas draw section (inside the RAF loop, at the same level as the flash draw), add an overlay draw:

  ```ts
  if (gameOverPhaseRef.current === "overlay") {
    const ctx2 = canvasRef.current?.getContext("2d");
    if (ctx2) {
      const W = GRID * CELL;
      const H = GRID * CELL;
      ctx2.fillStyle = "rgba(0,0,0,0.72)";
      ctx2.fillRect(0, 0, W, H);

      ctx2.textAlign = "center";
      ctx2.fillStyle = "#ffffff";
      ctx2.font = "bold 16px monospace";
      ctx2.letterSpacing = "3px";
      ctx2.fillText("GAME OVER", W / 2, H / 2 - 24);

      ctx2.fillStyle = "#7fff7f";
      ctx2.font = "13px monospace";
      ctx2.letterSpacing = "0px";
      ctx2.fillText(`SCORE: ${finalScoreRef.current}`, W / 2, H / 2);

      if (isTopScore) {
        ctx2.fillStyle = "#ffd700";
        ctx2.font = "11px monospace";
        ctx2.fillText("✦ NEW HIGH SCORE ✦", W / 2, H / 2 + 18);
      }

      ctx2.fillStyle = "#555555";
      ctx2.font = "10px monospace";
      ctx2.fillText("Press any key...", W / 2, H / 2 + (isTopScore ? 36 : 22));

      ctx2.textAlign = "left";
    }
  }
  ```

  > Note: `letterSpacing` on canvas 2D context is a newer API (Chrome 99+, Firefox 113+). Gracefully skip if unsupported — text will render without extra spacing.

- [ ] **Step 3: Advance on keypress or timeout**

  In the `onKey` handler (where Arrow/WASD keys are handled), add at the top of the handler:

  ```ts
  if (gameOverPhaseRef.current === "overlay") {
    gameOverPhaseRef.current = null;
    stopped = true; // stop the RAF loop (existing mechanism)
    onGameOver(finalScoreRef.current);
    return;
  }
  ```

  Also add a timeout fallback (put this right after the `setTimeout` for "overlay" in Task 6 step 2):

  ```ts
  setTimeout(() => {
    if (gameOverPhaseRef.current === "overlay") {
      gameOverPhaseRef.current = null;
      onGameOver(finalScoreRef.current);
    }
  }, 3000); // auto-advance after 3s if user doesn't press key
  ```

  For touch devices, add the same advance in a `touchstart` handler in `useEffect`:

  ```ts
  const onTouch = () => {
    if (gameOverPhaseRef.current === "overlay") {
      gameOverPhaseRef.current = null;
      stopped = true;
      onGameOver(finalScoreRef.current);
    }
  };
  const canvasEl = canvasRef.current;
  canvasEl?.addEventListener("touchstart", onTouch);
  ```

  Add the cleanup to the existing `return () => { … }` in the effect:

  ```ts
  canvasEl?.removeEventListener("touchstart", onTouch);
  ```

- [ ] **Step 4: Verify**

  Die → red flash → "GAME OVER" overlay → press any key → MintDialog appears.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/components/game/GameCanvas.tsx
  git commit -m "feat(game-over): canvas overlay before MintDialog"
  ```

---

### Task 8: isTopScore wiring in GameWindow

**Files:**
- Modify: `frontend/components/windows/GameWindow.tsx`

- [ ] **Step 1: Add isTopScore state and fetch on game over**

  ```ts
  import { getTopTen } from "@/lib/contract-calls";
  ```

  Add state:

  ```ts
  const [isTopScore, setIsTopScore] = useState(false);
  ```

  Change the `onGameOver` handler passed to `GameCanvas`:

  ```ts
  const handleGameOver = useCallback(async (score: number) => {
    setFinalScore(score);
    try {
      const top = await getTopTen();
      const min = top.length < 10
        ? -1
        : Math.min(...top.map((e) => e.score));
      setIsTopScore(score > min);
    } catch {
      setIsTopScore(false);
    }
  }, []);
  ```

  Reset on play again:

  ```ts
  onPlayAgain={() => {
    setFinalScore(null);
    setIsTopScore(false);
    setResetKey((k) => k + 1);
  }}
  ```

- [ ] **Step 2: Pass isTopScore to GameCanvas**

  ```tsx
  <GameCanvas key={resetKey} onGameOver={handleGameOver} isTopScore={isTopScore} />
  ```

  > The `isTopScore` prop is only read during the overlay phase, after `handleGameOver` resolves — the async gap is fine.

- [ ] **Step 3: TypeScript check**

  ```bash
  cd frontend && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/components/windows/GameWindow.tsx frontend/components/game/GameCanvas.tsx
  git commit -m "feat(game-over): isTopScore check after each game"
  ```

---

### Task 9: MintDialog slide-up entry animation

**Files:**
- Modify: `frontend/components/dialogs/MintDialog.tsx`

- [ ] **Step 1: Add slide-up keyframes to globals.css**

  Open `frontend/app/globals.css` and append at the bottom:

  ```css
  @keyframes slide-up-in {
    from { transform: translateY(20px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }

  .mint-dialog-enter {
    animation: slide-up-in 180ms ease-out both;
  }

  @media (prefers-reduced-motion: reduce) {
    .mint-dialog-enter { animation: none; }
  }
  ```

- [ ] **Step 2: Apply class to the MintDialog root div**

  In `MintDialog.tsx`, the outermost returned element (the div that wraps the dialog content):

  Find the first `return (` and wrap the content div with the class:

  ```tsx
  return (
    <div className="mint-dialog-enter">
      {/* existing content */}
    </div>
  );
  ```

  > Because `key` in `GameWindow` changes when `finalScore` flips from null to a value, the component remounts each time — the CSS animation fires on every game-over. No JS needed.

- [ ] **Step 3: Verify**

  Die in game → canvas overlay → press key → MintDialog slides up smoothly.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/app/globals.css frontend/components/dialogs/MintDialog.tsx
  git commit -m "feat(mint-dialog): slide-up entry animation"
  ```

---

## Phase 3 — Boot Screen (Area 3)

### Task 10: Boot screen rewrite

**Files:**
- Modify: `frontend/components/desktop/BootScreen.tsx`

- [ ] **Step 1: Add keyframes to globals.css**

  Append to `frontend/app/globals.css`:

  ```css
  @keyframes xp-bar-slide {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(500%); }
  }

  @keyframes boot-fade-out {
    from { opacity: 1; }
    to   { opacity: 0; }
  }

  @keyframes desktop-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .xp-bar-slider    { animation: none !important; }
    .boot-fade-out    { animation: none !important; }
    .desktop-fade-in  { animation: none !important; }
  }
  ```

- [ ] **Step 2: Rewrite BootScreen component**

  Replace the entire content of `BootScreen.tsx` with:

  ```tsx
  "use client";
  import { useEffect, useState } from "react";

  const STATUS_MESSAGES = [
    "Loading fonts...",
    "Connecting to Stacks mainnet...",
    "Preparing game engine...",
    "Almost ready...",
  ];

  const FAST_BOOT_MS = 800;
  const FULL_BOOT_MS = 3200;

  export function BootScreen({ children }: { children: React.ReactNode }) {
    const [statusIdx, setStatusIdx] = useState(0);
    const [fading, setFading] = useState(false);
    const [booted, setBooted] = useState(false);

    useEffect(() => {
      const fast = typeof sessionStorage !== "undefined" && sessionStorage.getItem("xp-booted") === "1";
      const duration = fast ? FAST_BOOT_MS : FULL_BOOT_MS;

      const msgInterval = setInterval(() => {
        setStatusIdx((i) => (i + 1) % STATUS_MESSAGES.length);
      }, 800);

      const fadeTimeout = setTimeout(() => {
        clearInterval(msgInterval);
        setFading(true);
        setTimeout(() => {
          sessionStorage.setItem("xp-booted", "1");
          setBooted(true);
        }, 400);
      }, duration);

      return () => {
        clearInterval(msgInterval);
        clearTimeout(fadeTimeout);
      };
    }, []);

    if (booted) {
      return (
        <div className="desktop-fade-in" style={{ animation: "desktop-fade-in 300ms ease-out both" }}>
          {children}
        </div>
      );
    }

    return (
      <div
        className={fading ? "boot-fade-out" : undefined}
        style={{
          position: "fixed",
          inset: 0,
          background: "#000080",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          animation: fading ? "boot-fade-out 400ms ease-in both" : undefined,
        }}
      >
        {/* Logo */}
        <div style={{ fontSize: 32, letterSpacing: -2, fontFamily: "Arial, sans-serif", fontWeight: 700 }}>
          <span style={{ color: "#ffff00" }}>xp</span>
          <span style={{ color: "#ffffff", fontWeight: 300 }}>snake</span>
        </div>

        {/* Status text */}
        <div style={{ color: "#aaaaaa", fontSize: 11, fontFamily: "Arial, sans-serif", letterSpacing: "0.05em", minHeight: 16 }}>
          {STATUS_MESSAGES[statusIdx]}
        </div>

        {/* XP progress bar */}
        <div style={{
          width: 120, height: 12,
          background: "#000058",
          border: "1px solid #4444aa",
          borderRadius: 2,
          overflow: "hidden",
        }}>
          <div
            className="xp-bar-slider"
            style={{
              width: "25%",
              height: "100%",
              background: "linear-gradient(to right, #1e3a8a, #60a5fa, #1e3a8a)",
              animation: "xp-bar-slide 1.2s linear infinite",
            }}
          />
        </div>

        {/* Footnote */}
        <div style={{ color: "#4444aa", fontSize: 9, fontFamily: "Arial, sans-serif" }}>
          Stacks mainnet
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 3: Verify**

  Hard-refresh the page. Should see: dark blue screen, "xpsnake" logo, cycling status text, sliding progress bar. Fades out to desktop. On second refresh, boots faster.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/components/desktop/BootScreen.tsx frontend/app/globals.css
  git commit -m "feat(boot): XP-style animated boot screen with fast-revisit"
  ```

---

## Phase 4 — Wallet Connect & NFT Flow (Area 4)

### Task 11: Toast type system

**Files:**
- Modify: `frontend/state/toasts.ts`
- Modify: `frontend/components/dialogs/BalloonNotification.tsx`

- [ ] **Step 1: Extend Toast type**

  Replace the content of `frontend/state/toasts.ts` with:

  ```ts
  "use client";
  import { create } from "zustand";

  export type ToastType = "info" | "success" | "error";

  export type Toast = {
    id: number;
    title: string;
    body: string;
    type: ToastType;
    duration: number;
  };

  type S = {
    toasts: Toast[];
    push: (t: Omit<Toast, "id"> & { type?: ToastType; duration?: number }) => void;
    dismiss: (id: number) => void;
  };

  export const useToasts = create<S>((set, get) => ({
    toasts: [],
    push: (t) => {
      const id = Date.now() + Math.random();
      const type: ToastType = t.type ?? "info";
      const duration = t.duration ?? 6000;
      set((s) => ({ toasts: [...s.toasts, { ...t, id, type, duration }] }));
      setTimeout(() => get().dismiss(id), duration);
    },
    dismiss: (id) =>
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  }));
  ```

- [ ] **Step 2: Run TypeScript check**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```

  Fix any type errors that appear from callers that use `push` without a `type` field — the `?` default handles this, so there should be none.

- [ ] **Step 3: Update BalloonNotification to show type icons**

  In `frontend/components/dialogs/BalloonNotification.tsx`, update the toast render:

  ```tsx
  const TYPE_ICON: Record<string, string> = {
    info:    "ℹ️",
    success: "✅",
    error:   "❌",
  };

  // Inside the map:
  <div
    key={t.id}
    onClick={() => dismiss(t.id)}
    style={{
      width: 240,
      background: "#ffffe1",
      border: "1px solid #000000",
      padding: "4px 8px",
      cursor: "default",
      fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
      fontSize: 11,
    }}
  >
    <div style={{ fontWeight: "bold", marginBottom: 2, display: "flex", gap: 4, alignItems: "center" }}>
      <span>{TYPE_ICON[t.type] ?? TYPE_ICON.info}</span>
      {t.title}
    </div>
    <div style={{ color: "#000000" }}>{t.body}</div>
  </div>
  ```

- [ ] **Step 4: Update MintDialog to use typed toasts**

  In `MintDialog.tsx`, find the success toast push:

  ```ts
  useToasts.getState().push({
    title: "NFT confirmed!",
    body: `Score #${score} NFT is on-chain.`,
  });
  ```

  Replace with:

  ```ts
  useToasts.getState().push({
    title: "NFT confirmed!",
    body: `Score #${score} NFT is on-chain.`,
    type: "success",
    duration: 6000,
  });
  ```

  And the failure toast:

  ```ts
  useToasts.getState().push({
    title: "Mint failed",
    body: "Transaction was rejected on-chain.",
    type: "error",
    duration: 5000,
  });
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/state/toasts.ts frontend/components/dialogs/BalloonNotification.tsx frontend/components/dialogs/MintDialog.tsx
  git commit -m "feat(toasts): add type + duration fields, typed icons"
  ```

---

### Task 12: mintPending flag in wallet store

**Files:**
- Modify: `frontend/state/wallet.ts`
- Modify: `frontend/components/dialogs/MintDialog.tsx`

- [ ] **Step 1: Add mintPending to wallet store**

  In `frontend/state/wallet.ts`, extend the type and initial state:

  ```ts
  type WalletState = {
    address: string | null;
    mintPending: boolean;
    connect: () => Promise<void>;
    disconnect: () => void;
    hydrate: () => void;
    setMintPending: (v: boolean) => void;
  };

  export const useWallet = create<WalletState>((set) => ({
    address: null,
    mintPending: false,
    connect: async () => {
      await connectWallet();
      set({ address: readStoredAddress() });
    },
    disconnect: () => {
      disconnectWallet();
      set({ address: null });
    },
    hydrate: () => {
      if (isConnected()) {
        set({ address: readStoredAddress() });
      }
    },
    setMintPending: (v) => set({ mintPending: v }),
  }));
  ```

- [ ] **Step 2: Set mintPending in MintDialog**

  In `MintDialog.tsx`, import `useWallet`:

  ```ts
  const setMintPending = useWallet((s) => s.setMintPending);
  ```

  When tx is submitted (after `setTxId(txId)`):

  ```ts
  setMintPending(true);
  useToasts.getState().push({
    title: "Minting…",
    body: "Waiting for on-chain confirmation",
    type: "info",
    duration: 30_000,
  });
  ```

  When tx resolves (inside `watchTx` callback, after `setTxStatus(s)`, for both success and failure):

  ```ts
  if (s === "success") {
    setMintPending(false);
    // existing success toast
  } else if (s !== "pending") {
    setMintPending(false);
    // existing error toast
  }
  ```

- [ ] **Step 3: TypeScript check**

  ```bash
  cd frontend && npx tsc --noEmit
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/state/wallet.ts frontend/components/dialogs/MintDialog.tsx
  git commit -m "feat(wallet): mintPending flag for tx spinner"
  ```

---

### Task 13: System tray pending spinner

**Files:**
- Modify: `frontend/components/desktop/SystemTray.tsx`

- [ ] **Step 1: Add spinner keyframe to globals.css**

  Append to `frontend/app/globals.css`:

  ```css
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  ```

- [ ] **Step 2: Add pending spinner to SystemTray**

  In `SystemTray.tsx`, add the `mintPending` selector:

  ```ts
  const mintPending = useWallet((s) => s.mintPending);
  ```

  Inside the returned JSX, before the first `<div style={sunken}>`, add:

  ```tsx
  {mintPending && (
    <div
      style={{
        ...sunken,
        width: 20,
        padding: 0,
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          border: "2px solid #808080",
          borderTopColor: "#000080",
          animation: "spin 0.7s linear infinite",
        }}
      />
    </div>
  )}
  ```

- [ ] **Step 3: Verify**

  Mint an NFT — a small spinner should appear in the system tray while the tx is pending, disappearing on confirmation.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/components/desktop/SystemTray.tsx frontend/app/globals.css
  git commit -m "feat(system-tray): tx pending spinner"
  ```

---

### Task 14: WalletBalloon component

**Files:**
- Create: `frontend/components/desktop/WalletBalloon.tsx`
- Modify: `frontend/components/desktop/SystemTray.tsx`
- Modify: `frontend/components/windows/GameWindow.tsx`

- [ ] **Step 1: Remove inline "Playing offline" banner from GameWindow**

  In `GameWindow.tsx`, delete the entire `{finalScore === null && !address && (<div …>…</div>)}` block:

  ```tsx
  // DELETE this block:
  {finalScore === null && !address && (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
        padding: "4px 8px",
        background: "#ffffe1",
        border: "1px solid #808080",
        fontSize: 11,
        fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
      }}
    >
      <span style={{ flex: 1 }}>
        💡 Playing offline — connect your wallet to save your score on-chain
      </span>
      <button onClick={connect} style={{ fontSize: 11 }}>
        Connect Wallet
      </button>
    </div>
  )}
  ```

  Also remove the unused `connect` selector if no longer needed elsewhere in the component.

- [ ] **Step 2: Create WalletBalloon component**

  Create `frontend/components/desktop/WalletBalloon.tsx`:

  ```tsx
  "use client";
  import { useEffect, useState } from "react";
  import { useWallet } from "@/state/wallet";

  export function WalletBalloon() {
    const address = useWallet((s) => s.address);
    const connect = useWallet((s) => s.connect);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
      if (address) return;
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("balloon-dismissed") === "1") return;

      const t = setTimeout(() => setVisible(true), 3000);
      return () => clearTimeout(t);
    }, [address]);

    useEffect(() => {
      if (!visible) return;
      const t = setTimeout(() => dismiss(), 8000);
      return () => clearTimeout(t);
    }, [visible]);

    function dismiss() {
      setVisible(false);
      sessionStorage.setItem("balloon-dismissed", "1");
    }

    if (!visible || address) return null;

    return (
      <div
        style={{
          position: "fixed",
          bottom: 36,
          right: 8,
          width: 220,
          background: "#ffffe1",
          border: "1px solid #000000",
          padding: "8px 10px",
          fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
          fontSize: 11,
          zIndex: 60,
          boxShadow: "2px 2px 6px rgba(0,0,0,0.3)",
        }}
      >
        {/* Close button */}
        <button
          onClick={dismiss}
          style={{
            position: "absolute", top: 4, right: 6,
            background: "none", border: "none", cursor: "pointer",
            fontSize: 10, color: "#666", padding: 0,
          }}
        >
          ✕
        </button>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ fontSize: 18 }}>🦊</span>
          <div>
            <div style={{ fontWeight: "bold", marginBottom: 2 }}>Connect your wallet</div>
            <div style={{ color: "#444", marginBottom: 6, lineHeight: 1.4 }}>
              Save scores on-chain &amp; mint NFTs
            </div>
            <button onClick={connect} style={{ fontSize: 10, padding: "2px 10px" }}>
              Connect Now
            </button>
          </div>
        </div>

        {/* Triangle tail */}
        <div style={{
          position: "absolute", bottom: -8, right: 18,
          width: 0, height: 0,
          borderLeft: "7px solid transparent",
          borderRight: "7px solid transparent",
          borderTop: "8px solid #000000",
        }} />
        <div style={{
          position: "absolute", bottom: -7, right: 19,
          width: 0, height: 0,
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderTop: "7px solid #ffffe1",
        }} />
      </div>
    );
  }
  ```

- [ ] **Step 3: Render WalletBalloon in SystemTray**

  In `SystemTray.tsx`, import and render:

  ```ts
  import { WalletBalloon } from "./WalletBalloon";
  ```

  At the end of the returned `<div>`, add:

  ```tsx
  <WalletBalloon />
  ```

- [ ] **Step 4: Verify**

  Clear sessionStorage, load page. After 3 seconds (disconnected), balloon appears bottom-right with tail pointing toward tray. Auto-dismisses after 8s or on ✕ click. Does not reappear after dismiss.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/components/desktop/WalletBalloon.tsx frontend/components/desktop/SystemTray.tsx frontend/components/windows/GameWindow.tsx
  git commit -m "feat(wallet): XP balloon onboarding, remove inline banner"
  ```

---

### Task 15: Wallet chip in Taskbar

**Files:**
- Modify: `frontend/components/desktop/Taskbar.tsx`

- [ ] **Step 1: Add wallet chip**

  In `Taskbar.tsx`, add import:

  ```ts
  import { useWallet } from "@/state/wallet";
  import { useWindows as useWin } from "@/state/window-manager";
  ```

  Add selectors inside the component:

  ```ts
  const walletAddress = useWallet((s) => s.address);
  ```

  Helper to truncate address:

  ```ts
  function shortAddr(addr: string) {
    return `${addr.slice(0, 4)}…${addr.slice(-3)}`;
  }
  ```

  In the JSX, after the vertical divider (the `<div style={{ width:1 … }}/>`) and before the window buttons `<div>`, add:

  ```tsx
  {walletAddress && (
    <button
      onClick={() => useWin.getState().open("player-profile", { address: walletAddress })}
      style={{
        height: 22,
        padding: "0 8px",
        fontSize: 11,
        fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
        display: "flex",
        alignItems: "center",
        gap: 4,
        flexShrink: 0,
      }}
    >
      <span style={{ color: "#00aa00", fontSize: 8 }}>●</span>
      {shortAddr(walletAddress)}
    </button>
  )}
  ```

- [ ] **Step 2: Verify**

  Connect wallet → compact chip with green dot + truncated address appears in taskbar. Click opens Player Profile window.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/components/desktop/Taskbar.tsx
  git commit -m "feat(taskbar): wallet address chip when connected"
  ```

---

## Phase 5 — Window Animations (Area 5)

### Task 16: Window open animation

**Files:**
- Modify: `frontend/components/windows/Window.tsx`
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Add keyframes to globals.css**

  Append:

  ```css
  @keyframes window-open {
    from { transform: scale(0.92); opacity: 0; }
    to   { transform: scale(1);    opacity: 1; }
  }

  @keyframes window-close {
    from { transform: scale(1);    opacity: 1; }
    to   { transform: scale(0.92); opacity: 0; }
  }

  .window-opening {
    animation: window-open 150ms ease-out both;
  }

  .window-closing {
    animation: window-close 120ms ease-in both;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .window-opening, .window-closing { animation: none; }
  }
  ```

- [ ] **Step 2: Add `closing` state and animate open/close in Window.tsx**

  Add import:

  ```ts
  import { ReactNode, useRef, useState } from "react";
  ```

  Add state at the top of the component body:

  ```ts
  const [closing, setClosing] = useState(false);
  ```

  Change the close button's `onClick`:

  ```tsx
  <button
    aria-label="Close"
    onClick={() => {
      setClosing(true);
    }}
  />
  ```

  On the outermost `<div className="window">`, add:

  ```tsx
  className={`window window-opening${closing ? " window-closing" : ""}`}
  onAnimationEnd={() => {
    if (closing) close(id);
  }}
  ```

- [ ] **Step 3: Verify**

  Open and close any window — should scale in on open, scale out on close.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/components/windows/Window.tsx frontend/app/globals.css
  git commit -m "feat(window): open/close scale animations"
  ```

---

### Task 17: Window focus flash + drag clamping

**Files:**
- Modify: `frontend/components/windows/Window.tsx`

- [ ] **Step 1: Add focus flash via ref**

  Add a ref:

  ```ts
  const flashingRef = useRef(false);
  const titlebarRef = useRef<HTMLDivElement>(null);
  ```

  On the `title-bar` div, add the ref and a flash handler on `mousedown` for unfocused windows:

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
      // existing drag logic below…
    }}
  >
  ```

- [ ] **Step 2: Add drag clamping**

  In the drag `onMove` handler, replace the `move(id, …)` call:

  ```ts
  const onMove = (ev: MouseEvent) => {
    if (!dragRef.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rawX = ev.clientX - dragRef.current.ox;
    const rawY = ev.clientY - dragRef.current.oy;
    const clampedX = Math.max(-width + 60, Math.min(rawX, vw - 60));
    const clampedY = Math.max(0, Math.min(rawY, vh - 28));
    move(id, clampedX, clampedY);
  };
  ```

- [ ] **Step 3: Verify**

  Click an unfocused window — titlebar briefly flashes bright. Drag a window to screen edges — stops at boundary, titlebar stays reachable.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/components/windows/Window.tsx
  git commit -m "feat(window): focus flash + drag clamping"
  ```

---

## Phase 6 — Leaderboard & My NFTs (Area 6)

### Task 18: Leaderboard rank change tracking

**Files:**
- Modify: `frontend/components/windows/LeaderboardWindow.tsx`

- [ ] **Step 1: Add rank-change diff helper at the top of the file**

  Add after the imports, before the component:

  ```ts
  type RankSnapshot = Record<string, number>;

  function loadSnapshot(): RankSnapshot {
    try {
      return JSON.parse(sessionStorage.getItem("lb-snapshot") ?? "{}");
    } catch {
      return {};
    }
  }

  function saveSnapshot(rows: { player: string; score: number }[]) {
    const snap: RankSnapshot = {};
    rows.forEach((r) => { snap[r.player] = r.score; });
    sessionStorage.setItem("lb-snapshot", JSON.stringify(snap));
  }

  function rankChange(player: string, currentRank: number, snapshot: RankSnapshot, sortedRows: { player: string; score: number }[]): "up" | "down" | "same" | "new" {
    if (!(player in snapshot)) return "new";
    const prevEntries = Object.entries(snapshot).sort((a, b) => b[1] - a[1]);
    const prevRank = prevEntries.findIndex(([addr]) => addr === player) + 1;
    if (prevRank === 0) return "new";
    if (currentRank < prevRank) return "up";
    if (currentRank > prevRank) return "down";
    return "same";
  }
  ```

- [ ] **Step 2: Load snapshot on mount and save on each fetch**

  Add state:

  ```ts
  const [snapshot, setSnapshot] = useState<RankSnapshot>(() => loadSnapshot());
  ```

  In the `load()` function inside `useEffect`, after `setRows(sorted)`:

  ```ts
  setSnapshot(loadSnapshot()); // read before saving
  saveSnapshot(sorted);
  // reset snapshot if season changed (§7.4)
  getCurrentSeason().then((season) => {
    const storedSeason = sessionStorage.getItem("lb-season");
    if (storedSeason && storedSeason !== String(season)) {
      sessionStorage.removeItem("lb-snapshot");
      setSnapshot({});
    }
    sessionStorage.setItem("lb-season", String(season));
  }).catch(() => {});
  ```

  > Read before save so `rankChange` sees the prior state; then update for next visit. `getCurrentSeason` is already imported in this file.

- [ ] **Step 3: Commit helper functions**

  ```bash
  git add frontend/components/windows/LeaderboardWindow.tsx
  git commit -m "feat(leaderboard): rank change tracking via sessionStorage"
  ```

---

### Task 19: Leaderboard visual upgrades

**Files:**
- Modify: `frontend/components/windows/LeaderboardWindow.tsx`

- [ ] **Step 1: Replace the table rows with styled rows**

  Find the `<table>` block in `LeaderboardWindow.tsx` and replace it entirely:

  ```tsx
  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
    {rows === null && !error && (
      <>
        {[0,1,2].map((i) => (
          <div key={i} style={{ height: 26, background: "#e0e0e0", borderRadius: 3, animation: "shimmer 1.2s linear infinite" }} />
        ))}
      </>
    )}
    {rows?.length === 0 && (
      <div style={{ textAlign: "center", color: "#888", fontSize: 11, padding: "12px 0" }}>
        No scores yet. Be the first!
      </div>
    )}
    {rows?.map((r, i) => {
      const rank = i + 1;
      const isMe = r.player === address;
      const change = rankChange(r.player, rank, snapshot, rows);
      const BADGE_BG: Record<number, string> = { 1: "#ffd700", 2: "#c0c0c0", 3: "#cd7f32" };
      const badgeBg = BADGE_BG[rank] ?? "#bbbbbb";
      const badgeColor = rank <= 3 ? (rank === 1 ? "#7a5c00" : rank === 2 ? "#444" : "#fff") : "#555";

      return (
        <div
          key={r.player}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 6px",
            borderRadius: 3,
            borderLeft: isMe ? "3px solid #f59e0b" : "3px solid transparent",
            background: isMe ? "#fff8e1" : rank === 1 ? "#fffde7" : "transparent",
            fontSize: 11,
            fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
          }}
        >
          {/* Rank badge */}
          <div style={{
            width: 18, height: 18, borderRadius: "50%",
            background: badgeBg, color: badgeColor,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: "bold", flexShrink: 0,
          }}>
            {rank}
          </div>

          {/* Address */}
          <div style={{ flex: 1 }}>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                useWindows.getState().open("player-profile", { address: r.player });
              }}
              style={{
                background: isMe ? "#fff3e0" : "#e3f2fd",
                color: isMe ? "#e65100" : "#1565c0",
                border: "none",
                borderRadius: 10,
                padding: "1px 7px",
                fontSize: 10,
                fontFamily: "monospace",
                cursor: "pointer",
              }}
            >
              {isMe ? "YOU" : `${r.player.slice(0, 5)}…${r.player.slice(-4)}`}
            </button>
          </div>

          {/* Score */}
          <span style={{ fontWeight: "bold", minWidth: 36, textAlign: "right" }}>{r.score}</span>

          {/* Rank change */}
          <span style={{
            fontSize: 9, width: 16, textAlign: "center",
            color: change === "up" ? "#2e7d32" : change === "down" ? "#c62828" : "#aaa",
          }}>
            {change === "up" ? "▲" : change === "down" ? "▼" : "–"}
          </span>
        </div>
      );
    })}
  </div>
  ```

  Also remove the old `<table>`, `<thead>`, and related prize-claim/claimable sections if they were inside the table — they should remain outside it.

- [ ] **Step 2: Add shimmer keyframe to globals.css**

  Append:

  ```css
  @keyframes shimmer {
    0%   { background-color: #e0e0e0; }
    50%  { background-color: #f0f0f0; }
    100% { background-color: #e0e0e0; }
  }
  ```

- [ ] **Step 3: TypeScript check**

  ```bash
  cd frontend && npx tsc --noEmit
  ```

- [ ] **Step 4: Verify**

  Open leaderboard — gold/silver/bronze rank badges, your row highlighted amber, rank change arrows. Loading state shows shimmer rows.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/components/windows/LeaderboardWindow.tsx frontend/app/globals.css
  git commit -m "feat(leaderboard): rank badges, YOU highlight, rank change arrows"
  ```

---

### Task 20: My NFTs — XP terminal card grid

**Files:**
- Modify: `frontend/components/windows/MyNftsWindow.tsx`

- [ ] **Step 1: Replace the grid with XP-terminal cards**

  Find the grid render block:

  ```tsx
  {nfts && nfts.length > 0 && (
    <div className="grid grid-cols-4 gap-2">
      {nfts.map((n) => (
        <div
          key={n.id}
          className="text-center text-xs border border-gray-300 p-1"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={n.image} alt={n.name} className="w-full h-auto" />
          <div className="mt-1 truncate">{n.name}</div>
          {n.rarity && (
            <div
              className="text-[9px] font-bold mt-0.5"
              style={{ color: rarityColor(n.rarity) }}
            >
              {n.rarity}
            </div>
          )}
        </div>
      ))}
    </div>
  )}
  ```

  Replace with:

  ```tsx
  {nfts && nfts.length > 0 && (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 8 }}>
      {nfts.map((n) => (
        <div
          key={n.id}
          style={{
            background: "#000",
            border: "1px solid #1a3a1a",
            borderRadius: 4,
            padding: 6,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            fontFamily: "monospace",
          }}
        >
          {/* Score value */}
          <div style={{ color: "#0f0", fontWeight: "bold", fontSize: 14 }}>
            {n.attributes?.find((a: {trait_type: string}) => a.trait_type === "Score")?.value ?? "?"}
          </div>
          <div style={{ color: "#555", fontSize: 8 }}>SCORE</div>
          {n.rarity && (
            <div style={{ color: rarityColor(n.rarity), fontSize: 8, fontWeight: "bold" }}>
              {n.rarity}
            </div>
          )}
          <div style={{ color: "#333", fontSize: 8 }}>#{n.id}</div>
        </div>
      ))}
    </div>
  )}
  ```

  Also update the loading state from `<p className="text-sm">Loading…</p>` to a skeleton grid:

  ```tsx
  {address && nfts === null && !error && (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 8 }}>
      {[0,1,2,3].map((i) => (
        <div
          key={i}
          style={{
            height: 72, background: "#111", border: "1px solid #1a3a1a", borderRadius: 4,
            animation: "shimmer 1.2s linear infinite",
          }}
        />
      ))}
    </div>
  )}
  ```

  Delete the old `{address && nfts === null && !error && <p className="text-sm">Loading…</p>}` line.

- [ ] **Step 2: Use correct attribute lookup**

  `ScoreNft` in `frontend/lib/holdings.ts` already has `attributes?: Array<{ trait_type: string; value: string }>`. The score value can be read with:

  ```ts
  n.attributes?.find((a) => a.trait_type === "Score")?.value ?? "?"
  ```

  No type change needed.

- [ ] **Step 3: TypeScript check**

  ```bash
  cd frontend && npx tsc --noEmit
  ```

- [ ] **Step 4: Verify**

  Connect a wallet with minted NFTs — dark terminal-style cards with score value in green monospace. Loading shows shimmer skeleton.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/components/windows/MyNftsWindow.tsx
  git commit -m "feat(my-nfts): XP terminal card grid"
  ```

---

## Phase 7 — Final Checks

### Task 21: Full verification

- [ ] **Step 1: TypeScript**

  ```bash
  cd frontend && npx tsc --noEmit
  ```

  Expected: 0 errors.

- [ ] **Step 2: Tests**

  ```bash
  cd frontend && npm test
  ```

  Expected: 6 passing, 0 failing.

- [ ] **Step 3: Build**

  ```bash
  cd frontend && npm run build
  ```

  Expected: exits 0, no build errors.

- [ ] **Step 4: Manual smoke test** (from HANDOFF.md checklist)

  - Hard refresh → boot screen with animated bar → desktop
  - Open Snake window → dark bg + dot grid + gradient snake
  - Eat food → glow circles, +1 popup, speed bar grows
  - Die → red flash → overlay → press key → MintDialog slides up
  - Connect wallet → chip in taskbar, balloon not shown
  - Disconnect → clear sessionStorage → reload → balloon after 3s
  - Open leaderboard → badges, rank changes, shimmer while loading
  - My NFTs → card grid (if NFTs exist)
  - Drag window → can't drag titlebar off screen

- [ ] **Step 5: Final commit**

  ```bash
  git add -p  # stage any remaining changes
  git commit -m "chore: ui-ux polish complete — all phases"
  ```
