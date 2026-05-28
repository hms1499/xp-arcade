"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BALL_RADIUS,
  BREAKOUT_HEIGHT,
  BREAKOUT_WIDTH,
  BRICK_HEIGHT,
  PADDLE_HEIGHT,
  PADDLE_WIDTH,
  createBreakoutState,
  tickBreakout,
  type BreakoutBrickKind,
  type BreakoutState,
} from "./BreakoutEngine";

const BRICK_FILL: Record<BreakoutBrickKind, string> = {
  normal: "#22c55e",
  strong: "#2563eb",
  gold: "#f59e0b",
};

const BRICK_STROKE: Record<BreakoutBrickKind, string> = {
  normal: "#bbf7d0",
  strong: "#bfdbfe",
  gold: "#fde68a",
};

function drawScene(
  ctx: CanvasRenderingContext2D,
  state: BreakoutState,
  paused: boolean,
) {
  ctx.fillStyle = "#080808";
  ctx.fillRect(0, 0, BREAKOUT_WIDTH, BREAKOUT_HEIGHT);

  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, BREAKOUT_WIDTH, 32);
  ctx.fillStyle = "#d1d5db";
  ctx.font = "11px monospace";
  ctx.fillText(`LV ${state.level}`, 10, 20);
  ctx.fillText(`LIVES ${state.lives}`, 78, 20);
  ctx.fillText(`COMBO ${state.combo}`, 176, 20);

  for (const brick of state.bricks) {
    ctx.fillStyle = BRICK_FILL[brick.kind];
    ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
    ctx.strokeStyle = BRICK_STROKE[brick.kind];
    ctx.strokeRect(brick.x + 0.5, brick.y + 0.5, brick.width - 1, brick.height - 1);
    if (brick.maxHp > 1) {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(brick.x + 4, brick.y + BRICK_HEIGHT - 5, (brick.width - 8) * (brick.hp / brick.maxHp), 2);
    }
  }

  const paddleY = BREAKOUT_HEIGHT - 34;
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(state.paddleX, paddleY, PADDLE_WIDTH, PADDLE_HEIGHT);
  ctx.fillStyle = "#60a5fa";
  ctx.fillRect(state.paddleX + 4, paddleY + 2, PADDLE_WIDTH - 8, 3);

  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  if (state.status === "ready" || state.status === "lost-life" || state.status === "won") {
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(0, 0, BREAKOUT_WIDTH, BREAKOUT_HEIGHT);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "bold 18px monospace";
    const title =
      state.status === "won"
        ? "LEVEL CLEARED"
        : state.status === "lost-life"
        ? "BALL LOST"
        : "XP BRICKS";
    ctx.fillText(title, BREAKOUT_WIDTH / 2, BREAKOUT_HEIGHT / 2 - 10);
    ctx.font = "11px monospace";
    ctx.fillStyle = "#d1d5db";
    ctx.fillText("Press Space or tap Launch", BREAKOUT_WIDTH / 2, BREAKOUT_HEIGHT / 2 + 14);
    ctx.textAlign = "left";
  }

  if (paused) {
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(0, 0, BREAKOUT_WIDTH, BREAKOUT_HEIGHT);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "bold 18px monospace";
    ctx.fillText("PAUSED", BREAKOUT_WIDTH / 2, BREAKOUT_HEIGHT / 2);
    ctx.font = "11px monospace";
    ctx.fillStyle = "#d1d5db";
    ctx.fillText("Esc to resume", BREAKOUT_WIDTH / 2, BREAKOUT_HEIGHT / 2 + 24);
    ctx.textAlign = "left";
  }
}

export function BreakoutCanvas({
  onGameOver,
  onScoreChange,
  windowActive = true,
}: {
  onGameOver: (score: number) => void;
  onScoreChange: (score: number) => void;
  windowActive?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderState, setRenderState] = useState(() => createBreakoutState());
  const stateRef = useRef<BreakoutState>(renderState);
  const inputRef = useRef<{ move: -1 | 0 | 1; launch: boolean; paddleTargetX?: number }>({
    move: 0,
    launch: false,
  });
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const gameOverCalledRef = useRef(false);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [isTouch] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
  );

  const setPausedBoth = useCallback((v: boolean) => {
    pausedRef.current = v;
    setPaused(v);
  }, []);

  useEffect(() => {
    if (!windowActive && stateRef.current.status !== "game-over") {
      setPausedBoth(true);
    }
  }, [windowActive, setPausedBoth]);

  useEffect(() => {
    function loop(timestamp: number) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      const delta = lastRef.current ? timestamp - lastRef.current : 16;
      lastRef.current = timestamp;

      if (!pausedRef.current) {
        const current = stateRef.current;
        const next = tickBreakout(current, inputRef.current, delta);
        inputRef.current.launch = false;
        stateRef.current = next;
        if (next !== current) {
          onScoreChange(next.score);
          setRenderState(next);
        }
        if (next.status === "game-over" && !gameOverCalledRef.current) {
          gameOverCalledRef.current = true;
          setTimeout(() => onGameOver(next.score), 250);
        }
      }

      drawScene(ctx, stateRef.current, pausedRef.current);
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [onGameOver, onScoreChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (stateRef.current.status !== "game-over") setPausedBoth(!pausedRef.current);
      return;
    }
    if (pausedRef.current) return;
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
      e.preventDefault();
      inputRef.current.move = -1;
    } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
      e.preventDefault();
      inputRef.current.move = 1;
    } else if (e.key === " ") {
      e.preventDefault();
      inputRef.current.launch = true;
    }
  }, [setPausedBoth]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (
      ((e.key === "ArrowLeft" || e.key === "a" || e.key === "A") && inputRef.current.move === -1) ||
      ((e.key === "ArrowRight" || e.key === "d" || e.key === "D") && inputRef.current.move === 1)
    ) {
      inputRef.current.move = 0;
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    const onBlur = () => setPausedBoth(true);
    const onHide = () => {
      if (document.hidden) setPausedBoth(true);
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [handleKeyDown, handleKeyUp, setPausedBoth]);

  const setTouchTarget = (clientX: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    inputRef.current.paddleTargetX = ((clientX - rect.left) / rect.width) * BREAKOUT_WIDTH;
  };

  return (
    <div style={{ display: "flex", gap: 8, userSelect: "none", alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <canvas
          ref={canvasRef}
          width={BREAKOUT_WIDTH}
          height={BREAKOUT_HEIGHT}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setTouchTarget(e.clientX);
            inputRef.current.launch = true;
          }}
          onPointerMove={(e) => setTouchTarget(e.clientX)}
          onPointerUp={() => {
            inputRef.current.paddleTargetX = undefined;
          }}
          style={{
            display: "block",
            imageRendering: "pixelated",
            border: "2px inset #888",
            touchAction: "none",
          }}
        />
        {isTouch ? (
          <div style={{ display: "grid", gridTemplateColumns: "72px 72px 72px", gap: 4 }}>
            <button
              onTouchStart={(e) => { e.preventDefault(); inputRef.current.move = -1; }}
              onTouchEnd={() => { inputRef.current.move = 0; }}
              onMouseDown={() => { inputRef.current.move = -1; }}
              onMouseUp={() => { inputRef.current.move = 0; }}
              style={{ height: 34 }}
            >
              ◀
            </button>
            <button
              onClick={() => { inputRef.current.launch = true; }}
              style={{ height: 34 }}
            >
              Launch
            </button>
            <button
              onTouchStart={(e) => { e.preventDefault(); inputRef.current.move = 1; }}
              onTouchEnd={() => { inputRef.current.move = 0; }}
              onMouseDown={() => { inputRef.current.move = 1; }}
              onMouseUp={() => { inputRef.current.move = 0; }}
              style={{ height: 34 }}
            >
              ▶
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 10, color: "#555" }}>
            <span>← → / A D move</span>
            <span>·</span>
            <span>Space launch</span>
            <span>·</span>
            <span>Esc pause</span>
          </div>
        )}
      </div>
      <div
        style={{
          width: 150,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
          fontSize: 11,
        }}
      >
        <div style={{ background: "#222", border: "2px inset #888", color: "#fff", padding: 8 }}>
          <div style={{ color: "#aaa", fontSize: 10, textTransform: "uppercase" }}>Score</div>
          <div style={{ fontSize: 22, fontWeight: "bold" }}>{renderState.score}</div>
        </div>
        <div style={{ background: "#222", border: "2px inset #888", color: "#fff", padding: 8, display: "grid", gap: 6 }}>
          <div>Level: <b>{renderState.level}</b></div>
          <div>Lives: <b>{renderState.lives}</b></div>
          <div>Bricks: <b>{renderState.bricks.length}</b></div>
          <div>Best combo: <b>{renderState.stats.maxCombo}</b></div>
        </div>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setPausedBoth(!paused)}
          disabled={renderState.status === "game-over"}
          style={{ height: 24, fontSize: 11 }}
        >
          {paused ? "▶ Resume" : "⏸ Pause"}
        </button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => { inputRef.current.launch = true; }}
          disabled={paused || renderState.status === "playing" || renderState.status === "game-over"}
          style={{ height: 24, fontSize: 11 }}
        >
          Launch
        </button>
      </div>
    </div>
  );
}
