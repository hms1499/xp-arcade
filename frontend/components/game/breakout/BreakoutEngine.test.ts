import { describe, expect, it } from "vitest";
import {
  BALL_RADIUS,
  BREAKOUT_HEIGHT,
  BREAKOUT_WIDTH,
  PADDLE_WIDTH,
  createBreakoutState,
  tickBreakout,
  type BreakoutState,
} from "./BreakoutEngine";

describe("BreakoutEngine", () => {
  it("creates a ready game with bricks and three lives", () => {
    const s = createBreakoutState();
    expect(s.status).toBe("ready");
    expect(s.lives).toBe(3);
    expect(s.level).toBe(1);
    expect(s.score).toBe(0);
    expect(s.bricks.length).toBe(60);
    expect(s.ball.x).toBeCloseTo(s.paddleX + PADDLE_WIDTH / 2);
  });

  it("moves the paddle within board bounds", () => {
    const s = createBreakoutState();
    const left = tickBreakout({ ...s, paddleX: 1 }, { move: -1 }, 1000);
    const right = tickBreakout(
      { ...s, paddleX: BREAKOUT_WIDTH - PADDLE_WIDTH - 1 },
      { move: 1 },
      1000,
    );
    expect(left.paddleX).toBe(0);
    expect(right.paddleX).toBe(BREAKOUT_WIDTH - PADDLE_WIDTH);
  });

  it("launches from ready state", () => {
    const s = tickBreakout(createBreakoutState(), { move: 0, launch: true }, 16);
    expect(s.status).toBe("playing");
    expect(s.ball.vy).toBeLessThan(0);
    expect(Math.abs(s.ball.vx)).toBeGreaterThan(0);
  });

  it("removes a normal brick and adds score", () => {
    const s = createBreakoutState();
    const brick = s.bricks.find((b) => b.kind === "normal")!;
    const state: BreakoutState = {
      ...s,
      status: "playing",
      ball: {
        x: brick.x + brick.width / 2,
        y: brick.y + brick.height + BALL_RADIUS - 1,
        vx: 0,
        vy: -220,
      },
    };
    const next = tickBreakout(state, { move: 0 }, 16);
    expect(next.bricks.length).toBe(s.bricks.length - 1);
    expect(next.score).toBe(brick.points);
    expect(next.stats.bricksDestroyed).toBe(1);
  });

  it("requires two hits for strong bricks", () => {
    const s = createBreakoutState();
    const brick = s.bricks.find((b) => b.kind === "strong")!;
    const state: BreakoutState = {
      ...s,
      status: "playing",
      ball: {
        x: brick.x + brick.width / 2,
        y: brick.y + brick.height + BALL_RADIUS - 1,
        vx: 0,
        vy: -220,
      },
    };
    const next = tickBreakout(state, { move: 0 }, 16);
    expect(next.bricks.length).toBe(s.bricks.length);
    expect(next.bricks.find((b) => b.id === brick.id)?.hp).toBe(1);
    expect(next.score).toBe(0);
  });

  it("loses a life when the ball falls below the board", () => {
    const s: BreakoutState = {
      ...createBreakoutState(),
      status: "playing",
      ball: { x: 100, y: BREAKOUT_HEIGHT + BALL_RADIUS + 1, vx: 0, vy: 200 },
    };
    const next = tickBreakout(s, { move: 0 }, 16);
    expect(next.status).toBe("lost-life");
    expect(next.lives).toBe(2);
    expect(next.stats.livesLost).toBe(1);
  });

  it("advances level with clear bonus when all bricks are destroyed", () => {
    const s = createBreakoutState();
    const brick = s.bricks.find((b) => b.kind === "normal")!;
    const state: BreakoutState = {
      ...s,
      status: "playing",
      bricks: [brick],
      ball: {
        x: brick.x + brick.width / 2,
        y: brick.y + brick.height + BALL_RADIUS - 1,
        vx: 0,
        vy: -220,
      },
    };
    const next = tickBreakout(state, { move: 0 }, 16);
    expect(next.status).toBe("won");
    expect(next.level).toBe(2);
    expect(next.stats.levelsCleared).toBe(1);
    expect(next.score).toBe(brick.points + 10 + s.lives * 5);
  });
});
