export type TetrominoType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

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
  board: number[][];
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

export function createTetrisState(): TetrisState {
  const type = randomType();
  return {
    board: emptyBoard(),
    current: { type, rotation: 0, x: 3, y: 0 },
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
  return { type, rotation: 0, x: 3, y: 0 };
}

function lockAndAdvance(state: TetrisState): TetrisState {
  const locked = lockPiece(state.board, state.current);
  const { board, cleared } = clearLines(locked);
  const newLines = state.lines + cleared;
  const newLevel = Math.floor(newLines / 10) + 1;
  const newScore = state.score + LINE_SCORES[Math.min(cleared, 4)] * state.level;
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
