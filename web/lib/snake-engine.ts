export type Direction = "up" | "down" | "left" | "right";
export type Cell = { x: number; y: number };

export type GameState = {
  snake: Cell[];
  food: Cell;
  direction: Direction;
  score: number;
  gameOver: boolean;
  gridSize: number;
};

export type Game = {
  state: GameState;
  tick: () => void;
  turn: (d: Direction) => void;
};

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

function placeFood(rand: () => number, gridSize: number, snake: Cell[]): Cell {
  while (true) {
    const c = { x: Math.floor(rand() * gridSize), y: Math.floor(rand() * gridSize) };
    if (!snake.some((s) => s.x === c.x && s.y === c.y)) return c;
  }
}

export function createGame(opts: { gridSize: number; seed: number }): Game {
  const rand = rng(opts.seed);
  const center = Math.floor(opts.gridSize / 2);
  const snake: Cell[] = [{ x: center, y: center }];
  const state: GameState = {
    snake,
    food: placeFood(rand, opts.gridSize, snake),
    direction: "right",
    score: 0,
    gameOver: false,
    gridSize: opts.gridSize,
  };

  function turn(d: Direction) {
    if (d === OPPOSITE[state.direction]) return;
    state.direction = d;
  }

  function tick() {
    if (state.gameOver) return;
    const head = state.snake[0];
    const dx = state.direction === "left" ? -1 : state.direction === "right" ? 1 : 0;
    const dy = state.direction === "up" ? -1 : state.direction === "down" ? 1 : 0;
    const next = { x: head.x + dx, y: head.y + dy };
    if (next.x < 0 || next.y < 0 || next.x >= state.gridSize || next.y >= state.gridSize) {
      state.gameOver = true;
      return;
    }
    if (state.snake.some((s) => s.x === next.x && s.y === next.y)) {
      state.gameOver = true;
      return;
    }
    state.snake.unshift(next);
    if (next.x === state.food.x && next.y === state.food.y) {
      state.score += 1;
      state.food = placeFood(rand, state.gridSize, state.snake);
    } else {
      state.snake.pop();
    }
  }

  return { state, tick, turn };
}
