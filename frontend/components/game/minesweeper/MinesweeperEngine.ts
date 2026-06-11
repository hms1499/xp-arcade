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
  return computeAdjacency({
    ...state,
    grid,
    mines: positions.length,
    minesPlaced: true,
    status: "playing",
  });
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
  // Fisher-Yates partial shuffle to pick `mines` cells.
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
