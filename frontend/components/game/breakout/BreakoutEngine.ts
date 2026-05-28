export const BREAKOUT_WIDTH = 360;
export const BREAKOUT_HEIGHT = 480;
export const PADDLE_WIDTH = 70;
export const PADDLE_HEIGHT = 12;
export const BALL_RADIUS = 6;
export const BRICK_ROWS = 6;
export const BRICK_COLS = 10;
export const BRICK_GAP = 4;
export const BRICK_HEIGHT = 18;
export const BRICK_TOP = 46;
export const BRICK_LEFT = 16;
export const BRICK_WIDTH =
  (BREAKOUT_WIDTH - BRICK_LEFT * 2 - BRICK_GAP * (BRICK_COLS - 1)) / BRICK_COLS;

export type BreakoutStatus = "ready" | "playing" | "lost-life" | "game-over" | "won";
export type BreakoutBrickKind = "normal" | "strong" | "gold";

export type BreakoutBrick = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  kind: BreakoutBrickKind;
  points: number;
};

export type BreakoutBall = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export type BreakoutStats = {
  bricksDestroyed: number;
  maxCombo: number;
  livesLost: number;
  levelsCleared: number;
};

export type BreakoutState = {
  paddleX: number;
  ball: BreakoutBall;
  bricks: BreakoutBrick[];
  score: number;
  lives: number;
  level: number;
  combo: number;
  status: BreakoutStatus;
  stats: BreakoutStats;
};

export type BreakoutInput = {
  move: -1 | 0 | 1;
  launch?: boolean;
  paddleTargetX?: number;
};

function ballSpeed(level: number): number {
  return 270 + Math.min(5, level - 1) * 24;
}

function initialPaddleX() {
  return BREAKOUT_WIDTH / 2 - PADDLE_WIDTH / 2;
}

function attachedBall(paddleX: number, level: number): BreakoutBall {
  return {
    x: paddleX + PADDLE_WIDTH / 2,
    y: BREAKOUT_HEIGHT - 46,
    vx: 0,
    vy: -ballSpeed(level),
  };
}

function brickKindFor(level: number, row: number, col: number): BreakoutBrickKind {
  if (row === 0 && (col === 2 || col === 7)) return "gold";
  if ((row + level) % 3 === 0) return "strong";
  return "normal";
}

function makeBrick(level: number, row: number, col: number): BreakoutBrick {
  const kind = brickKindFor(level, row, col);
  const maxHp = kind === "strong" ? 2 : 1;
  const points = kind === "gold" ? 5 : kind === "strong" ? 2 : 1;
  return {
    id: `${level}-${row}-${col}`,
    x: BRICK_LEFT + col * (BRICK_WIDTH + BRICK_GAP),
    y: BRICK_TOP + row * (BRICK_HEIGHT + BRICK_GAP),
    width: BRICK_WIDTH,
    height: BRICK_HEIGHT,
    hp: maxHp,
    maxHp,
    kind,
    points,
  };
}

export function createBreakoutBricks(level = 1): BreakoutBrick[] {
  return Array.from({ length: BRICK_ROWS }, (_, row) =>
    Array.from({ length: BRICK_COLS }, (_, col) => makeBrick(level, row, col)),
  ).flat();
}

export function createBreakoutState(): BreakoutState {
  const paddleX = initialPaddleX();
  return {
    paddleX,
    ball: attachedBall(paddleX, 1),
    bricks: createBreakoutBricks(1),
    score: 0,
    lives: 3,
    level: 1,
    combo: 0,
    status: "ready",
    stats: {
      bricksDestroyed: 0,
      maxCombo: 0,
      livesLost: 0,
      levelsCleared: 0,
    },
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function launchBall(state: BreakoutState): BreakoutBall {
  const speed = ballSpeed(state.level);
  return {
    ...state.ball,
    vx: speed * 0.38,
    vy: -speed * 0.92,
  };
}

function resetForServe(state: BreakoutState, lives: number): BreakoutState {
  const paddleX = initialPaddleX();
  return {
    ...state,
    paddleX,
    ball: attachedBall(paddleX, state.level),
    lives,
    combo: 0,
    status: lives <= 0 ? "game-over" : "lost-life",
    stats: {
      ...state.stats,
      livesLost: state.stats.livesLost + 1,
    },
  };
}

function advanceLevel(state: BreakoutState): BreakoutState {
  const nextLevel = state.level + 1;
  const paddleX = initialPaddleX();
  const lifeBonus = state.lives * 5;
  return {
    ...state,
    paddleX,
    ball: attachedBall(paddleX, nextLevel),
    bricks: createBreakoutBricks(nextLevel),
    score: state.score + 10 + lifeBonus,
    level: nextLevel,
    combo: 0,
    status: "won",
    stats: {
      ...state.stats,
      levelsCleared: state.stats.levelsCleared + 1,
    },
  };
}

function hitBrick(state: BreakoutState, brick: BreakoutBrick): BreakoutState {
  const nextBricks = state.bricks.flatMap((b) => {
    if (b.id !== brick.id) return [b];
    const hp = b.hp - 1;
    return hp <= 0 ? [] : [{ ...b, hp }];
  });
  const destroyed = brick.hp <= 1;
  if (!destroyed) return { ...state, bricks: nextBricks };

  const combo = state.combo + 1;
  const comboBonus = combo % 5 === 0 ? 1 : 0;
  const next: BreakoutState = {
    ...state,
    bricks: nextBricks,
    combo,
    score: state.score + brick.points + comboBonus,
    stats: {
      ...state.stats,
      bricksDestroyed: state.stats.bricksDestroyed + 1,
      maxCombo: Math.max(state.stats.maxCombo, combo),
    },
  };
  return nextBricks.length === 0 ? advanceLevel(next) : next;
}

function intersectsBallBrick(ball: BreakoutBall, brick: BreakoutBrick): boolean {
  const closestX = clamp(ball.x, brick.x, brick.x + brick.width);
  const closestY = clamp(ball.y, brick.y, brick.y + brick.height);
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  return dx * dx + dy * dy <= BALL_RADIUS * BALL_RADIUS;
}

export function tickBreakout(
  state: BreakoutState,
  input: BreakoutInput,
  deltaMs: number,
): BreakoutState {
  if (state.status === "game-over") return state;

  const dt = Math.min(Math.max(deltaMs, 0), 50) / 1000;
  const paddleSpeed = 360 + state.level * 18;
  const rawPaddleX =
    input.paddleTargetX != null
      ? input.paddleTargetX - PADDLE_WIDTH / 2
      : state.paddleX + input.move * paddleSpeed * dt;
  const paddleX = clamp(rawPaddleX, 0, BREAKOUT_WIDTH - PADDLE_WIDTH);

  if (state.status !== "playing") {
    const served: BreakoutState = {
      ...state,
      paddleX,
      ball: attachedBall(paddleX, state.level),
      status: input.launch ? "playing" : state.status,
    };
    return input.launch ? { ...served, ball: launchBall(served) } : served;
  }

  let ball: BreakoutBall = {
    ...state.ball,
    x: state.ball.x + state.ball.vx * dt,
    y: state.ball.y + state.ball.vy * dt,
  };
  let next: BreakoutState = { ...state, paddleX, ball };

  if (ball.x <= BALL_RADIUS) {
    ball = { ...ball, x: BALL_RADIUS, vx: Math.abs(ball.vx) };
  } else if (ball.x >= BREAKOUT_WIDTH - BALL_RADIUS) {
    ball = { ...ball, x: BREAKOUT_WIDTH - BALL_RADIUS, vx: -Math.abs(ball.vx) };
  }
  if (ball.y <= BALL_RADIUS) {
    ball = { ...ball, y: BALL_RADIUS, vy: Math.abs(ball.vy) };
  }

  const paddleTop = BREAKOUT_HEIGHT - 34;
  const paddleHit =
    ball.vy > 0 &&
    ball.y + BALL_RADIUS >= paddleTop &&
    ball.y - BALL_RADIUS <= paddleTop + PADDLE_HEIGHT &&
    ball.x >= paddleX &&
    ball.x <= paddleX + PADDLE_WIDTH;
  if (paddleHit) {
    const speed = Math.hypot(ball.vx, ball.vy) || ballSpeed(state.level);
    const t = (ball.x - (paddleX + PADDLE_WIDTH / 2)) / (PADDLE_WIDTH / 2);
    const angle = t * (Math.PI / 3);
    ball = {
      x: ball.x,
      y: paddleTop - BALL_RADIUS - 1,
      vx: Math.sin(angle) * speed,
      vy: -Math.cos(angle) * speed,
    };
    next = { ...next, combo: 0 };
  }

  const brick = next.bricks.find((b) => intersectsBallBrick(ball, b));
  if (brick) {
    const fromSide =
      state.ball.x < brick.x ||
      state.ball.x > brick.x + brick.width;
    ball = fromSide ? { ...ball, vx: -ball.vx } : { ...ball, vy: -ball.vy };
    next = hitBrick({ ...next, ball }, brick);
  }

  if (ball.y - BALL_RADIUS > BREAKOUT_HEIGHT) {
    return resetForServe(next, state.lives - 1);
  }

  return { ...next, ball };
}
