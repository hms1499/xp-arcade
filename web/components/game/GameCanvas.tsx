"use client";
import { useEffect, useRef, useState } from "react";
import { createGame, type Direction, type Game } from "@/lib/snake-engine";

const CELL = 16;
const GRID = 20;
const TICK_MS = 120;

export function GameCanvas({ onGameOver }: { onGameOver: (score: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    gameRef.current = createGame({ gridSize: GRID, seed: Date.now() });

    const onKey = (e: KeyboardEvent) => {
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
        gameRef.current?.turn(d);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);

    let last = 0;
    let raf = 0;
    let stopped = false;

    const loop = (t: number) => {
      if (stopped) return;
      if (t - last >= TICK_MS) {
        gameRef.current!.tick();
        last = t;
        const s = gameRef.current!.state;
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
        }
        setScore(s.score);
        if (s.gameOver) {
          stopped = true;
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
    };
  }, [onGameOver]);

  return (
    <div>
      <div className="text-xs mb-1 font-bold">Score: {score}</div>
      <canvas
        ref={canvasRef}
        width={GRID * CELL}
        height={GRID * CELL}
        style={{ imageRendering: "pixelated", border: "1px solid #444" }}
      />
      <div className="text-[10px] mt-1 text-gray-600">
        Arrows / WASD to move
      </div>
    </div>
  );
}
