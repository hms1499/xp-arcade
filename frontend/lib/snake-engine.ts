export type Direction = "up" | "down" | "left" | "right";
export type Cell = { x: number; y: number };

export type GameState = {
  snake: Cell[];
  food: Cell;
  direction: Direction;
  score: number;
  gameOver: boolean;
  won: boolean;
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

function placeFood(
  rand: () => number,
  gridSize: number,
  snake: Cell[],
): Cell | null {
  const occupied = new Set(snake.map((s) => s.x * gridSize + s.y));
  const free: Cell[] = [];
  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) {
      if (!occupied.has(x * gridSize + y)) free.push({ x, y });
    }
  }
  if (free.length === 0) return null;
  return free[Math.floor(rand() * free.length)];
}

export function createGame(opts: { gridSize: number; seed: number }): Game {
  const rand = rng(opts.seed);
  const center = Math.floor(opts.gridSize / 2);
  const snake: Cell[] = [{ x: center, y: center }];
  const initialFood = placeFood(rand, opts.gridSize, snake);
  const state: GameState = {
    snake,
    food: initialFood ?? snake[0],
    direction: "right",
    score: 0,
    gameOver: initialFood === null,
    won: initialFood === null,
    gridSize: opts.gridSize,
  };

  // Queued turn applied at the next tick, so multiple key presses between
  // ticks can't chain into a 180° reversal against the actual heading.
  let pending: Direction | null = null;

  function turn(d: Direction) {
    if (d === OPPOSITE[state.direction]) return;
    pending = d;
  }

  function tick() {
    if (state.gameOver) return;
    if (pending && pending !== OPPOSITE[state.direction]) {
      state.direction = pending;
    }
    pending = null;
    const head = state.snake[0];
    const dx = state.direction === "left" ? -1 : state.direction === "right" ? 1 : 0;
    const dy = state.direction === "up" ? -1 : state.direction === "down" ? 1 : 0;
    const next = { x: head.x + dx, y: head.y + dy };
    if (next.x < 0 || next.y < 0 || next.x >= state.gridSize || next.y >= state.gridSize) {
      state.gameOver = true;
      return;
    }
    const willEat = next.x === state.food.x && next.y === state.food.y;
    const collisionBody = willEat ? state.snake : state.snake.slice(0, -1);
    if (collisionBody.some((s) => s.x === next.x && s.y === next.y)) {
      state.gameOver = true;
      return;
    }
    state.snake.unshift(next);
    if (willEat) {
      state.score += 1;
      const food = placeFood(rand, state.gridSize, state.snake);
      if (food === null) {
        state.won = true;
        state.gameOver = true;
      } else {
        state.food = food;
      }
    } else {
      state.snake.pop();
    }
  }

  return { state, tick, turn };
}
