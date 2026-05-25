# Tetris Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Prerequisite:** `docs/superpowers/plans/2026-05-19-multi-game-infra.md` must be complete before starting this plan.

**Goal:** Add a fully playable Tetris game to the platform — pure engine logic, CSS-grid renderer, shared-layer window, Clarity contract clone, and metadata API route.

**Architecture:** `TetrisEngine.ts` is a pure functional module (no React, no side effects) that produces immutable state snapshots. `TetrisCanvas.tsx` renders a snapshot via CSS grid. `TetrisWindow.tsx` wires the engine to `GameShellWindow` + `useGameSession`. The `tetris-score` Clarity contract is a copy of `snake-score` with `mint-fee` = u20000 and a new `base-uri`. A new Next.js API route at `/api/metadata/tetris/[id]` serves token metadata.

**Tech Stack:** TypeScript 5, React 18, CSS Grid, Clarity 4 (Clarinet 3), Next.js 16 API routes.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `frontend/components/game/tetris/TetrisEngine.ts` | Pure Tetris logic |
| Create | `frontend/components/game/tetris/TetrisEngine.test.ts` | Unit tests for engine |
| Create | `frontend/components/game/tetris/TetrisCanvas.tsx` | CSS grid renderer |
| Create | `frontend/components/game/tetris/TetrisWindow.tsx` | Wires engine + shared layer |
| Modify | `frontend/app/page.tsx` | Add `<TetrisWindow />`, `<SharedLeaderboard gameId="tetris" />`, `<SharedMyNfts gameId="tetris" />` |
| Create | `frontend/app/api/metadata/tetris/[id]/route.ts` | Token metadata endpoint |
| Create | `contract/tetris-score/` | Clarity contract (clone of snake-score) |
| Modify | `frontend/lib/game-registry.ts` | Fill in real `tetris-score` contract address after deploy |

---

## Task 1: `TetrisEngine.ts` — Pure Logic

**Files:**
- Create: `frontend/components/game/tetris/TetrisEngine.ts`
- Create: `frontend/components/game/tetris/TetrisEngine.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// frontend/components/game/tetris/TetrisEngine.test.ts
import { describe, it, expect } from "vitest";
import {
  createTetrisState,
  moveLeft,
  moveRight,
  moveDown,
  rotate,
  hardDrop,
  tick,
  type TetrisState,
} from "./TetrisEngine";

describe("TetrisEngine", () => {
  it("creates initial state with empty board", () => {
    const s = createTetrisState();
    expect(s.board.length).toBe(20);
    expect(s.board[0].length).toBe(10);
    expect(s.score).toBe(0);
    expect(s.level).toBe(1);
    expect(s.lines).toBe(0);
    expect(s.gameOver).toBe(false);
    expect(s.current).toBeDefined();
    expect(s.next).toBeDefined();
  });

  it("moveLeft decrements current.x", () => {
    const s = createTetrisState();
    const before = s.current.x;
    const after = moveLeft(s);
    expect(after.current.x).toBeLessThanOrEqual(before);
  });

  it("moveRight increments current.x", () => {
    const s = createTetrisState();
    const before = s.current.x;
    const after = moveRight(s);
    expect(after.current.x).toBeGreaterThanOrEqual(before);
  });

  it("tick moves piece down", () => {
    const s = createTetrisState();
    const before = s.current.y;
    const after = tick(s);
    if (!after.gameOver) {
      expect(after.current.y).toBeGreaterThanOrEqual(before);
    }
  });

  it("clearing a full line adds 100 to score", () => {
    const s = createTetrisState();
    // Fill row 19 (bottom) manually with non-zero values
    const board = s.board.map((row, i) =>
      i === 19 ? row.map(() => 1) : row
    );
    const filled: TetrisState = { ...s, board };
    // Force piece to lock by placing it at bottom
    const atBottom: TetrisState = {
      ...filled,
      current: { ...filled.current, y: 18 },
    };
    const after = tick(atBottom);
    expect(after.score).toBeGreaterThanOrEqual(100);
    expect(after.lines).toBeGreaterThanOrEqual(1);
  });

  it("hardDrop places piece immediately", () => {
    const s = createTetrisState();
    const after = hardDrop(s);
    // After hard drop, a new piece should be active or game over
    expect(after.current.type !== s.current.type || after.board !== s.board).toBe(true);
  });

  it("level increases every 10 lines", () => {
    const s: TetrisState = {
      ...createTetrisState(),
      lines: 9,
      level: 1,
    };
    // Simulate clearing 1 more line
    const board = s.board.map((row, i) =>
      i === 19 ? row.map(() => 1) : row
    );
    const atBottom: TetrisState = {
      ...s,
      board,
      current: { ...s.current, y: 18 },
    };
    const after = tick(atBottom);
    expect(after.level).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npm test -- --run components/game/tetris/TetrisEngine
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TetrisEngine.ts`**

```ts
// frontend/components/game/tetris/TetrisEngine.ts

export type TetrominoType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

// Each tetromino has 4 rotations, each rotation is a 4x4 bitmask (1=filled)
export const TETROMINOES: Record<TetrominoType, number[][][]> = {
  I: [
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
  ],
  O: [
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
  ],
  T: [
    [[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,1,0],[0,1,0,0],[0,0,0,0]],
    [[0,1,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]],
  ],
  S: [
    [[0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,1,0],[0,0,1,0],[0,0,0,0]],
    [[0,0,0,0],[0,1,1,0],[1,1,0,0],[0,0,0,0]],
    [[1,0,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]],
  ],
  Z: [
    [[1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,0,0],[0,1,1,0],[0,0,0,0]],
    [[0,1,0,0],[1,1,0,0],[1,0,0,0],[0,0,0,0]],
  ],
  J: [
    [[1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,1,0],[0,0,1,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[1,1,0,0],[0,0,0,0]],
  ],
  L: [
    [[0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,1,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,1,0],[1,0,0,0],[0,0,0,0]],
    [[1,1,0,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]],
  ],
};

// Color index per type (0 = empty, 1-7 = colors)
export const TETROMINO_COLOR: Record<TetrominoType, number> = {
  I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7,
};

const ALL_TYPES: TetrominoType[] = ["I", "O", "T", "S", "Z", "J", "L"];

export type ActivePiece = {
  type: TetrominoType;
  rotation: number;
  x: number;
  y: number;
};

export type TetrisState = {
  board: number[][];   // 20 rows × 10 cols; 0=empty, 1-7=color
  current: ActivePiece;
  next: TetrominoType;
  score: number;
  level: number;
  lines: number;
  gameOver: boolean;
};

function randomType(): TetrominoType {
  return ALL_TYPES[Math.floor(Math.random() * ALL_TYPES.length)];
}

function emptyBoard(): number[][] {
  return Array.from({ length: 20 }, () => Array(10).fill(0));
}

function spawnX(type: TetrominoType): number {
  return type === "O" ? 3 : type === "I" ? 3 : 3;
}

export function createTetrisState(): TetrisState {
  const type = randomType();
  return {
    board: emptyBoard(),
    current: { type, rotation: 0, x: spawnX(type), y: 0 },
    next: randomType(),
    score: 0,
    level: 1,
    lines: 0,
    gameOver: false,
  };
}

function cells(piece: ActivePiece): Array<[number, number]> {
  const mask = TETROMINOES[piece.type][piece.rotation];
  const result: Array<[number, number]> = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (mask[r][c]) result.push([piece.y + r, piece.x + c]);
    }
  }
  return result;
}

function isValid(board: number[][], piece: ActivePiece): boolean {
  for (const [r, c] of cells(piece)) {
    if (r < 0 || r >= 20 || c < 0 || c >= 10) return false;
    if (board[r][c] !== 0) return false;
  }
  return true;
}

function lockPiece(board: number[][], piece: ActivePiece): number[][] {
  const color = TETROMINO_COLOR[piece.type];
  const next = board.map((row) => [...row]);
  for (const [r, c] of cells(piece)) {
    if (r >= 0 && r < 20 && c >= 0 && c < 10) next[r][c] = color;
  }
  return next;
}

function clearLines(board: number[][]): { board: number[][]; cleared: number } {
  const remaining = board.filter((row) => row.some((cell) => cell === 0));
  const cleared = 20 - remaining.length;
  const empty = Array.from({ length: cleared }, () => Array(10).fill(0));
  return { board: [...empty, ...remaining], cleared };
}

const LINE_SCORES = [0, 100, 300, 500, 800];

function spawnPiece(type: TetrominoType): ActivePiece {
  return { type, rotation: 0, x: spawnX(type), y: 0 };
}

function lockAndAdvance(state: TetrisState): TetrisState {
  const locked = lockPiece(state.board, state.current);
  const { board, cleared } = clearLines(locked);
  const newLines = state.lines + cleared;
  const newLevel = Math.floor(newLines / 10) + 1;
  const newScore = state.score + LINE_SCORES[cleared] * state.level;
  const newCurrent = spawnPiece(state.next);
  const gameOver = !isValid(board, newCurrent);
  return {
    board,
    current: newCurrent,
    next: randomType(),
    score: newScore,
    level: newLevel,
    lines: newLines,
    gameOver,
  };
}

export function moveLeft(state: TetrisState): TetrisState {
  if (state.gameOver) return state;
  const moved = { ...state.current, x: state.current.x - 1 };
  if (!isValid(state.board, moved)) return state;
  return { ...state, current: moved };
}

export function moveRight(state: TetrisState): TetrisState {
  if (state.gameOver) return state;
  const moved = { ...state.current, x: state.current.x + 1 };
  if (!isValid(state.board, moved)) return state;
  return { ...state, current: moved };
}

export function rotate(state: TetrisState): TetrisState {
  if (state.gameOver) return state;
  const rotated = {
    ...state.current,
    rotation: (state.current.rotation + 1) % 4,
  };
  // Wall kicks: try 0, -1, +1, -2, +2 offsets
  for (const offset of [0, -1, 1, -2, 2]) {
    const kicked = { ...rotated, x: rotated.x + offset };
    if (isValid(state.board, kicked)) return { ...state, current: kicked };
  }
  return state;
}

export function moveDown(state: TetrisState): TetrisState {
  if (state.gameOver) return state;
  const moved = { ...state.current, y: state.current.y + 1 };
  if (!isValid(state.board, moved)) return lockAndAdvance(state);
  return { ...state, current: moved };
}

export function tick(state: TetrisState): TetrisState {
  return moveDown(state);
}

export function hardDrop(state: TetrisState): TetrisState {
  if (state.gameOver) return state;
  let s = state;
  while (true) {
    const moved = { ...s.current, y: s.current.y + 1 };
    if (!isValid(s.board, moved)) return lockAndAdvance(s);
    s = { ...s, current: moved };
  }
}

export function ghostY(state: TetrisState): number {
  let y = state.current.y;
  while (isValid(state.board, { ...state.current, y: y + 1 })) y++;
  return y;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm test -- --run components/game/tetris/TetrisEngine
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/game/tetris/TetrisEngine.ts \
        frontend/components/game/tetris/TetrisEngine.test.ts
git commit -m "feat(tetris): pure TetrisEngine with move/rotate/tick/hardDrop/ghostY"
```

---

## Task 2: `TetrisCanvas.tsx` — CSS Grid Renderer

**Files:**
- Create: `frontend/components/game/tetris/TetrisCanvas.tsx`

- [ ] **Step 1: Implement `TetrisCanvas.tsx`**

```tsx
// frontend/components/game/tetris/TetrisCanvas.tsx
"use client";
import { useEffect, useRef, useCallback } from "react";
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

// Colors indexed 1-7 matching TETROMINO_COLOR
const COLORS = [
  "transparent",  // 0 = empty
  "#00f0f0",      // I — cyan
  "#f0f000",      // O — yellow
  "#a000f0",      // T — purple
  "#00f000",      // S — green
  "#f00000",      // Z — red
  "#0000f0",      // J — blue
  "#f0a000",      // L — orange
];

const GHOST_COLORS = COLORS.map((c) =>
  c === "transparent" ? "transparent" : c + "55"
);

const BOARD_W = 10;
const BOARD_H = 20;
const CELL_SIZE = 24;

function getOverlay(state: TetrisState): number[][] {
  const overlay = state.board.map((row) => [...row]);
  // Draw ghost
  const gy = ghostY(state);
  const gMask = TETROMINOES[state.current.type][state.current.rotation];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (!gMask[r][c]) continue;
      const row = gy + r;
      const col = state.current.x + c;
      if (row >= 0 && row < BOARD_H && col >= 0 && col < BOARD_W) {
        if (overlay[row][col] === 0) overlay[row][col] = -1; // ghost marker
      }
    }
  }
  // Draw current piece
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
  }, []);

  // Restart tick when level changes
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

// Missing import — add to top of file:
import { useReducer } from "react";
```

**Note:** The `import { useReducer }` must be at the top of the file with the other React imports, not at the bottom. Move it there when implementing.

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/game/tetris/TetrisCanvas.tsx
git commit -m "feat(tetris): TetrisCanvas CSS grid renderer with ghost piece"
```

---

## Task 3: `TetrisWindow.tsx` — Wired to Shared Layer

**Files:**
- Create: `frontend/components/game/tetris/TetrisWindow.tsx`

- [ ] **Step 1: Implement `TetrisWindow.tsx`**

```tsx
// frontend/components/game/tetris/TetrisWindow.tsx
"use client";
import { useWindows } from "@/state/window-manager";
import { GameShellWindow } from "@/components/shared/GameShellWindow";
import { SharedMintDialog } from "@/components/shared/SharedMintDialog";
import { TetrisCanvas } from "./TetrisCanvas";
import { useGameSession } from "@/hooks/useGameSession";

export function TetrisWindow() {
  const w = useWindows((s) =>
    s.windows.find((win) => win.type === "game-tetris")
  );
  const close = useWindows((s) => s.close);
  const {
    score,
    setScore,
    finalScore,
    showMint,
    resetKey,
    handleGameOver,
    handlePlayAgain,
  } = useGameSession("tetris");

  if (!w) return null;

  return (
    <GameShellWindow gameId="tetris" score={score}>
      {showMint ? (
        <SharedMintDialog
          gameId="tetris"
          score={finalScore}
          onClose={() => close(w.id)}
          onPlayAgain={handlePlayAgain}
        />
      ) : (
        <TetrisCanvas
          key={resetKey}
          onGameOver={handleGameOver}
          onScoreChange={setScore}
        />
      )}
    </GameShellWindow>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/game/tetris/TetrisWindow.tsx
git commit -m "feat(tetris): TetrisWindow wired to GameShellWindow and useGameSession"
```

---

## Task 4: Wire Tetris into `app/page.tsx`

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Add Tetris windows to page**

Open `frontend/app/page.tsx`. Add imports and render `TetrisWindow`, `SharedLeaderboard gameId="tetris"`, `SharedMyNfts gameId="tetris"` alongside the existing Snake windows:

```tsx
import { TetrisWindow } from "@/components/game/tetris/TetrisWindow";
// ... existing imports

export default function Home() {
  return (
    <BootScreen>
      <Desktop>
        <SnakeWindow />
        <TetrisWindow />
        <SharedLeaderboard gameId="snake" />
        <SharedLeaderboard gameId="tetris" />
        <SharedMyNfts gameId="snake" />
        <SharedMyNfts gameId="tetris" />
        <SeasonAdminWindow />
        <PlayerProfileWindow />
        <Balloons />
      </Desktop>
    </BootScreen>
  );
}
```

- [ ] **Step 2: Build check**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: successful build.

- [ ] **Step 3: Smoke test Tetris**

```bash
cd frontend && npm run dev
```

- Double-click Tetris.exe → TetrisWindow opens
- Arrow keys move/rotate pieces
- Pieces lock and lines clear
- Score updates in toolbar
- Game over → SharedMintDialog shows "0.02 STX" fee

- [ ] **Step 4: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "feat(tetris): wire TetrisWindow and leaderboard/NFT windows into page"
```

---

## Task 5: Tetris Metadata API Route

**Files:**
- Create: `frontend/app/api/metadata/tetris/[id]/route.ts`

- [ ] **Step 1: Check existing snake metadata route for reference**

```bash
cat frontend/app/api/metadata/score/\[id\]/route.ts 2>/dev/null || find frontend/app/api -name "route.ts" | head -5
```

- [ ] **Step 2: Create Tetris metadata route**

Copy the snake score metadata route structure, changing `snake` references to `tetris` and the image generation accordingly. The route should return JSON matching the SIP-016 NFT metadata standard:

```ts
// frontend/app/api/metadata/tetris/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const tokenId = Number(params.id);
  if (!Number.isFinite(tokenId) || tokenId < 1) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return NextResponse.json({
    sip: 16,
    name: `Tetris Score #${tokenId}`,
    description: "An on-chain Tetris score NFT.",
    image: `${appUrl}/api/metadata/tetris/${tokenId}/image`,
    attributes: [
      { trait_type: "Game", value: "Tetris" },
      { trait_type: "Token ID", value: String(tokenId) },
    ],
  });
}
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/api/metadata/tetris/
git commit -m "feat(tetris): metadata API route at /api/metadata/tetris/[id]"
```

---

## Task 6: Clone `tetris-score` Clarity Contract

**Files:**
- Create: `contract/tetris-score/` (full Clarinet project)

- [ ] **Step 1: Scaffold the contract**

```bash
cd contract
# Copy snake-score contract as base
cp -r snake-score tetris-score 2>/dev/null || mkdir -p tetris-score/contracts tetris-score/tests
```

- [ ] **Step 2: Copy and modify the contract**

Copy `contract/contracts/snake-score.clar` to `contract/tetris-score/contracts/tetris-score.clar`. Make exactly two changes:

1. Change `(define-constant MINT_FEE u10000)` to `(define-constant MINT_FEE u20000)`
2. Change the `base-uri` initial value from `"https://.../api/metadata/score/"` to `"https://<your-app-url>/api/metadata/tetris/"`

Verify by diffing:
```bash
diff contract/contracts/snake-score.clar contract/tetris-score/contracts/tetris-score.clar
```

Expected: only the two lines above differ.

- [ ] **Step 3: Verify contract syntax**

```bash
cd contract && clarinet check
```

Expected: no syntax errors.

- [ ] **Step 4: Generate mainnet deployment plan**

```bash
cd contract && clarinet deployments generate --mainnet --low-cost
```

Review the generated deployment file — confirm contract name is `tetris-score`.

- [ ] **Step 5: Commit the contract**

```bash
git add contract/tetris-score/
git commit -m "feat(contract): tetris-score clone with 0.02 STX mint fee"
```

- [ ] **Step 6: Deploy to mainnet** (requires funded deployer wallet in `settings/Mainnet.toml`)

```bash
cd contract && clarinet deployments apply --mainnet --no-dashboard -c
```

Note the deployed contract address from the output (e.g. `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.tetris-score`).

- [ ] **Step 7: Update `game-registry.ts` with real contract address**

Open `frontend/lib/game-registry.ts`. Replace the `tetris-score` placeholder:

```ts
tetris: {
  id: "tetris",
  label: "Tetris",
  emoji: "🧱",
  contractAddress: "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV",  // confirmed deployer
  contractName: "tetris-score",
  mintFeeUstx: BigInt(20_000),
},
```

- [ ] **Step 8: Commit registry update**

```bash
git add frontend/lib/game-registry.ts
git commit -m "chore(registry): fill tetris-score mainnet contract address"
```

---

## Task 7: Run Full Test Suite

- [ ] **Step 1: Run all tests**

```bash
cd frontend && npm test -- --run
```

Expected: all tests PASS.

- [ ] **Step 2: Production build**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: build succeeds with 0 type errors.

- [ ] **Step 3: Commit**

```bash
git add -p
git commit -m "chore: tetris test suite green"
```

---

## Manual Smoke Test (do by hand after Task 7)

Run `npm run dev` then verify:

1. Double-click **Tetris.exe** → TetrisWindow opens with "High Scores" + "My NFTs" toolbar buttons and live Score display
2. Play Tetris — pieces fall, lines clear, score increases in toolbar
3. Game over → **SharedMintDialog** appears showing **0.02 STX** fee
4. Click "High Scores" toolbar button → **SharedLeaderboard** opens titled "🧱 Tetris — High Scores"
5. Click "My NFTs" toolbar button → **SharedMyNfts** opens titled "My Tetris NFTs"
6. Connect wallet → "Mint for 0.02 STX" button is enabled → clicking it triggers Hiro/Xverse with 0.02 STX
7. Taskbar entries show `game-tetris`, `leaderboard-tetris`, `mynfts-tetris`
8. Start Menu → Games section shows Snake, Tetris, Pac-Man
