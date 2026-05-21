import { MAZE_LAYOUT, MAZE_ROWS, MAZE_COLS, isWall, countDots } from "./maze";

export type Direction = "up" | "down" | "left" | "right";
export type GhostMode = "scatter" | "chase" | "frightened";

export type Ghost = {
  id: number;
  row: number;
  col: number;
  dir: Direction;
  mode: GhostMode;
  frightTimer: number;
};

export type PacManState = {
  pacman: { row: number; col: number; dir: Direction };
  ghosts: Ghost[];
  maze: number[][];
  dotsRemaining: number;
  score: number;
  lives: number;
  gameOver: boolean;
  won: boolean;
  modeTimer: number;
  modePhase: number;
};

const SCATTER_TICKS = 210;
const CHASE_TICKS   = 600;
const FRIGHT_TICKS  = 180;
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
      mode: "scatter" as GhostMode,
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

function canMove(row: number, col: number, dir: Direction): boolean {
  const [dr, dc] = DIRS[dir];
  const nr = row + dr;
  const nc = col + dc;
  if (nc < 0 || nc >= MAZE_COLS) return true; // tunnel
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
  if (canMove(ghost.row, ghost.col, ghost.dir)) return ghost.dir;
  const valid = options.filter(
    (d) => d !== OPPOSITE[ghost.dir] && canMove(ghost.row, ghost.col, d)
  );
  if (valid.length === 0) return OPPOSITE[ghost.dir];
  return valid[Math.floor(Math.random() * valid.length)];
}

function moveGhost(ghost: Ghost, pacman: { row: number; col: number }): Ghost {
  const effectiveMode = ghost.frightTimer > 0 ? "frightened" : ghost.mode;
  let dir: Direction;

  if (effectiveMode === "frightened") {
    const options: Direction[] = ["up", "down", "left", "right"];
    const valid = options.filter(
      (d) => d !== OPPOSITE[ghost.dir] && canMove(ghost.row, ghost.col, d)
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

function resetPositions(state: PacManState): PacManState {
  return {
    ...state,
    pacman: { ...PACMAN_START, dir: "left" },
    ghosts: GHOST_STARTS.map((pos, id) => ({
      id,
      ...pos,
      dir: "up" as Direction,
      mode: "scatter" as GhostMode,
      frightTimer: 0,
    })),
    modeTimer: SCATTER_TICKS,
    modePhase: 0,
  };
}

export function movePacMan(state: PacManState, dir: Direction): PacManState {
  if (state.gameOver || state.won) return state;

  let { pacman, maze, score, dotsRemaining, lives, ghosts } = state;

  // Check collision at current position (ghost already on pac-man)
  for (const g of ghosts) {
    const result = checkCollision(pacman, g);
    if (result === "die") {
      const newLives = lives - 1;
      if (newLives <= 0) return { ...state, lives: 0, gameOver: true };
      return resetPositions({ ...state, lives: newLives });
    }
  }

  let newRow = pacman.row;
  let newCol = pacman.col;
  if (canMove(pacman.row, pacman.col, dir)) {
    const [dr, dc] = DIRS[dir];
    newRow = pacman.row + dr;
    newCol = pacman.col + dc;
    [newRow, newCol] = wrap(newRow, newCol);
  }
  const newPacman = { row: newRow, col: newCol, dir };

  const newMaze = maze.map((row) => [...row]);
  let frightened = false;
  const cell = newMaze[newRow]?.[newCol];
  if (cell === 1) {
    newMaze[newRow][newCol] = 3;
    score += 1;
    dotsRemaining -= 1;
  } else if (cell === 2) {
    newMaze[newRow][newCol] = 3;
    score += 5;
    dotsRemaining -= 1;
    frightened = true;
  }

  let newGhosts = frightened
    ? ghosts.map((g) => ({ ...g, frightTimer: FRIGHT_TICKS }))
    : ghosts;

  let newLives = lives;
  let ghostScoreBonus = 0;
  let died = false;
  newGhosts = newGhosts.map((g) => {
    const result = checkCollision(newPacman, g);
    if (result === "eat") {
      ghostScoreBonus += 20;
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
    return resetPositions({ ...state, score, lives: newLives, maze: newMaze, dotsRemaining });
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
