# Minesweeper (game id 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Minesweeper as the fifth XP Arcade game — a time-based board whose
fastest Intermediate wins mint Score NFTs and rank on the existing on-chain
`xp-arcade-v4` leaderboard.

**Architecture:** Pure `MinesweeperEngine` (rules, TDD, no React) + DOM/CSS-grid
`MinesweeperBoard` renderer + `MinesweeperWindow` that wires win/loss to the
shared mint flow. Time → score mapping `score = clamp(0, 9999 - seconds)` is
applied at win; all human-facing score rendering goes through a new
`lib/score-format.ts` so `9952` displays as `Cleared in 47s`. No contract change.

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5 / Zustand 5 / Vitest 3 /
98.css. Contract `xp-arcade-v4` (Clarity 3, live mainnet) unchanged.

**Reference spec:** `docs/superpowers/specs/2026-06-11-minesweeper-design.md`

**Working directory for all frontend commands:** `frontend/`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `frontend/lib/score-format.ts` | Pure score → human label (`formatScore` prose, `formatScoreValue` compact) | Create |
| `frontend/lib/score-format.test.ts` | Tests for the formatters | Create |
| `frontend/lib/game-registry.ts` | Add `minesweeper` (id 5) to the registry | Modify |
| `frontend/lib/game-registry.test.ts` | Assert 5 games incl. minesweeper | Modify |
| `frontend/lib/score-risk.ts` | Add `minesweeper` risk profile | Modify |
| `frontend/lib/score-risk.test.ts` | Assert minesweeper profile present | Create (or modify if exists) |
| `frontend/components/game/minesweeper/MinesweeperEngine.ts` | Pure rules: board, reveal, flag, win/loss | Create |
| `frontend/components/game/minesweeper/MinesweeperEngine.test.ts` | Engine unit tests | Create |
| `frontend/components/game/minesweeper/MinesweeperBoard.tsx` | DOM grid renderer | Create |
| `frontend/components/game/minesweeper/MinesweeperWindow.tsx` | Window shell + win/loss → mint | Create |
| `frontend/app/page.tsx` | Mount `<MinesweeperWindow />` | Modify |
| `frontend/components/shared/GameShellWindow.tsx` | Format the live score via `formatScoreValue` | Modify |
| `frontend/components/shared/SharedMintDialog.tsx` | Format score via `formatScore` | Modify |
| `frontend/components/windows/HighScoreWindow.tsx` | Format row scores | Modify |
| `frontend/components/windows/HallOfFameWindow.tsx` | Format leader/row scores | Modify |
| `frontend/components/desktop/DesktopLeaderboardShowcase.tsx` | Format leader/cutoff/slide scores | Modify |
| `frontend/components/desktop/LeaderboardTicker.tsx` | Format ticker score | Modify |
| `frontend/lib/metadata-route.ts` | Format score in name/description | Modify |
| `frontend/lib/metadata-svg.ts` | Format score on the NFT/OG card | Modify |
| `contract/deployments/xp-arcade-v4-register-minesweeper.mainnet-plan.yaml` | Owner-only on-chain register (NOT auto-run) | Create |
| `HANDOFF.md` | Note game 5 + remaining on-chain steps | Modify |

---

## Task 1: Score format helper (pure, TDD)

**Files:**
- Create: `frontend/lib/score-format.ts`
- Test: `frontend/lib/score-format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/score-format.test.ts
import { describe, it, expect } from "vitest";
import { formatScore, formatScoreValue } from "./score-format";

describe("score-format", () => {
  it("passes other games through unchanged", () => {
    expect(formatScore("snake", 400)).toBe("400");
    expect(formatScoreValue("breakout", 123)).toBe("123");
  });

  it("renders minesweeper score as elapsed time", () => {
    // score = 9999 - seconds  ->  seconds = 9999 - score
    expect(formatScore("minesweeper", 9952)).toBe("Cleared in 47s");
    expect(formatScoreValue("minesweeper", 9952)).toBe("47s");
  });

  it("clamps minesweeper seconds at 0 for a perfect/forged score", () => {
    expect(formatScoreValue("minesweeper", 9999)).toBe("0s");
    expect(formatScoreValue("minesweeper", 10050)).toBe("0s");
  });

  it("clamps minesweeper seconds for a score of 0", () => {
    expect(formatScoreValue("minesweeper", 0)).toBe("9999s");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run lib/score-format.test.ts`
Expected: FAIL — `Cannot find module './score-format'`.

- [ ] **Step 3: Write the implementation**

```ts
// frontend/lib/score-format.ts
import type { GameId } from "./game-registry";

/** seconds encoded inside a Minesweeper score (score = 9999 - seconds). */
export function minesweeperSeconds(score: number): number {
  return Math.min(9999, Math.max(0, 9999 - Math.floor(score)));
}

/** Full prose label for a score, e.g. "Cleared in 47s" or "400". */
export function formatScore(gameId: GameId, score: number): string {
  if (gameId === "minesweeper") return `Cleared in ${minesweeperSeconds(score)}s`;
  return String(score);
}

/** Compact value for tiles/leaderboards, e.g. "47s" or "400". */
export function formatScoreValue(gameId: GameId, score: number): string {
  if (gameId === "minesweeper") return `${minesweeperSeconds(score)}s`;
  return String(score);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run lib/score-format.test.ts`
Expected: PASS (4 tests). Note: `"minesweeper"` is not yet a `GameId`, so the
test file will show a TS error until Task 2. Vitest still runs (esbuild strips
types); if `npx tsc --noEmit` is run now it will error — that resolves in Task 2.

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/score-format.ts frontend/lib/score-format.test.ts
git commit -m "feat(minesweeper): score-format time helper"
```

---

## Task 2: Register Minesweeper in the game registry

**Files:**
- Modify: `frontend/lib/game-registry.ts`
- Test: `frontend/lib/game-registry.test.ts`

- [ ] **Step 1: Update the registry test to expect 5 games**

Open `frontend/lib/game-registry.test.ts`. Find the assertion(s) on
`GAME_IDS`/game count and extend them. Add this test block (adjust import if the
file already imports `GAMES`/`GAME_IDS`):

```ts
// frontend/lib/game-registry.test.ts  (add inside the existing describe)
import { GAMES, GAME_IDS } from "./game-registry";

it("registers minesweeper as game id 5", () => {
  expect(GAME_IDS).toContain("minesweeper");
  expect(GAMES.minesweeper.onchainId).toBe(5);
  expect(GAMES.minesweeper.label).toBe("Minesweeper");
  expect(GAMES.minesweeper.mintFeeUstx).toBe(BigInt(20_000));
  expect(GAMES.minesweeper.metaSegment).toBe("mines");
});
```

If an existing test hard-codes `GAME_IDS.length === 4` or lists the four ids,
update it to 5 and include `"minesweeper"`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run lib/game-registry.test.ts`
Expected: FAIL — `GAMES.minesweeper` is undefined / type error.

- [ ] **Step 3: Add `minesweeper` everywhere in `game-registry.ts`**

Edit `frontend/lib/game-registry.ts`:

3a. Extend the union:
```ts
export type GameId = "snake" | "tetris" | "pacman" | "breakout" | "minesweeper";
```

3b. Add the metadata row (inside `GAME_METADATA`, after the `breakout` line):
```ts
  minesweeper: { id: "minesweeper", label: "Minesweeper", emoji: "💣", onchainId: 5, mintFeeUstx: BigInt(20_000), metaSegment: "mines", nftAssetName: "xp-score" },
```

3c. Add to both network maps:
```ts
const GAME_CONTRACTS: Record<NetworkName, Record<GameId, GameConfig>> = {
  mainnet: { snake: SHARED_V4, tetris: SHARED_V4, pacman: SHARED_V4, breakout: SHARED_V4, minesweeper: SHARED_V4 },
  testnet: { snake: SHARED_V4, tetris: SHARED_V4, pacman: SHARED_V4, breakout: SHARED_V4, minesweeper: SHARED_V4 },
};
```

3d. Add to `GAME_IDS`:
```ts
export const GAME_IDS: GameId[] = ["snake", "tetris", "pacman", "breakout", "minesweeper"];
```

3e. Add the row to `buildGameRegistry`'s object passed to `validateGameRegistry`:
```ts
    breakout: { ...GAME_METADATA.breakout, ...contracts.breakout },
    minesweeper: { ...GAME_METADATA.minesweeper, ...contracts.minesweeper },
```

- [ ] **Step 4: Run the registry test to verify it passes**

Run: `cd frontend && npx vitest run lib/game-registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/game-registry.ts frontend/lib/game-registry.test.ts
git commit -m "feat(minesweeper): register game id 5 in registry"
```

---

## Task 3: Minesweeper risk profile

**Files:**
- Modify: `frontend/lib/score-risk.ts`
- Test: `frontend/lib/score-risk.test.ts` (create if absent)

`assessScoreRisk` indexes `PROFILES[gameId]`; a missing entry throws at runtime
(`useGameSession` calls it for every game). Add a minesweeper profile tuned for a
near-ceiling time score (honest scores live in ~9750–9999; a perfect 9999 is
suspicious, a sub-25s Intermediate clear is fast).

- [ ] **Step 1: Write/extend the failing test**

```ts
// frontend/lib/score-risk.test.ts
import { describe, it, expect } from "vitest";
import { assessScoreRisk } from "./score-risk";

describe("score-risk minesweeper", () => {
  it("does not throw and treats a normal time as low risk", () => {
    const r = assessScoreRisk({ gameId: "minesweeper", score: 9850, durationMs: 149_000 });
    expect(r.level).toBe("low");
  });

  it("flags a perfect 9999 (0-second win) as high risk", () => {
    const r = assessScoreRisk({ gameId: "minesweeper", score: 9999, durationMs: 200 });
    expect(r.level).toBe("high");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run lib/score-risk.test.ts`
Expected: FAIL — throws `Cannot read properties of undefined` (no minesweeper profile).

- [ ] **Step 3: Add the profile**

In `frontend/lib/score-risk.ts`, add to the `PROFILES` object after `breakout`:

```ts
  minesweeper: {
    practicalHigh: 9_990, // sub-9s Intermediate clear — unusual
    extreme: 9_999,       // a 0-second "win" is forged
    maxPerMinute: 1_000_000, // time score is not rate-based; effectively disable
    fastScore: 9_980,     // >=9980 (<=19s) paired with a tiny duration is suspicious
    minDurationMs: 20_000,
  },
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run lib/score-risk.test.ts`
Expected: PASS (2 tests). The `9999`/`200ms` case hits `score >= extreme` → high.

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/score-risk.ts frontend/lib/score-risk.test.ts
git commit -m "feat(minesweeper): score-risk profile"
```

---

## Task 4: MinesweeperEngine (pure rules, TDD)

**Files:**
- Create: `frontend/components/game/minesweeper/MinesweeperEngine.ts`
- Test: `frontend/components/game/minesweeper/MinesweeperEngine.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/components/game/minesweeper/MinesweeperEngine.test.ts
import { describe, it, expect } from "vitest";
import {
  DIFFICULTY_CONFIG,
  createMinesweeperState,
  placeMinesAt,
  reveal,
  toggleFlag,
  minesLeft,
} from "./MinesweeperEngine";

describe("MinesweeperEngine", () => {
  it("creates an unrevealed board sized to the difficulty", () => {
    const s = createMinesweeperState("intermediate");
    expect(s.rows).toBe(16);
    expect(s.cols).toBe(16);
    expect(s.mines).toBe(40);
    expect(s.status).toBe("ready");
    expect(s.minesPlaced).toBe(false);
    expect(s.grid.flat().every((c) => !c.revealed && !c.flagged)).toBe(true);
    expect(DIFFICULTY_CONFIG.expert).toEqual({ rows: 16, cols: 30, mines: 99 });
  });

  it("first reveal is never a mine (property over many trials)", () => {
    for (let i = 0; i < 60; i++) {
      const s = reveal(createMinesweeperState("beginner"), 4, 4);
      expect(s.grid[4][4].mine).toBe(false);
      expect(s.grid[4][4].revealed).toBe(true);
      expect(s.minesPlaced).toBe(true);
    }
  });

  it("flood-fills zero regions and computes adjacency", () => {
    // Beginner 9x9, single mine at (0,0). Reveal far corner (8,8).
    let s = placeMinesAt(createMinesweeperState("beginner"), [[0, 0]]);
    s = reveal(s, 8, 8);
    expect(s.status).toBe("playing");
    // (1,1) is adjacent to the (0,0) mine -> count 1, revealed by flood border.
    expect(s.grid[1][1].adjacent).toBe(1);
    expect(s.grid[1][1].revealed).toBe(true);
    // The mine itself stays hidden.
    expect(s.grid[0][0].revealed).toBe(false);
  });

  it("revealing a mine loses the game", () => {
    let s = placeMinesAt(createMinesweeperState("beginner"), [[0, 0]]);
    s = reveal(s, 0, 0);
    expect(s.status).toBe("lost");
    expect(s.grid[0][0].revealed).toBe(true);
  });

  it("revealing every non-mine cell wins the game", () => {
    let s = placeMinesAt(createMinesweeperState("beginner"), [[0, 0]]);
    // One reveal of the big empty area cascades to all non-mine cells here,
    // because the only mine is in a corner.
    s = reveal(s, 8, 8);
    expect(s.status).toBe("won");
  });

  it("toggleFlag flips a cell and tracks minesLeft", () => {
    let s = placeMinesAt(createMinesweeperState("beginner"), [[0, 0]]);
    expect(minesLeft(s)).toBe(1);
    s = toggleFlag(s, 0, 0);
    expect(s.grid[0][0].flagged).toBe(true);
    expect(minesLeft(s)).toBe(0);
    s = toggleFlag(s, 0, 0);
    expect(s.grid[0][0].flagged).toBe(false);
    expect(minesLeft(s)).toBe(1);
  });

  it("ignores reveal of a flagged cell", () => {
    let s = placeMinesAt(createMinesweeperState("beginner"), [[0, 0]]);
    s = toggleFlag(s, 5, 5);
    s = reveal(s, 5, 5);
    expect(s.grid[5][5].revealed).toBe(false);
    expect(s.status).toBe("playing");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run components/game/minesweeper/MinesweeperEngine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the engine**

```ts
// frontend/components/game/minesweeper/MinesweeperEngine.ts
export type Difficulty = "beginner" | "intermediate" | "expert";
export type MineStatus = "ready" | "playing" | "won" | "lost";

export type Cell = {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacent: number; // 0-8, only meaningful once mines are placed
};

export type MinesweeperState = {
  difficulty: Difficulty;
  rows: number;
  cols: number;
  mines: number;
  grid: Cell[][];
  status: MineStatus;
  minesPlaced: boolean;
  flagsUsed: number;
};

export const DIFFICULTY_CONFIG: Record<
  Difficulty,
  { rows: number; cols: number; mines: number }
> = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 30, mines: 99 },
};

function blankGrid(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      adjacent: 0,
    })),
  );
}

export function createMinesweeperState(difficulty: Difficulty): MinesweeperState {
  const { rows, cols, mines } = DIFFICULTY_CONFIG[difficulty];
  return {
    difficulty,
    rows,
    cols,
    mines,
    grid: blankGrid(rows, cols),
    status: "ready",
    minesPlaced: false,
    flagsUsed: 0,
  };
}

function neighbors(state: MinesweeperState, r: number, c: number): [number, number][] {
  const out: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) out.push([nr, nc]);
    }
  }
  return out;
}

function computeAdjacency(state: MinesweeperState): MinesweeperState {
  const grid = state.grid.map((row) => row.map((cell) => ({ ...cell })));
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      grid[r][c].adjacent = neighbors(state, r, c).filter(
        ([nr, nc]) => grid[nr][nc].mine,
      ).length;
    }
  }
  return { ...state, grid };
}

/** Deterministic mine placement for tests. Marks mines placed + adjacency. */
export function placeMinesAt(
  state: MinesweeperState,
  positions: [number, number][],
): MinesweeperState {
  const grid = state.grid.map((row) => row.map((cell) => ({ ...cell, mine: false })));
  for (const [r, c] of positions) grid[r][c].mine = true;
  return computeAdjacency({ ...state, grid, minesPlaced: true, status: "playing" });
}

/** Random placement avoiding a safe zone (the clicked cell + its neighbors). */
function placeMinesRandom(
  state: MinesweeperState,
  safeR: number,
  safeC: number,
  rng: () => number,
): MinesweeperState {
  const safe = new Set<string>([`${safeR},${safeC}`]);
  for (const [nr, nc] of neighbors(state, safeR, safeC)) safe.add(`${nr},${nc}`);

  const candidates: [number, number][] = [];
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (!safe.has(`${r},${c}`)) candidates.push([r, c]);
    }
  }
  // Fisher–Yates partial shuffle to pick `mines` cells.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return placeMinesAt(state, candidates.slice(0, state.mines));
}

function countRevealedNonMines(state: MinesweeperState): number {
  let n = 0;
  for (const row of state.grid) for (const cell of row) if (cell.revealed && !cell.mine) n++;
  return n;
}

function floodReveal(state: MinesweeperState, r: number, c: number): MinesweeperState {
  const grid = state.grid.map((row) => row.map((cell) => ({ ...cell })));
  const stack: [number, number][] = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop()!;
    const cell = grid[cr][cc];
    if (cell.revealed || cell.flagged) continue;
    cell.revealed = true;
    if (cell.adjacent === 0 && !cell.mine) {
      for (const [nr, nc] of neighbors({ ...state, grid }, cr, cc)) {
        if (!grid[nr][nc].revealed) stack.push([nr, nc]);
      }
    }
  }
  return { ...state, grid };
}

export function reveal(
  state: MinesweeperState,
  r: number,
  c: number,
  rng: () => number = Math.random,
): MinesweeperState {
  if (state.status === "won" || state.status === "lost") return state;

  let base = state;
  if (!state.minesPlaced) base = placeMinesRandom(state, r, c, rng);

  if (base.grid[r][c].flagged || base.grid[r][c].revealed) return base;

  if (base.grid[r][c].mine) {
    const grid = base.grid.map((row) => row.map((cell) => ({ ...cell })));
    grid[r][c].revealed = true;
    return { ...base, grid, status: "lost" };
  }

  const next = floodReveal(base, r, c);
  const totalNonMines = next.rows * next.cols - next.mines;
  const status: MineStatus =
    countRevealedNonMines(next) === totalNonMines ? "won" : "playing";
  return { ...next, status };
}

export function toggleFlag(state: MinesweeperState, r: number, c: number): MinesweeperState {
  if (state.status === "won" || state.status === "lost") return state;
  if (state.grid[r][c].revealed) return state;
  const grid = state.grid.map((row) => row.map((cell) => ({ ...cell })));
  const cell = grid[r][c];
  cell.flagged = !cell.flagged;
  return {
    ...state,
    grid,
    flagsUsed: state.flagsUsed + (cell.flagged ? 1 : -1),
  };
}

export function minesLeft(state: MinesweeperState): number {
  return state.mines - state.flagsUsed;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run components/game/minesweeper/MinesweeperEngine.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/game/minesweeper/MinesweeperEngine.ts frontend/components/game/minesweeper/MinesweeperEngine.test.ts
git commit -m "feat(minesweeper): pure game engine"
```

---

## Task 5: MinesweeperBoard (DOM grid renderer)

**Files:**
- Create: `frontend/components/game/minesweeper/MinesweeperBoard.tsx`

No new test (presentational); covered by the typecheck/build in Task 9.

- [ ] **Step 1: Implement the board component**

```tsx
// frontend/components/game/minesweeper/MinesweeperBoard.tsx
"use client";
import type { Cell, MinesweeperState } from "./MinesweeperEngine";

const NUMBER_COLORS: Record<number, string> = {
  1: "#0000ff", 2: "#008000", 3: "#ff0000", 4: "#000080",
  5: "#800000", 6: "#008080", 7: "#000000", 8: "#808080",
};

function cellFace(cell: Cell): { text: string; color: string } {
  if (cell.flagged && !cell.revealed) return { text: "🚩", color: "#000" };
  if (!cell.revealed) return { text: "", color: "#000" };
  if (cell.mine) return { text: "💣", color: "#000" };
  if (cell.adjacent === 0) return { text: "", color: "#000" };
  return { text: String(cell.adjacent), color: NUMBER_COLORS[cell.adjacent] ?? "#000" };
}

export function MinesweeperBoard({
  state,
  onReveal,
  onFlag,
  disabled = false,
}: {
  state: MinesweeperState;
  onReveal: (r: number, c: number) => void;
  onFlag: (r: number, c: number) => void;
  disabled?: boolean;
}) {
  const CELL = state.cols > 20 ? 18 : 22; // shrink Expert to fit
  return (
    <div
      role="grid"
      aria-label="Minesweeper board"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${state.cols}, ${CELL}px)`,
        gap: 0,
        background: "#bdbdbd",
        border: "3px solid",
        borderColor: "#7b7b7b #fff #fff #7b7b7b",
        width: "max-content",
        margin: "0 auto",
        userSelect: "none",
      }}
    >
      {state.grid.map((row, r) =>
        row.map((cell, c) => {
          const face = cellFace(cell);
          const sunken = cell.revealed;
          return (
            <button
              key={`${r}-${c}`}
              role="gridcell"
              disabled={disabled}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (!disabled) onReveal(r, c);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!disabled) onFlag(r, c);
              }}
              style={{
                width: CELL,
                height: CELL,
                padding: 0,
                fontSize: CELL > 18 ? 13 : 11,
                fontWeight: "bold",
                lineHeight: `${CELL}px`,
                fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
                color: face.color,
                background: "#bdbdbd",
                border: sunken ? "1px solid #7b7b7b" : "2px solid",
                borderColor: sunken
                  ? "#7b7b7b"
                  : "#fff #7b7b7b #7b7b7b #fff",
                cursor: disabled ? "default" : "pointer",
              }}
            >
              {face.text}
            </button>
          );
        }),
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck the new file**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors from `MinesweeperBoard.tsx` (other files may still error
until Task 6/7 — that's fine; this step only confirms the board compiles).

- [ ] **Step 3: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/game/minesweeper/MinesweeperBoard.tsx
git commit -m "feat(minesweeper): board renderer"
```

---

## Task 6: MinesweeperWindow (win/loss → mint wiring)

**Files:**
- Create: `frontend/components/game/minesweeper/MinesweeperWindow.tsx`

Behaviour:
- Difficulty selector; default **intermediate**. Only intermediate is ranked.
- Timer starts on the first reveal; live score = `9999 - elapsedSeconds`.
- **Win on intermediate** → `handleGameOver(score)` → `SharedMintDialog`.
- **Win on beginner/expert** → in-window "practice win" panel, no mint.
- **Loss** → in-window "boom" panel + Play Again, no mint.
- Right-click flags; a **🚩 Flag mode** toggle supports touch (tap = flag while on).

- [ ] **Step 1: Implement the window**

```tsx
// frontend/components/game/minesweeper/MinesweeperWindow.tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { GameShellWindow } from "@/components/shared/GameShellWindow";
import { SharedMintDialog } from "@/components/shared/SharedMintDialog";
import { useGameSession } from "@/hooks/useGameSession";
import {
  type Difficulty,
  createMinesweeperState,
  minesLeft,
  reveal,
  toggleFlag,
} from "./MinesweeperEngine";
import { MinesweeperBoard } from "./MinesweeperBoard";

const RANKED: Difficulty = "intermediate";
const clampScore = (sec: number) => Math.min(9999, Math.max(0, 9999 - sec));

export function MinesweeperWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "game-minesweeper"));
  const close = useWindows((s) => s.close);
  const { finalScore, showMint, isTopScore, riskReport, handleGameOver, handlePlayAgain } =
    useGameSession("minesweeper");

  const [difficulty, setDifficulty] = useState<Difficulty>(RANKED);
  const [game, setGame] = useState(() => createMinesweeperState(RANKED));
  const [flagMode, setFlagMode] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const submittedRef = useRef(false);

  // Live timer while playing.
  useEffect(() => {
    if (game.status !== "playing") return;
    const id = window.setInterval(() => {
      if (startedAtRef.current != null) {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [game.status]);

  // On a ranked win, submit the score once.
  useEffect(() => {
    if (game.status === "won" && difficulty === RANKED && !submittedRef.current) {
      submittedRef.current = true;
      const sec =
        startedAtRef.current != null
          ? Math.floor((Date.now() - startedAtRef.current) / 1000)
          : elapsed;
      void handleGameOver(clampScore(sec));
    }
  }, [game.status, difficulty, elapsed, handleGameOver]);

  const newGame = useCallback((d: Difficulty) => {
    setGame(createMinesweeperState(d));
    setElapsed(0);
    startedAtRef.current = null;
    submittedRef.current = false;
  }, []);

  const onReveal = useCallback(
    (r: number, c: number) => {
      if (flagMode) {
        setGame((g) => toggleFlag(g, r, c));
        return;
      }
      setGame((g) => {
        if (!g.minesPlaced) startedAtRef.current = Date.now();
        return reveal(g, r, c);
      });
    },
    [flagMode],
  );

  const onFlag = useCallback((r: number, c: number) => {
    setGame((g) => toggleFlag(g, r, c));
  }, []);

  if (!w) return null;

  const liveScore = clampScore(elapsed);
  const lost = game.status === "lost";
  const practiceWin = game.status === "won" && difficulty !== RANKED;

  return (
    <GameShellWindow gameId="minesweeper" score={liveScore}>
      {showMint ? (
        <SharedMintDialog
          gameId="minesweeper"
          score={finalScore}
          isTopScore={isTopScore}
          riskReport={riskReport}
          onClose={() => close(w.id)}
          onPlayAgain={() => {
            handlePlayAgain();
            newGame(difficulty);
          }}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: 11,
              fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
            }}
          >
            <label>
              Level{" "}
              <select
                value={difficulty}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const d = e.target.value as Difficulty;
                  setDifficulty(d);
                  newGame(d);
                }}
              >
                <option value="beginner">Beginner 9×9</option>
                <option value="intermediate">Intermediate 16×16 (ranked)</option>
                <option value="expert">Expert 16×30</option>
              </select>
            </label>
            <span>💣 {minesLeft(game)}</span>
            <span>⏱ {elapsed}s</span>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setFlagMode((f) => !f);
              }}
              style={{ fontWeight: flagMode ? "bold" : "normal" }}
            >
              🚩 Flag {flagMode ? "ON" : "OFF"}
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                newGame(difficulty);
              }}
            >
              🙂 New
            </button>
          </div>

          {difficulty !== RANKED && (
            <div style={{ fontSize: 10, color: "#8a5a00" }}>
              Practice — only Intermediate is ranked &amp; mintable.
            </div>
          )}

          <MinesweeperBoard
            state={game}
            onReveal={onReveal}
            onFlag={onFlag}
            disabled={lost || game.status === "won"}
          />

          {lost && (
            <div style={{ textAlign: "center", fontSize: 12 }}>
              <div style={{ fontWeight: "bold", color: "#aa0000" }}>💥 Boom!</div>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  newGame(difficulty);
                }}
              >
                Play Again
              </button>
            </div>
          )}

          {practiceWin && (
            <div style={{ textAlign: "center", fontSize: 12 }}>
              <div style={{ fontWeight: "bold", color: "#007700" }}>
                Cleared in {elapsed}s — practice run (not ranked)
              </div>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setDifficulty(RANKED);
                  newGame(RANKED);
                }}
              >
                Play Ranked (Intermediate)
              </button>
            </div>
          )}
        </div>
      )}
    </GameShellWindow>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors from `MinesweeperWindow.tsx` (page mount comes in Task 7).

- [ ] **Step 3: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/game/minesweeper/MinesweeperWindow.tsx
git commit -m "feat(minesweeper): window with win/loss mint wiring"
```

---

## Task 7: Mount the window

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Add the import**

After the `BreakoutWindow` import line (`app/page.tsx:6`):
```tsx
import { MinesweeperWindow } from "@/components/game/minesweeper/MinesweeperWindow";
```

- [ ] **Step 2: Mount the component**

After `<BreakoutWindow />` (`app/page.tsx:21`):
```tsx
        <MinesweeperWindow />
```

- [ ] **Step 3: Verify the dev server renders the game**

Run: `cd frontend && npm run build`
Expected: build succeeds. (Manual: `npm run dev`, boot the desktop, the Start
menu / desktop now shows 💣 Minesweeper; opening it shows the 16×16 board.)

- [ ] **Step 4: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/app/page.tsx
git commit -m "feat(minesweeper): mount window on desktop"
```

---

## Task 8: Route score display through the formatter

Wire `formatScore` (prose) / `formatScoreValue` (compact) into every surface that
prints a raw score, so Minesweeper shows time, not a points number. Leaderboard
**ordering stays by raw `score`** — only labels change.

**Files & exact edits:**

- [ ] **Step 1: GameShellWindow live score + player best**

`frontend/components/shared/GameShellWindow.tsx`
- Add import near the top imports:
```tsx
import { formatScoreValue } from "@/lib/score-format";
```
- Replace `Score: <b>{score}</b>` with:
```tsx
Score: <b>{formatScoreValue(gameId, score)}</b>
```
- Replace `Your best <b>{goalState.playerBest}</b>` with:
```tsx
Your best <b>{formatScoreValue(gameId, goalState.playerBest)}</b>
```

- [ ] **Step 2: SharedMintDialog**

`frontend/components/shared/SharedMintDialog.tsx`
- Add import:
```tsx
import { formatScore } from "@/lib/score-format";
```
- Find where the score number is shown to the user (the headline score, e.g.
  `Your score: {score}` or a `<b>{score}</b>` in the dialog body) and wrap it:
```tsx
{formatScore(gameId, score)}
```
  (Search the file for `{score}` in JSX; replace the human-facing display only —
  do NOT change the `score` passed to `mintScoreForGame(gameId, score, …)` or
  `startMintTx(gameId, tx, score)`; those must stay the raw on-chain integer.)

- [ ] **Step 3: HighScoreWindow rows + cutoff**

`frontend/components/windows/HighScoreWindow.tsx`
- Add import:
```tsx
import { formatScoreValue } from "@/lib/score-format";
```
- In the leaderboard row render, replace the printed `{row.score}` / `{r.score}`
  (the table cell value) with `{formatScoreValue(gameId, row.score)}`.
- If a `#10 cutoff {cutoff}` style string prints `cutoff.score`, wrap it:
  `{formatScoreValue(gameId, cutoff.score)}`. Keep the `cutoff = rows[9].score`
  numeric comparison untouched.

- [ ] **Step 4: HallOfFameWindow**

`frontend/components/windows/HallOfFameWindow.tsx`
- Add import:
```tsx
import { formatScoreValue } from "@/lib/score-format";
```
- The Hall of Fame iterates per game; within each game block a `gameId` is in
  scope. Replace `{leader.score}` (line ~193) and `{row.score}` (line ~281) with
  `{formatScoreValue(gameId, leader.score)}` and
  `{formatScoreValue(gameId, row.score)}`. If the local variable is named
  differently (e.g. `game.id`), use that. Keep `scoreRarity(leader.score)` calls
  on the raw number.

- [ ] **Step 5: DesktopLeaderboardShowcase**

`frontend/components/desktop/DesktopLeaderboardShowcase.tsx`
- Add import:
```tsx
import { formatScoreValue } from "@/lib/score-format";
```
- Line ~138 `{leader ? leader.score : "—"}` →
  `{leader ? formatScoreValue(gameId, leader.score) : "—"}`.
- Line ~200 `#10 cutoff ${cutoff.score}` →
  `#10 cutoff ${formatScoreValue(gameId, cutoff.score)}` (template string).
- Line ~254 `{slide.entry.score}` → `{formatScoreValue(slide.gameId, slide.entry.score)}`
  (the slide carries `gameId` — see line ~226 `GAMES[slide.gameId]`).

- [ ] **Step 6: LeaderboardTicker**

`frontend/components/desktop/LeaderboardTicker.tsx`
- Add import:
```tsx
import { formatScoreValue } from "@/lib/score-format";
```
- Line ~19 replace `${leader.score}` in the template with
  `${formatScoreValue(gameId, leader.score)}` (the map has `gameId` in scope).

- [ ] **Step 7: Metadata route name/description**

`frontend/lib/metadata-route.ts`
- Add import:
```tsx
import { formatScore } from "@/lib/score-format";
```
- Replace the `description` string `... game score: ${data.score}.` with:
```tsx
description: `On-chain proof of a ${data.gameName} result: ${formatScore(data.gameId, data.score)}.`,
```
  (`data.gameId` exists on `ScoreLookup`.) Leave `name` as `#${tokenId}`.

- [ ] **Step 8: Metadata SVG card**

`frontend/lib/metadata-svg.ts`
- Extend `scoreSvg`'s argument type to accept the game id and format the big
  value. Change the signature object to add `gameId?: GameId` and import the
  type + formatter:
```tsx
import type { GameId } from "@/lib/game-registry";
import { formatScoreValue } from "@/lib/score-format";
```
- In `scoreSvg`, compute the display string and shrink the font for non-numeric
  values. Replace the big `<text … font-size="140" …>${o.score}</text>` line:
```tsx
  const display = o.gameId ? formatScoreValue(o.gameId, o.score) : String(o.score);
  const bigFont = display.length > 4 ? 96 : 140;
```
  and use `font-size="${bigFont}"` and `>${escapeXml(display)}<` in that text node.
- Update the caller in `metadata-route.ts` `scoreSvg({ … })` to pass
  `gameId: data.gameId`.
- Check other `scoreSvg`/`scoreCardImage` callers (e.g. `ShareScoreCard`,
  `DesktopLeaderboardShowcase` line ~245 `scoreCardImage(slide.entry, game.label)`)
  — pass the game id through if those helpers render the score; if `scoreCardImage`
  wraps `scoreSvg`, thread `gameId` to keep cards correct.

- [ ] **Step 9: Verify formatting end-to-end**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: clean. Manual sanity: `npm run dev`, open High Scores → Minesweeper
tab shows times like `47s`; other games still show plain numbers.

- [ ] **Step 10: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/shared/GameShellWindow.tsx \
  frontend/components/shared/SharedMintDialog.tsx \
  frontend/components/windows/HighScoreWindow.tsx \
  frontend/components/windows/HallOfFameWindow.tsx \
  frontend/components/desktop/DesktopLeaderboardShowcase.tsx \
  frontend/components/desktop/LeaderboardTicker.tsx \
  frontend/lib/metadata-route.ts frontend/lib/metadata-svg.ts
git commit -m "feat(minesweeper): show time-based scores in all leaderboards"
```

---

## Task 9: Full verification

**Files:** none (gate before done).

- [ ] **Step 1: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 3: Unit tests**

Run: `cd frontend && npm test`
Expected: all pass, including the new engine / format / registry / risk tests.

- [ ] **Step 4: Production build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual smoke (record result, do not fake)**

`cd frontend && npm run dev`, then in the browser:
- Desktop + Start menu show 💣 Minesweeper.
- Open it → 16×16 board, mine counter 40, timer ticks on first reveal.
- Lose (hit a mine) → "💥 Boom" + Play Again, NO mint dialog.
- Switch to Beginner, win → "practice run (not ranked)", NO mint dialog.
- Win on Intermediate → SharedMintDialog opens showing `Cleared in Ns` and the
  0.02 STX fee (wallet mint itself is part of the live-wallet smoke, HANDOFF §2).

- [ ] **Step 6: Commit (if any lint/tsc fixups were needed)**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add -A frontend
git commit -m "chore(minesweeper): verification fixups" || echo "nothing to commit"
```

---

## Task 10: On-chain registration plan + handoff (NOT executed here)

The on-chain calls are **owner-only, permanent, and cost real STX**. This task
only *prepares* them; running them happens later with the deployer wallet when
the user is ready (per spec §9). Do NOT broadcast.

**Files:**
- Create: `contract/deployments/xp-arcade-v4-register-minesweeper.mainnet-plan.yaml`
- Modify: `HANDOFF.md`

- [ ] **Step 1: Write the Clarinet registration plan**

```yaml
# contract/deployments/xp-arcade-v4-register-minesweeper.mainnet-plan.yaml
id: 0
name: XP Arcade v4 register Minesweeper (mainnet)
network: mainnet
stacks-node: https://api.hiro.so
bitcoin-node: http://blockstack:blockstacksystem@bitcoin.blockstack.com:8332
plan:
  batches:
  - id: 0
    transactions:
    - transaction-type: contract-call
      contract-id: SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4
      expected-sender: SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV
      method: register-game
      parameters:
      - u5
      - '"Minesweeper"'
      - u20000
      - u9819
      - u9909
      - u9959
      cost: 20000
    - transaction-type: contract-call
      contract-id: SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4
      expected-sender: SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV
      method: set-season-end-block
      parameters:
      - u5
      - u8470355
      cost: 10000
```

> The deadline block `u8470355` is the shared `H` already used by games 1–4
> (`xp-arcade-v4-set-season-end-block.mainnet-plan.yaml`). Confirm it is still the
> current value on-chain before running; if the season has rolled, use the
> current shared block instead.

- [ ] **Step 2: Note the remaining steps in HANDOFF**

In `HANDOFF.md`, under the "To-do for next session" area, add:
```markdown
### Minesweeper (game id 5) — built, awaiting on-chain register
- [x] Frontend game + score-time display + tests (committed).
- [ ] Owner runs `contract/deployments/xp-arcade-v4-register-minesweeper.mainnet-plan.yaml`
      with the deployer wallet (`-p <plan> -d --no-dashboard`). **Permanent:**
      fee u20000, rarity u9819/u9909/u9959.
- [ ] Redeploy frontend; extend `npm run health:production` to assert game 5 has
      a pool + top-10 + endBlock.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add contract/deployments/xp-arcade-v4-register-minesweeper.mainnet-plan.yaml HANDOFF.md
git commit -m "docs(minesweeper): on-chain register plan + handoff note"
```

---

## Self-Review notes (already reconciled against the spec)

- **D1/D2 (3 levels, ranked = Intermediate):** Task 6 difficulty selector +
  `RANKED` gating; practice wins don't mint.
- **D3 (score = clamp(0, 9999 − sec)):** `clampScore` in Task 6, inverse in
  Task 1 `minesweeperSeconds`.
- **D4 (only wins mint):** Task 6 loss branch never calls `handleGameOver`.
- **D5/D6 (fee + rarity permanent):** Task 10 YAML `u20000 / u9819 / u9909 / u9959`.
- **D7 (identity):** Task 2 registry row (id 5, 💣, `mines`).
- **§5 cross-cutting display:** Task 8 covers shell, mint dialog, High Score,
  Hall of Fame, showcase, ticker, metadata route + SVG.
- **§6 score-risk must not throw:** Task 3 adds the profile.
- **§7 tests:** Tasks 1–4 are TDD; Task 9 runs the full gate (tsc/lint/test/build).
- **No contract change:** confirmed — only Task 10 prepares owner-only calls.
- **Type consistency:** `MinesweeperState`/`Cell`/`Difficulty`/`reveal`/
  `toggleFlag`/`minesLeft`/`placeMinesAt` names identical across Tasks 4–6;
  `formatScore`/`formatScoreValue`/`minesweeperSeconds` identical across Tasks 1 & 8.
```
