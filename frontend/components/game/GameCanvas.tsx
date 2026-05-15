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

function tickMs(score: number) {
  // Shave 4ms per point, floor at MIN_TICK_MS (~50ms ≈ 20fps)
  return Math.max(MIN_TICK_MS, BASE_TICK_MS - score * 4);
}

export function GameCanvas({ onGameOver }: { onGameOver: (score: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const pausedRef = useRef(false);
  const flashUntilRef = useRef(0);
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
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, GRID * CELL, GRID * CELL);
          s.snake.forEach((c, i) => {
            ctx.fillStyle = i === 0 ? "#7fff7f" : "#0f0";
            ctx.fillRect(c.x * CELL, c.y * CELL, CELL - 1, CELL - 1);
          });
          ctx.fillStyle = "#f80";
          ctx.fillRect(s.food.x * CELL, s.food.y * CELL, CELL - 1, CELL - 1);
          const remaining = flashUntilRef.current - t;
          if (remaining > 0) {
            // Subtle green pulse that fades over FLASH_MS.
            ctx.fillStyle = `rgba(160,255,160,${(remaining / FLASH_MS) * 0.22})`;
            ctx.fillRect(0, 0, GRID * CELL, GRID * CELL);
          }
        }
        setScore(s.score);
        if (s.score > prevScore) playEat();
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
        <span style={{ color: tickMs(score) <= 60 ? "#ff4444" : tickMs(score) <= 90 ? "#ffaa00" : "#888" }}>
          {tickMs(score) <= 60 ? "⚡ MAX SPEED" : tickMs(score) <= 90 ? "🔥 FAST" : ""}
        </span>
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
