"use client";
import { useEffect, useRef, useCallback } from "react";
import {
  createPacManState,
  movePacMan,
  tickGhosts,
  type Direction,
  type PacManState,
} from "./PacManEngine";
import { MAZE_ROWS, MAZE_COLS, TILE_SIZE } from "./maze";

const GHOST_COLORS = ["#ff0000", "#ffb8ff", "#00ffff", "#ffb852"];
const FRIGHT_COLOR = "#0000cc";
const WALL_COLOR   = "#00008b";
const DOT_COLOR    = "#ffb8ae";
const PACMAN_COLOR = "#ffff00";

function drawMaze(ctx: CanvasRenderingContext2D, maze: number[][]) {
  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < MAZE_COLS; c++) {
      const cell = maze[r][c];
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      if (cell === 0) {
        ctx.fillStyle = WALL_COLOR;
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      } else {
        ctx.fillStyle = "#000";
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        if (cell === 1) {
          ctx.fillStyle = DOT_COLOR;
          ctx.beginPath();
          ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (cell === 2) {
          ctx.fillStyle = DOT_COLOR;
          ctx.beginPath();
          ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

function drawPacMan(
  ctx: CanvasRenderingContext2D,
  row: number,
  col: number,
  mouthAngle: number,
) {
  const x = col * TILE_SIZE + TILE_SIZE / 2;
  const y = row * TILE_SIZE + TILE_SIZE / 2;
  const r = TILE_SIZE / 2 - 2;
  ctx.fillStyle = PACMAN_COLOR;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, r, mouthAngle, Math.PI * 2 - mouthAngle);
  ctx.closePath();
  ctx.fill();
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  row: number,
  col: number,
  color: string,
  frightTimer: number,
) {
  const x = col * TILE_SIZE + 1;
  const y = row * TILE_SIZE + 1;
  const w = TILE_SIZE - 2;
  const h = TILE_SIZE - 2;
  ctx.fillStyle = frightTimer > 0 ? FRIGHT_COLOR : color;
  ctx.beginPath();
  // Rounded top
  ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
  // Right side down
  ctx.lineTo(x + w, y + h);
  // Wavy bottom (3 bumps)
  const bumpW = w / 3;
  for (let i = 2; i >= 0; i--) {
    ctx.quadraticCurveTo(
      x + bumpW * i + bumpW * 0.75, y + h - 5,
      x + bumpW * i + bumpW / 2,    y + h,
    );
    ctx.quadraticCurveTo(
      x + bumpW * i + bumpW * 0.25, y + h - 5,
      x + bumpW * i,                y + h,
    );
  }
  ctx.closePath();
  ctx.fill();
}

export function PacManCanvas({
  onGameOver,
  onScoreChange,
}: {
  onGameOver: (score: number) => void;
  onScoreChange: (score: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<PacManState>(createPacManState());
  const dirBufferRef = useRef<Direction>("left");
  const mouthRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastTickRef = useRef(0);
  const gameOverCalledRef = useRef(false);

  const loop = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const TICK_MS = 100;
    if (timestamp - lastTickRef.current >= TICK_MS) {
      lastTickRef.current = timestamp;
      const s = stateRef.current;
      if (!s.gameOver && !s.won) {
        let next = movePacMan(s, dirBufferRef.current);
        next = tickGhosts(next);
        stateRef.current = next;
        onScoreChange(next.score);
        if ((next.gameOver || next.won) && !gameOverCalledRef.current) {
          gameOverCalledRef.current = true;
          onGameOver(next.score);
          return;
        }
      }
    }

    const cur = stateRef.current;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawMaze(ctx, cur.maze);

    mouthRef.current = (mouthRef.current + 0.15) % (Math.PI / 3);
    drawPacMan(ctx, cur.pacman.row, cur.pacman.col, mouthRef.current);

    cur.ghosts.forEach((g, i) => {
      drawGhost(ctx, g.row, g.col, GHOST_COLORS[i], g.frightTimer);
    });

    // Lives HUD
    ctx.fillStyle = "#ff0";
    ctx.font = "bold 12px monospace";
    ctx.fillText(`♥ ${cur.lives}`, 4, 14);

    rafRef.current = requestAnimationFrame(loop);
  }, [onGameOver, onScoreChange]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    const MAP: Record<string, Direction> = {
      ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
      w: "up", s: "down", a: "left", d: "right",
    };
    if (MAP[e.key]) {
      e.preventDefault();
      dirBufferRef.current = MAP[e.key];
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  return (
    <canvas
      ref={canvasRef}
      width={MAZE_COLS * TILE_SIZE}
      height={MAZE_ROWS * TILE_SIZE}
      style={{ display: "block", imageRendering: "pixelated" }}
    />
  );
}
