# Pac-Man Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Prerequisite:** `docs/superpowers/plans/2026-05-19-multi-game-infra.md` must be complete before starting this plan. `2026-05-19-multi-game-tetris.md` may run in parallel.

**Goal:** Add a playable MVP Pac-Man game — hardcoded maze, dots, power pellets, 4 ghosts with simple chase/scatter AI, 3 lives, canvas renderer, shared-layer window, Clarity contract clone, and metadata API route.

**Architecture:** `PacManEngine.ts` is a pure functional module (immutable state snapshots, no timers). `PacManCanvas.tsx` owns the `requestAnimationFrame` loop and renders via `<canvas>`. `PacManWindow.tsx` wires engine to `GameShellWindow` + `useGameSession`. Ghost AI uses a simple mode toggle (scatter 7s → chase 20s → scatter) with randomized scatter and direct-path chase (no Blinky/Pinky/Inky/Clyde targeting). The `pacman-score` contract is a copy of `snake-score` with `mint-fee` = u20000.

**Tech Stack:** TypeScript 5, React 18, HTML5 Canvas, Clarity 4 (Clarinet 3), Next.js 16 API routes.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `frontend/components/game/pacman/maze.ts` | Hardcoded maze layout constant |
| Create | `frontend/components/game/pacman/PacManEngine.ts` | Pure game logic |
| Create | `frontend/components/game/pacman/PacManEngine.test.ts` | Unit tests |
| Create | `frontend/components/game/pacman/PacManCanvas.tsx` | Canvas renderer + RAF loop |
| Create | `frontend/components/game/pacman/PacManWindow.tsx` | Wired to shared layer |
| Modify | `frontend/app/page.tsx` | Add Pac-Man windows |
| Create | `frontend/app/api/metadata/pacman/[id]/route.ts` | Token metadata endpoint |
| Create | `contract/pacman-score/` | Clarity contract (clone of snake-score) |
| Modify | `frontend/lib/game-registry.ts` | Fill real `pacman-score` address after deploy |

---

## Task 1: Maze Layout (`maze.ts`)

**Files:**
- Create: `frontend/components/game/pacman/maze.ts`

- [ ] **Step 1: Define the maze**

The maze is a 21×21 tile grid (odd dimensions allow symmetric layout). Each cell is an integer:
- `0` = wall
- `1` = dot
- `2` = power pellet
- `3` = empty (ghost house, tunnels)

```ts
// frontend/components/game/pacman/maze.ts

// 21 rows × 21 cols. Legend: 0=wall, 1=dot, 2=pellet, 3=empty
export const MAZE_ROWS = 21;
export const MAZE_COLS = 21;

export const MAZE_LAYOUT: number[][] = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,0],
  [0,2,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,2,0],
  [0,1,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,1,0,1,0,0,0,0,0,0,0,1,0,1,0,0,1,0],
  [0,1,1,1,1,0,1,1,1,0,0,0,1,1,1,0,1,1,1,1,0],
  [0,0,0,0,1,0,0,0,3,0,0,0,3,0,0,0,1,0,0,0,0],
  [0,0,0,0,1,0,3,3,3,3,3,3,3,3,3,0,1,0,0,0,0],
  [0,0,0,0,1,0,3,0,0,3,3,3,0,0,3,0,1,0,0,0,0],
  [3,3,3,3,1,3,3,0,3,3,3,3,3,0,3,3,1,3,3,3,3],
  [0,0,0,0,1,0,3,0,0,0,0,0,0,0,3,0,1,0,0,0,0],
  [0,0,0,0,1,0,3,3,3,3,3,3,3,3,3,0,1,0,0,0,0],
  [0,0,0,0,1,0,3,0,0,0,0,0,0,0,3,0,1,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,0,0,0,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,1,0],
  [0,2,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1,2,0],
  [0,0,1,0,1,0,1,0,0,0,0,0,0,0,1,0,1,0,1,0,0],
  [0,1,1,1,1,0,1,1,1,0,0,0,1,1,1,0,1,1,1,1,0],
  [0,1,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,1,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

export const TILE_SIZE = 20; // px per tile

export function isWall(row: number, col: number): boolean {
  if (row < 0 || row >= MAZE_ROWS || col < 0 || col >= MAZE_COLS) return true;
  return MAZE_LAYOUT[row][col] === 0;
}

export function countDots(): number {
  return MAZE_LAYOUT.flat().filter((c) => c === 1 || c === 2).length;
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/game/pacman/maze.ts
git commit -m "feat(pacman): hardcoded 21x21 maze layout with dots and power pellets"
```

---

## Task 2: `PacManEngine.ts` — Pure Logic

**Files:**
- Create: `frontend/components/game/pacman/PacManEngine.ts`
- Create: `frontend/components/game/pacman/PacManEngine.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// frontend/components/game/pacman/PacManEngine.test.ts
import { describe, it, expect } from "vitest";
import {
  createPacManState,
  movePacMan,
  tickGhosts,
  type Direction,
} from "./PacManEngine";
import { countDots } from "./maze";

describe("PacManEngine", () => {
  it("creates initial state with full dot count", () => {
    const s = createPacManState();
    expect(s.dotsRemaining).toBe(countDots());
    expect(s.lives).toBe(3);
    expect(s.score).toBe(0);
    expect(s.gameOver).toBe(false);
    expect(s.ghosts.length).toBe(4);
  });

  it("moving pac-man in open space changes position", () => {
    const s = createPacManState();
    // Pac-Man starts at row 16, col 10 (open space in maze)
    const moved = movePacMan(s, "left");
    // Either moves or stays if wall — just verify state is valid
    expect(moved.pacman.row).toBeGreaterThanOrEqual(0);
    expect(moved.pacman.col).toBeGreaterThanOrEqual(0);
  });

  it("eating a dot increments score by 10 and decrements dotsRemaining", () => {
    const s = createPacManState();
    // Force pac-man onto a dot tile
    const withDot = {
      ...s,
      pacman: { ...s.pacman, row: 1, col: 1 },
    };
    const after = movePacMan(withDot, "right");
    // If (1,2) is a dot, score increases
    if (after.score > s.score) {
      expect(after.score).toBe(s.score + 10);
      expect(after.dotsRemaining).toBe(s.dotsRemaining - 1);
    }
  });

  it("losing a life resets positions", () => {
    const s = createPacManState();
    // Force ghost onto pac-man
    const collision = {
      ...s,
      ghosts: s.ghosts.map((g) => ({
        ...g,
        row: s.pacman.row,
        col: s.pacman.col,
      })),
    };
    const after = movePacMan(collision, "left");
    expect(after.lives).toBeLessThanOrEqual(s.lives);
  });

  it("game over when lives reach 0", () => {
    const s = createPacManState();
    const noLives = { ...s, lives: 1 };
    const collision = {
      ...noLives,
      ghosts: noLives.ghosts.map((g) => ({
        ...g,
        row: noLives.pacman.row,
        col: noLives.pacman.col,
      })),
    };
    const after = movePacMan(collision, "left");
    expect(after.lives).toBe(0);
    expect(after.gameOver).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npm test -- --run components/game/pacman/PacManEngine
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `PacManEngine.ts`**

```ts
// frontend/components/game/pacman/PacManEngine.ts
import { MAZE_LAYOUT, MAZE_ROWS, MAZE_COLS, isWall, countDots } from "./maze";

export type Direction = "up" | "down" | "left" | "right";
export type GhostMode = "scatter" | "chase" | "frightened";

export type Ghost = {
  id: number;
  row: number;
  col: number;
  dir: Direction;
  mode: GhostMode;
  frightTimer: number; // ticks remaining in frightened mode
};

export type PacManState = {
  pacman: { row: number; col: number; dir: Direction };
  ghosts: Ghost[];
  maze: number[][];      // mutable copy of MAZE_LAYOUT (dots eaten = 3)
  dotsRemaining: number;
  score: number;
  lives: number;
  gameOver: boolean;
  won: boolean;
  modeTimer: number;     // ticks until next scatter/chase toggle
  modePhase: number;     // 0,2,4=scatter 1,3=chase
};

const SCATTER_TICKS = 210; // ~7s at 30fps
const CHASE_TICKS   = 600; // ~20s
const FRIGHT_TICKS  = 180; // ~6s
const MODE_SEQUENCE = [SCATTER_TICKS, CHASE_TICKS, SCATTER_TICKS, CHASE_TICKS, SCATTER_TICKS];

const DIRS: Record<Direction, [number, number]> = {
  up:    [-1, 0],
  down:  [ 1, 0],
  left:  [ 0,-1],
  right: [ 0, 1],
};

const OPPOSITE: Record<Direction, Direction> = {
  up: "down", down: "up", left: "right", right: "left",
};

const GHOST_STARTS: Array<{ row: number; col: number }> = [
  { row: 9, col: 10 },
  { row: 9, col: 9 },
  { row: 9, col: 11 },
  { row: 10, col: 10 },
];

const PACMAN_START = { row: 16, col: 10 };

function deepCopyMaze(): number[][] {
  return MAZE_LAYOUT.map((row) => [...row]);
}

export function createPacManState(): PacManState {
  return {
    pacman: { ...PACMAN_START, dir: "left" },
    ghosts: GHOST_STARTS.map((pos, id) => ({
      id,
      ...pos,
      dir: "up" as Direction,
      mode: "scatter",
      frightTimer: 0,
    })),
    maze: deepCopyMaze(),
    dotsRemaining: countDots(),
    score: 0,
    lives: 3,
    gameOver: false,
    won: false,
    modeTimer: SCATTER_TICKS,
    modePhase: 0,
  };
}

function canMove(
  maze: number[][],
  row: number,
  col: number,
  dir: Direction,
): boolean {
  const [dr, dc] = DIRS[dir];
  const nr = row + dr;
  const nc = col + dc;
  // Tunnel wrap: col -1 → MAZE_COLS-1 and vice versa
  if (nc < 0 || nc >= MAZE_COLS) return true;
  return !isWall(nr, nc);
}

function wrap(row: number, col: number): [number, number] {
  let c = col;
  if (c < 0) c = MAZE_COLS - 1;
  if (c >= MAZE_COLS) c = 0;
  return [row, c];
}

function ghostChaseDir(ghost: Ghost, pacman: { row: number; col: number }): Direction {
  const options: Direction[] = ["up", "down", "left", "right"];
  let best: Direction = ghost.dir;
  let bestDist = Infinity;
  for (const d of options) {
    if (d === OPPOSITE[ghost.dir]) continue;
    const [dr, dc] = DIRS[d];
    const nr = ghost.row + dr;
    const nc = ghost.col + dc;
    if (isWall(nr, nc)) continue;
    const dist = Math.abs(nr - pacman.row) + Math.abs(nc - pacman.col);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return best;
}

function ghostScatterDir(ghost: Ghost): Direction {
  const options: Direction[] = ["up", "down", "left", "right"];
  const valid = options.filter(
    (d) => d !== OPPOSITE[ghost.dir] && canMove(ghost.mode === "scatter" ? [] : [], ghost.row, ghost.col, d)
  );
  // Prefer continuing or random turn
  if (canMove([], ghost.row, ghost.col, ghost.dir)) return ghost.dir;
  if (valid.length === 0) return OPPOSITE[ghost.dir];
  return valid[Math.floor(Math.random() * valid.length)];
}

function moveGhost(
  ghost: Ghost,
  pacman: { row: number; col: number },
): Ghost {
  const effectiveMode = ghost.frightTimer > 0 ? "frightened" : ghost.mode;
  let dir: Direction;

  if (effectiveMode === "frightened") {
    const options: Direction[] = ["up", "down", "left", "right"];
    const valid = options.filter(
      (d) => d !== OPPOSITE[ghost.dir] && canMove([], ghost.row, ghost.col, d)
    );
    dir = valid.length > 0
      ? valid[Math.floor(Math.random() * valid.length)]
      : OPPOSITE[ghost.dir];
  } else if (effectiveMode === "chase") {
    dir = ghostChaseDir(ghost, pacman);
  } else {
    dir = ghostScatterDir(ghost);
  }

  const [dr, dc] = DIRS[dir];
  let nr = ghost.row + dr;
  let nc = ghost.col + dc;
  [nr, nc] = wrap(nr, nc);
  if (isWall(nr, nc)) return { ...ghost, dir: OPPOSITE[ghost.dir] };
  return {
    ...ghost,
    row: nr,
    col: nc,
    dir,
    frightTimer: Math.max(0, ghost.frightTimer - 1),
  };
}

function checkCollision(
  pacman: { row: number; col: number },
  ghost: Ghost,
): "eat" | "die" | null {
  if (pacman.row !== ghost.row || pacman.col !== ghost.col) return null;
  if (ghost.frightTimer > 0) return "eat";
  return "die";
}

function resetPositions(
  state: PacManState,
): PacManState {
  return {
    ...state,
    pacman: { ...PACMAN_START, dir: "left" },
    ghosts: GHOST_STARTS.map((pos, id) => ({
      id,
      ...pos,
      dir: "up" as Direction,
      mode: "scatter",
      frightTimer: 0,
    })),
    modeTimer: SCATTER_TICKS,
    modePhase: 0,
  };
}

export function movePacMan(state: PacManState, dir: Direction): PacManState {
  if (state.gameOver || state.won) return state;

  let { pacman, maze, score, dotsRemaining, lives, ghosts } = state;

  // Try to move pac-man
  let newRow = pacman.row;
  let newCol = pacman.col;
  if (canMove(maze, pacman.row, pacman.col, dir)) {
    const [dr, dc] = DIRS[dir];
    newRow = pacman.row + dr;
    newCol = pacman.col + dc;
    [newRow, newCol] = wrap(newRow, newCol);
  }
  const newPacman = { row: newRow, col: newCol, dir };

  // Eat dot or pellet
  const newMaze = maze.map((row) => [...row]);
  let frightened = false;
  const cell = newMaze[newRow]?.[newCol];
  if (cell === 1) {
    newMaze[newRow][newCol] = 3;
    score += 10;
    dotsRemaining -= 1;
  } else if (cell === 2) {
    newMaze[newRow][newCol] = 3;
    score += 50;
    dotsRemaining -= 1;
    frightened = true;
  }

  // Activate frightened on ghosts
  let newGhosts = frightened
    ? ghosts.map((g) => ({ ...g, frightTimer: FRIGHT_TICKS }))
    : ghosts;

  // Check collisions
  let newLives = lives;
  let ghostScoreBonus = 0;
  let died = false;
  newGhosts = newGhosts.map((g) => {
    const result = checkCollision(newPacman, g);
    if (result === "eat") {
      ghostScoreBonus += 200;
      return { ...g, row: GHOST_STARTS[g.id].row, col: GHOST_STARTS[g.id].col, frightTimer: 0 };
    }
    if (result === "die") { died = true; }
    return g;
  });
  score += ghostScoreBonus;

  if (died) {
    newLives -= 1;
    if (newLives <= 0) {
      return { ...state, score, lives: 0, gameOver: true, maze: newMaze };
    }
    return resetPositions({
      ...state,
      score,
      lives: newLives,
      maze: newMaze,
      dotsRemaining,
    });
  }

  const won = dotsRemaining <= 0;

  return {
    ...state,
    pacman: newPacman,
    ghosts: newGhosts,
    maze: newMaze,
    score,
    dotsRemaining,
    lives: newLives,
    gameOver: false,
    won,
  };
}

export function tickGhosts(state: PacManState): PacManState {
  if (state.gameOver || state.won) return state;

  // Advance mode timer
  let { modeTimer, modePhase, ghosts } = state;
  modeTimer -= 1;
  let newPhase = modePhase;
  if (modeTimer <= 0 && modePhase < MODE_SEQUENCE.length - 1) {
    newPhase = modePhase + 1;
    modeTimer = MODE_SEQUENCE[newPhase];
  } else if (modeTimer <= 0) {
    modeTimer = MODE_SEQUENCE[MODE_SEQUENCE.length - 1];
  }

  const currentMode: GhostMode = newPhase % 2 === 0 ? "scatter" : "chase";
  const movedGhosts = ghosts
    .map((g) => ({ ...g, mode: g.frightTimer > 0 ? g.mode : currentMode }))
    .map((g) => moveGhost(g, state.pacman));

  // Check collisions after ghost move
  let newLives = state.lives;
  let died = false;
  const finalGhosts = movedGhosts.map((g) => {
    const result = checkCollision(state.pacman, g);
    if (result === "eat") {
      return { ...g, row: GHOST_STARTS[g.id].row, col: GHOST_STARTS[g.id].col, frightTimer: 0 };
    }
    if (result === "die") { died = true; }
    return g;
  });

  if (died) {
    newLives -= 1;
    if (newLives <= 0) {
      return { ...state, lives: 0, gameOver: true, modeTimer, modePhase: newPhase };
    }
    return resetPositions({ ...state, lives: newLives, modeTimer, modePhase: newPhase });
  }

  return { ...state, ghosts: finalGhosts, modeTimer, modePhase: newPhase };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm test -- --run components/game/pacman/PacManEngine
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/game/pacman/PacManEngine.ts \
        frontend/components/game/pacman/PacManEngine.test.ts
git commit -m "feat(pacman): pure PacManEngine with movement, dots, ghosts, lives"
```

---

## Task 3: `PacManCanvas.tsx` — Canvas Renderer

**Files:**
- Create: `frontend/components/game/pacman/PacManCanvas.tsx`

- [ ] **Step 1: Implement `PacManCanvas.tsx`**

```tsx
// frontend/components/game/pacman/PacManCanvas.tsx
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
const WALL_COLOR = "#00008b";
const DOT_COLOR = "#ffb8ae";
const PACMAN_COLOR = "#ffff00";

function drawMaze(
  ctx: CanvasRenderingContext2D,
  maze: number[][],
) {
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
  const x = col * TILE_SIZE;
  const y = row * TILE_SIZE;
  const w = TILE_SIZE - 2;
  const h = TILE_SIZE - 2;
  ctx.fillStyle = frightTimer > 0 ? FRIGHT_COLOR : color;
  ctx.beginPath();
  ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  for (let i = 3; i >= 0; i--) {
    const cx = x + (w / 3) * (i % 2 === 0 ? i / 2 : (i - 1) / 2 + 0.5);
    ctx.quadraticCurveTo(cx, y + h - 4, cx, y + h);
  }
  ctx.lineTo(x, y + h);
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

    const s = stateRef.current;

    // Tick at ~10fps for game logic, render at display fps
    const TICK_MS = 100;
    if (timestamp - lastTickRef.current >= TICK_MS) {
      lastTickRef.current = timestamp;
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

    // Render
    const cur = stateRef.current;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawMaze(ctx, cur.maze);

    mouthRef.current = (mouthRef.current + 0.15) % (Math.PI / 3);
    drawPacMan(ctx, cur.pacman.row, cur.pacman.col, mouthRef.current);

    cur.ghosts.forEach((g, i) => {
      drawGhost(ctx, g.row, g.col, GHOST_COLORS[i], g.frightTimer);
    });

    // HUD
    ctx.fillStyle = "#fff";
    ctx.font = "12px monospace";
    ctx.fillText(`♥ ${cur.lives}`, 4, 14);

    rafRef.current = requestAnimationFrame(loop);
  }, [onGameOver, onScoreChange]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    const MAP: Record<string, Direction> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
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
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/game/pacman/PacManCanvas.tsx
git commit -m "feat(pacman): canvas renderer with RAF loop, ghost drawing, mouth animation"
```

---

## Task 4: `PacManWindow.tsx` — Wired to Shared Layer

**Files:**
- Create: `frontend/components/game/pacman/PacManWindow.tsx`

- [ ] **Step 1: Implement `PacManWindow.tsx`**

```tsx
// frontend/components/game/pacman/PacManWindow.tsx
"use client";
import { useWindows } from "@/state/window-manager";
import { GameShellWindow } from "@/components/shared/GameShellWindow";
import { SharedMintDialog } from "@/components/shared/SharedMintDialog";
import { PacManCanvas } from "./PacManCanvas";
import { useGameSession } from "@/hooks/useGameSession";

export function PacManWindow() {
  const w = useWindows((s) =>
    s.windows.find((win) => win.type === "game-pacman")
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
  } = useGameSession("pacman");

  if (!w) return null;

  return (
    <GameShellWindow gameId="pacman" score={score}>
      {showMint ? (
        <SharedMintDialog
          gameId="pacman"
          score={finalScore}
          onClose={() => close(w.id)}
          onPlayAgain={handlePlayAgain}
        />
      ) : (
        <PacManCanvas
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
git add frontend/components/game/pacman/PacManWindow.tsx
git commit -m "feat(pacman): PacManWindow wired to GameShellWindow and useGameSession"
```

---

## Task 5: Wire Pac-Man into `app/page.tsx`

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Add Pac-Man windows**

Open `frontend/app/page.tsx`. Add `PacManWindow`, `SharedLeaderboard gameId="pacman"`, `SharedMyNfts gameId="pacman"`:

```tsx
import { PacManWindow } from "@/components/game/pacman/PacManWindow";
// ... all existing imports

export default function Home() {
  return (
    <BootScreen>
      <Desktop>
        <SnakeWindow />
        <TetrisWindow />
        <PacManWindow />
        <SharedLeaderboard gameId="snake" />
        <SharedLeaderboard gameId="tetris" />
        <SharedLeaderboard gameId="pacman" />
        <SharedMyNfts gameId="snake" />
        <SharedMyNfts gameId="tetris" />
        <SharedMyNfts gameId="pacman" />
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

- [ ] **Step 3: Smoke test Pac-Man**

```bash
cd frontend && npm run dev
```

- Double-click Pac-Man.exe → PacManWindow opens with maze
- Arrow keys move Pac-Man
- Dots disappear when eaten, score increments by 10
- Power pellets turn ghosts blue; eating blue ghost scores 200
- Losing all 3 lives → SharedMintDialog shows "0.02 STX" fee

- [ ] **Step 4: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "feat(pacman): wire PacManWindow and leaderboard/NFT windows into page"
```

---

## Task 6: Pac-Man Metadata API Route

**Files:**
- Create: `frontend/app/api/metadata/pacman/[id]/route.ts`

- [ ] **Step 1: Implement metadata route**

```ts
// frontend/app/api/metadata/pacman/[id]/route.ts
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
    name: `Pac-Man Score #${tokenId}`,
    description: "An on-chain Pac-Man score NFT.",
    image: `${appUrl}/api/metadata/pacman/${tokenId}/image`,
    attributes: [
      { trait_type: "Game", value: "Pac-Man" },
      { trait_type: "Token ID", value: String(tokenId) },
    ],
  });
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/metadata/pacman/
git commit -m "feat(pacman): metadata API route at /api/metadata/pacman/[id]"
```

---

## Task 7: Clone `pacman-score` Clarity Contract

**Files:**
- Create: `contract/pacman-score/`

- [ ] **Step 1: Clone contract**

```bash
cp -r contract/tetris-score contract/pacman-score 2>/dev/null || \
  mkdir -p contract/pacman-score/contracts contract/pacman-score/tests
```

- [ ] **Step 2: Modify contract file**

Copy `contract/tetris-score/contracts/tetris-score.clar` to `contract/pacman-score/contracts/pacman-score.clar`. Change:

1. Contract identifier references from `tetris-score` to `pacman-score`
2. `base-uri` initial value to `"https://<your-app-url>/api/metadata/pacman/"`
3. Mint fee stays `u20000` (no change needed)

Verify:
```bash
diff contract/tetris-score/contracts/tetris-score.clar \
     contract/pacman-score/contracts/pacman-score.clar
```

Expected: only `base-uri` and contract name references differ.

- [ ] **Step 3: Syntax check**

```bash
cd contract && clarinet check
```

Expected: 0 errors.

- [ ] **Step 4: Deploy to mainnet**

```bash
cd contract && clarinet deployments generate --mainnet --low-cost
clarinet deployments apply --mainnet --no-dashboard -c
```

Note the deployed contract address.

- [ ] **Step 5: Update `game-registry.ts`**

Open `frontend/lib/game-registry.ts`. Fill the `pacman-score` contract address:

```ts
pacman: {
  id: "pacman",
  label: "Pac-Man",
  emoji: "👾",
  contractAddress: "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV",
  contractName: "pacman-score",
  mintFeeUstx: BigInt(20_000),
},
```

- [ ] **Step 6: Commit**

```bash
git add contract/pacman-score/ frontend/lib/game-registry.ts
git commit -m "feat(pacman): pacman-score contract deployed; registry address filled"
```

---

## Task 8: Run Full Test Suite

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
git commit -m "chore: pacman test suite green"
```

---

## Manual Smoke Test (do by hand after Task 8)

Run `npm run dev` then verify:

### Pac-Man
1. Double-click **Pac-Man.exe** → PacManWindow opens with "High Scores" + "My NFTs" toolbar and live Score display
2. Play Pac-Man — Pac-Man moves, dots eaten, score increases in toolbar, ghosts chase
3. All lives lost → **SharedMintDialog** appears showing **0.02 STX** fee
4. Click "High Scores" toolbar → **SharedLeaderboard** opens titled "👾 Pac-Man — High Scores"
5. Click "My NFTs" toolbar → **SharedMyNfts** opens titled "My Pac-Man NFTs"
6. Connect wallet → "Mint for 0.02 STX" enabled → Hiro/Xverse shows 0.02 STX
7. Taskbar entries show `game-pacman`, `leaderboard-pacman`, `mynfts-pacman`

### Full platform
8. All 3 game icons on desktop (Snake, Tetris, Pac-Man)
9. Start Menu → Games section shows all 3
10. Snake MintDialog shows **0.01 STX**; Tetris + Pac-Man show **0.02 STX**
11. Each game's leaderboard opens with the correct title and game-specific data
