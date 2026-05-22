"use client";
import { useEffect, useRef, useCallback, useReducer, useState } from "react";
import {
  createTetrisState,
  moveLeft,
  moveRight,
  rotate,
  tick,
  hardDrop,
  moveDown,
  ghostY,
  TETROMINO_COLOR,
  TETROMINOES,
  type TetrisState,
} from "./TetrisEngine";
import { TetrisTouchControls, type TetrisAction } from "./TetrisTouchControls";

const COLORS = [
  "transparent",
  "#00f0f0",
  "#f0f000",
  "#a000f0",
  "#00f000",
  "#f00000",
  "#0000f0",
  "#f0a000",
];

const GHOST_COLORS = COLORS.map((c) =>
  c === "transparent" ? "transparent" : c + "55"
);

const BOARD_W = 10;
const BOARD_H = 20;
const CELL_SIZE = 24;
const NEXT_CELL = 20;

function getOverlay(state: TetrisState): number[][] {
  const overlay = state.board.map((row) => [...row]);
  const gy = ghostY(state);
  const gMask = TETROMINOES[state.current.type][state.current.rotation];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (!gMask[r][c]) continue;
      const row = gy + r;
      const col = state.current.x + c;
      if (row >= 0 && row < BOARD_H && col >= 0 && col < BOARD_W) {
        if (overlay[row][col] === 0) overlay[row][col] = -1;
      }
    }
  }
  const mask = TETROMINOES[state.current.type][state.current.rotation];
  const color = TETROMINO_COLOR[state.current.type];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (!mask[r][c]) continue;
      const row = state.current.y + r;
      const col = state.current.x + c;
      if (row >= 0 && row < BOARD_H && col >= 0 && col < BOARD_W) {
        overlay[row][col] = color;
      }
    }
  }
  return overlay;
}

export function TetrisCanvas({
  onGameOver,
  onScoreChange,
  windowActive = true,
}: {
  onGameOver: (score: number) => void;
  onScoreChange: (score: number) => void;
  windowActive?: boolean;
}) {
  const stateRef = useRef<TetrisState>(createTetrisState());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const setPausedBoth = useCallback((v: boolean) => {
    pausedRef.current = v;
    setPaused(v);
  }, []);

  function setState(next: TetrisState) {
    stateRef.current = next;
    onScoreChange(next.score);
    forceUpdate();
    if (next.gameOver) {
      if (tickRef.current) clearInterval(tickRef.current);
      onGameOver(next.score);
    }
  }

  function startTick(level: number) {
    if (tickRef.current) clearInterval(tickRef.current);
    const ms = Math.max(100, 800 - (level - 1) * 70);
    tickRef.current = setInterval(() => {
      if (!pausedRef.current) setState(tick(stateRef.current));
    }, ms);
  }

  useEffect(() => {
    startTick(stateRef.current.level);
    // Auto-pause on tab/window blur AND when this XP window loses focus to
    // another XP window (see windowActive effect below).
    const onBlur = () => setPausedBoth(true);
    const onHide = () => {
      if (document.hidden) setPausedBoth(true);
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onHide);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!windowActive && !stateRef.current.gameOver) {
      setPausedBoth(true);
    }
  }, [windowActive, setPausedBoth]);

  const prevLevel = useRef(1);
  const s = stateRef.current;
  if (s.level !== prevLevel.current) {
    prevLevel.current = s.level;
    startTick(s.level);
  }

  const handleKey = useCallback((e: KeyboardEvent) => {
    const cur = stateRef.current;
    if (cur.gameOver) return;

    if (e.key === "Escape") {
      e.preventDefault();
      setPausedBoth(!pausedRef.current);
      return;
    }

    if (pausedRef.current) return;

    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        setState(moveLeft(cur));
        break;
      case "ArrowRight":
        e.preventDefault();
        setState(moveRight(cur));
        break;
      case "ArrowDown":
        e.preventDefault();
        setState(moveDown(cur));
        break;
      case "ArrowUp":
      case "z":
      case "Z":
        e.preventDefault();
        setState(rotate(cur));
        break;
      case " ":
        e.preventDefault();
        setState(hardDrop(cur));
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPausedBoth]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const handleAction = useCallback((a: TetrisAction) => {
    const cur = stateRef.current;
    if (cur.gameOver || pausedRef.current) return;
    switch (a) {
      case "left":   setState(moveLeft(cur)); break;
      case "right":  setState(moveRight(cur)); break;
      case "rotate": setState(rotate(cur)); break;
      case "soft":   setState(moveDown(cur)); break;
      case "hard":   setState(hardDrop(cur)); break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlay = getOverlay(s);
  const nextMask = TETROMINOES[s.next][0];
  const nextColor = TETROMINO_COLOR[s.next];
  const boardPx = BOARD_H * CELL_SIZE;

  return (
    <div style={{ display: "flex", gap: 8, userSelect: "none", alignItems: "flex-start" }}>
      {/* Main board column */}
      <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${BOARD_W}, ${CELL_SIZE}px)`,
            gridTemplateRows: `repeat(${BOARD_H}, ${CELL_SIZE}px)`,
            border: "2px inset #888",
            background: "#111",
          }}
        >
          {overlay.flat().map((cell, i) => (
            <div
              key={i}
              style={{
                width: CELL_SIZE,
                height: CELL_SIZE,
                background:
                  cell === -1
                    ? GHOST_COLORS[TETROMINO_COLOR[s.current.type]]
                    : COLORS[cell] ?? "transparent",
                boxSizing: "border-box",
                border: cell !== 0 ? "1px solid rgba(255,255,255,0.15)" : "1px solid #1a1a1a",
              }}
            />
          ))}
        </div>

        {/* Pause overlay */}
        {paused && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.75)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              color: "#fff",
              fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
            }}
          >
            <div style={{ fontSize: 20, fontWeight: "bold", letterSpacing: 2 }}>⏸ PAUSED</div>
            <button onClick={() => setPausedBoth(false)} style={{ fontSize: 11 }}>
              ▶ Resume
            </button>
          </div>
        )}
      </div>
      {isTouch && <TetrisTouchControls onAction={handleAction} />}
      </div>

      {/* Side panel */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          width: 220,
          fontFamily: '"Pixelated MS Sans Serif", "MS Sans Serif", Arial, sans-serif',
          fontSize: 11,
          color: "#fff",
        }}
      >
        {/* NEXT piece */}
        <div style={{ background: "#222", border: "2px inset #888", padding: 6 }}>
          <div style={{ color: "#aaa", marginBottom: 4, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Next</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(4, ${NEXT_CELL}px)`,
              gridTemplateRows: `repeat(4, ${NEXT_CELL}px)`,
            }}
          >
            {nextMask.flat().map((cell, i) => (
              <div
                key={i}
                style={{
                  width: NEXT_CELL,
                  height: NEXT_CELL,
                  background: cell ? COLORS[nextColor] : "transparent",
                  boxSizing: "border-box",
                  border: cell ? "1px solid rgba(255,255,255,0.2)" : "none",
                }}
              />
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{ background: "#222", border: "2px inset #888", padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { label: "Level", value: s.level },
            { label: "Lines", value: s.lines },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ color: "#aaa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: "bold", color: "#fff" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Controls hint (desktop only — touch users see on-screen buttons) */}
        {!isTouch && (
          <div style={{ background: "#222", border: "2px inset #888", padding: 8, color: "#666", fontSize: 10, lineHeight: 1.6 }}>
            <div>← → Move</div>
            <div>↑ / Z Rotate</div>
            <div>↓ Soft drop</div>
            <div>Space Hard drop</div>
            <div style={{ marginTop: 4, color: "#555" }}>Esc to pause</div>
          </div>
        )}

        {/* Pause button */}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setPausedBoth(!paused)}
          style={{ fontSize: 11, height: 22 }}
          disabled={s.gameOver}
        >
          {paused ? "▶ Resume" : "⏸ Pause"}
        </button>
      </div>
    </div>
  );
}
