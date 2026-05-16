"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createGame, type Direction, type Game } from "@/lib/snake-engine";
import { TouchControls } from "./TouchControls";
import { playEat, playDead, playStart } from "@/lib/sounds";

const CELL = 16;
const GRID = 20;
const BASE_TICK_MS = 120;
const MIN_TICK_MS = 50;
const FLASH_MS = 140;

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

function tickMs(score: number) {
  // Shave 4ms per point, floor at MIN_TICK_MS (~50ms ≈ 20fps)
  return Math.max(MIN_TICK_MS, BASE_TICK_MS - score * 4);
}

export function GameCanvas({ onGameOver }: { onGameOver: (score: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const pausedRef = useRef(false);
  const flashUntilRef = useRef(0);
  const foodPulseRef = useRef(0);
  const foodGlowRef  = useRef(6);
  const popupsRef = useRef<{ x: number; y: number; born: number }[]>([]);
  const [score, setScore] = useState(0);
  const [paused, setPaused] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  // Stable so the game-loop effect doesn't re-run when it changes.
  const setPausedBoth = useCallback((v: boolean) => {
    pausedRef.current = v;
    setPaused(v);
  }, []);

  function handleDir(d: Direction) {
    if (!pausedRef.current) gameRef.current?.turn(d);
  }

  useEffect(() => {
    gameRef.current = createGame({ gridSize: GRID, seed: Date.now() });
    playStart();

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

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let last = 0;
    let raf = 0;
    let stopped = false;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!stopped) setPausedBoth(!pausedRef.current);
        return;
      }
      const map: Record<string, Direction> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        w: "up",
        s: "down",
        a: "left",
        d: "right",
      };
      const d = map[e.key];
      if (d) {
        if (!pausedRef.current) gameRef.current?.turn(d);
        e.preventDefault();
      }
    };
    // Auto-pause when the player leaves the tab/window; they resume manually
    // so the snake never moves while they aren't looking.
    const onHide = () => {
      if (!stopped && document.hidden) setPausedBoth(true);
    };
    const onBlur = () => {
      if (!stopped) setPausedBoth(true);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", onBlur);

    const loop = (t: number) => {
      if (stopped) return;
      if (pausedRef.current) {
        last = t; // keep timing fresh so resume doesn't fast-forward a tick
        raf = requestAnimationFrame(loop);
        return;
      }
      if (t - last >= tickMs(gameRef.current!.state.score)) {
        const prevScore = gameRef.current!.state.score;
        gameRef.current!.tick();
        last = t;
        const s = gameRef.current!.state;
        if (s.score > prevScore && !reduceMotion) {
          flashUntilRef.current = t + FLASH_MS;
        }
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#050f05";
          ctx.fillRect(0, 0, GRID * CELL, GRID * CELL);
          if (gridCanvasRef.current) {
            ctx.drawImage(gridCanvasRef.current, 0, 0);
          }
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
          if (!reduceMotion) {
            if (t - foodPulseRef.current >= 600) {
              foodGlowRef.current = foodGlowRef.current === 6 ? 12 : 6;
              foodPulseRef.current = t;
            }
          }
          ctx.fillStyle = "#ff8800";
          ctx.shadowBlur   = reduceMotion ? 0 : foodGlowRef.current;
          ctx.shadowColor  = "#ff8800";
          const fx = s.food.x * CELL + (CELL - 1) / 2;
          const fy = s.food.y * CELL + (CELL - 1) / 2;
          const fr = (CELL - 1) / 2 - 1;
          ctx.beginPath();
          ctx.arc(fx, fy, fr, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          const remaining = flashUntilRef.current - t;
          if (remaining > 0) {
            // Subtle green pulse that fades over FLASH_MS.
            ctx.fillStyle = `rgba(160,255,160,${(remaining / FLASH_MS) * 0.22})`;
            ctx.fillRect(0, 0, GRID * CELL, GRID * CELL);
          }
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
        }
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
        if (s.gameOver) {
          stopped = true;
          playDead();
          onGameOver(s.score);
          return;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", onBlur);
    };
  }, [onGameOver, setPausedBoth]);

  return (
    <div>
      <div className="text-xs mb-1 font-bold flex justify-between">
        <span>Score: {score}</span>
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
      </div>
      <div style={{ position: "relative", width: GRID * CELL, height: GRID * CELL }}>
        <canvas
          ref={canvasRef}
          width={GRID * CELL}
          height={GRID * CELL}
          style={{ imageRendering: "pixelated", border: "1px solid #444", display: "block" }}
        />
        {paused && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              background: "rgba(0,0,0,0.55)",
              color: "#ffffff",
              fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: "bold", letterSpacing: 2 }}>
              ⏸ PAUSED
            </div>
            <button onClick={() => setPausedBoth(false)} style={{ fontSize: 11 }}>
              Resume (Esc)
            </button>
          </div>
        )}
      </div>
      {isTouch ? (
        <TouchControls onDir={handleDir} />
      ) : (
        <div className="text-[10px] mt-1 text-gray-600">
          Arrows / WASD to move · Esc to pause
        </div>
      )}
    </div>
  );
}
