"use client";
import { useEffect, useRef, useCallback, useState } from "react";
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

const DPAD_BTN: React.CSSProperties = {
  width: 48,
  height: 48,
  fontSize: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "default",
  userSelect: "none",
  WebkitUserSelect: "none",
};

function drawMaze(ctx: CanvasRenderingContext2D, maze: number[][], pelletPulse: number) {
  // pelletPulse in [0, 1] — sin-driven radius modulation for power pellets only.
  const pelletRadius = 4.5 + pelletPulse * 2;
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
          ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, pelletRadius, 0, Math.PI * 2);
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
  ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
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

function drawPauseOverlay(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffff00";
  ctx.font = "bold 18px monospace";
  ctx.textAlign = "center";
  ctx.fillText("PAUSED", w / 2, h / 2);
  ctx.fillStyle = "#aaa";
  ctx.font = "11px monospace";
  ctx.fillText("Press Esc to resume", w / 2, h / 2 + 22);
  ctx.textAlign = "left";
}

export function PacManCanvas({
  onGameOver,
  onScoreChange,
  windowActive = true,
}: {
  onGameOver: (score: number) => void;
  onScoreChange: (score: number) => void;
  windowActive?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<PacManState>(createPacManState());
  const dirBufferRef = useRef<Direction>("left");
  const mouthRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastTickRef = useRef(0);
  const gameOverCalledRef = useRef(false);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [lives, setLives] = useState<number>(stateRef.current.lives);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const setPausedBoth = useCallback((v: boolean) => {
    pausedRef.current = v;
    setPaused(v);
  }, []);

  useEffect(() => {
    if (!windowActive && !stateRef.current.gameOver && !stateRef.current.won) {
      setPausedBoth(true);
    }
  }, [windowActive, setPausedBoth]);

  const loop = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const TICK_MS = 100;
    const s = stateRef.current;

    if (!pausedRef.current && timestamp - lastTickRef.current >= TICK_MS) {
      lastTickRef.current = timestamp;
      if (!s.gameOver && !s.won) {
        let next = movePacMan(s, dirBufferRef.current);
        next = tickGhosts(next);
        stateRef.current = next;
        onScoreChange(next.score);
        if (next.lives !== s.lives) setLives(next.lives);
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
    // Pulse oscillates ~0.7Hz so pellets clearly draw the eye.
    const pulse = (Math.sin(timestamp / 220) + 1) / 2;
    drawMaze(ctx, cur.maze, pulse);

    if (!pausedRef.current) {
      mouthRef.current = (mouthRef.current + 0.15) % (Math.PI / 3);
    }
    drawPacMan(ctx, cur.pacman.row, cur.pacman.col, mouthRef.current);

    cur.ghosts.forEach((g, i) => {
      drawGhost(ctx, g.row, g.col, GHOST_COLORS[i], g.frightTimer);
    });

    const maxFright = Math.max(0, ...cur.ghosts.map((g) => g.frightTimer));
    if (maxFright > 0) {
      // Ratio of FRIGHT_TICKS (180 in engine). Hard-coded ratio rather than
      // importing the constant — engine change would just under/over-fill the
      // bar without breaking the game.
      const ratio = Math.min(1, maxFright / 180);
      const barW = canvas.width - 8;
      const fillW = Math.floor(barW * ratio);
      ctx.fillStyle = "#222";
      ctx.fillRect(4, 4, barW, 4);
      ctx.fillStyle = ratio > 0.3 ? "#4af" : "#f80";
      ctx.fillRect(4, 4, fillW, 4);
    }

    if (pausedRef.current) {
      drawPauseOverlay(ctx, canvas.width, canvas.height);
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [onGameOver, onScoreChange]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      const s = stateRef.current;
      if (!s.gameOver && !s.won) {
        setPausedBoth(!pausedRef.current);
        e.preventDefault();
      }
      return;
    }
    const MAP: Record<string, Direction> = {
      ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
      w: "up", s: "down", a: "left", d: "right",
    };
    if (MAP[e.key]) {
      e.preventDefault();
      if (!pausedRef.current) dirBufferRef.current = MAP[e.key];
    }
  }, [setPausedBoth]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    const onHide = () => {
      if (document.hidden) setPausedBoth(true);
    };
    const onBlur = () => setPausedBoth(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", onBlur);
    };
  }, [handleKey, setPausedBoth]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div
        style={{
          width: MAZE_COLS * TILE_SIZE,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#222",
          border: "2px inset #888",
          padding: "3px 8px",
          color: "#fff",
          fontFamily: "monospace",
          fontSize: 11,
        }}
      >
        <span style={{ color: "#aaa", textTransform: "uppercase", letterSpacing: 1, fontSize: 9 }}>
          Lives
        </span>
        <span style={{ color: "#ff5050", fontSize: 14, letterSpacing: 2 }}>
          {Array.from({ length: Math.max(0, lives) }).map((_, i) => (
            <span key={i}>♥</span>
          ))}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={MAZE_COLS * TILE_SIZE}
        height={MAZE_ROWS * TILE_SIZE}
        style={{ display: "block", imageRendering: "pixelated" }}
      />
      {isTouch ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "48px 48px 48px",
            gridTemplateRows: "48px 48px",
            gap: 2,
            marginTop: 4,
            justifyContent: "center",
          }}
        >
          <div />
          <button
            style={DPAD_BTN}
            onTouchStart={(e) => { e.preventDefault(); if (!pausedRef.current) dirBufferRef.current = "up"; }}
            onMouseDown={(e) => { e.preventDefault(); if (!pausedRef.current) dirBufferRef.current = "up"; }}
          >▲</button>
          <button
            style={DPAD_BTN}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              const s = stateRef.current;
              if (!s.gameOver && !s.won) setPausedBoth(!paused);
            }}
            title={paused ? "Resume" : "Pause"}
          >{paused ? "▶" : "⏸"}</button>
          <button
            style={DPAD_BTN}
            onTouchStart={(e) => { e.preventDefault(); if (!pausedRef.current) dirBufferRef.current = "left"; }}
            onMouseDown={(e) => { e.preventDefault(); if (!pausedRef.current) dirBufferRef.current = "left"; }}
          >◀</button>
          <button
            style={DPAD_BTN}
            onTouchStart={(e) => { e.preventDefault(); if (!pausedRef.current) dirBufferRef.current = "down"; }}
            onMouseDown={(e) => { e.preventDefault(); if (!pausedRef.current) dirBufferRef.current = "down"; }}
          >▼</button>
          <button
            style={DPAD_BTN}
            onTouchStart={(e) => { e.preventDefault(); if (!pausedRef.current) dirBufferRef.current = "right"; }}
            onMouseDown={(e) => { e.preventDefault(); if (!pausedRef.current) dirBufferRef.current = "right"; }}
          >▶</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 10, color: "#555" }}>
          <span>Arrows / WASD to move</span>
          <span>·</span>
          <span>Esc to pause</span>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              const s = stateRef.current;
              if (!s.gameOver && !s.won) setPausedBoth(!paused);
            }}
            style={{ fontSize: 10, height: 20, marginLeft: 4 }}
          >
            {paused ? "▶ Resume" : "⏸ Pause"}
          </button>
        </div>
      )}
    </div>
  );
}
