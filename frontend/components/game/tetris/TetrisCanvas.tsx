"use client";
import { useEffect, useRef, useCallback, useReducer } from "react";
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
}: {
  onGameOver: (score: number) => void;
  onScoreChange: (score: number) => void;
}) {
  const stateRef = useRef<TetrisState>(createTetrisState());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

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
      setState(tick(stateRef.current));
    }, ms);
  }

  useEffect(() => {
    startTick(stateRef.current.level);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevLevel = useRef(1);
  const s = stateRef.current;
  if (s.level !== prevLevel.current) {
    prevLevel.current = s.level;
    startTick(s.level);
  }

  const handleKey = useCallback((e: KeyboardEvent) => {
    const cur = stateRef.current;
    if (cur.gameOver) return;
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
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const overlay = getOverlay(s);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${BOARD_W}, ${CELL_SIZE}px)`,
        gridTemplateRows: `repeat(${BOARD_H}, ${CELL_SIZE}px)`,
        border: "2px inset #888",
        background: "#111",
        userSelect: "none",
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
  );
}
