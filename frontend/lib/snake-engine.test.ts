import { describe, it, expect } from "vitest";
import { createGame } from "./snake-engine";

describe("snake-engine", () => {
  it("moves the snake one cell per tick in current direction (right by default)", () => {
    const g = createGame({ gridSize: 10, seed: 1 });
    const before = { ...g.state.snake[0] };
    g.tick();
    const after = g.state.snake[0];
    expect(after.x).toBe(before.x + 1);
    expect(after.y).toBe(before.y);
  });

  it("grows when head lands on food and increments score", () => {
    const g = createGame({ gridSize: 10, seed: 1 });
    g.state.food = { x: g.state.snake[0].x + 1, y: g.state.snake[0].y };
    const lenBefore = g.state.snake.length;
    g.tick();
    expect(g.state.snake.length).toBe(lenBefore + 1);
    expect(g.state.score).toBe(1);
  });

  it("game over on wall collision", () => {
    const g = createGame({ gridSize: 5, seed: 1 });
    while (!g.state.gameOver) g.tick();
    expect(g.state.gameOver).toBe(true);
  });

  it("game over on self collision", () => {
    const g = createGame({ gridSize: 10, seed: 1 });
    g.state.snake = [
      { x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 },
      { x: 3, y: 6 }, { x: 4, y: 6 }, { x: 5, y: 6 },
    ];
    g.state.direction = "up";
    g.tick();
    g.state.direction = "left";
    g.tick();
    g.state.direction = "down";
    g.tick();
    expect(g.state.gameOver).toBe(true);
  });

  it("allows moving into the tail cell when the tail moves away", () => {
    const g = createGame({ gridSize: 10, seed: 1 });
    g.state.snake = [
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 1 },
    ];
    g.state.food = { x: 8, y: 8 };
    g.state.direction = "right";
    g.tick();
    expect(g.state.gameOver).toBe(false);
    expect(g.state.snake[0]).toEqual({ x: 3, y: 1 });
    expect(g.state.snake).toHaveLength(4);
  });

  it("direction-lock prevents 180-degree reversal", () => {
    const g = createGame({ gridSize: 10, seed: 1 });
    g.turn("left");
    g.tick();
    expect(g.state.snake[0].x).toBeGreaterThan(5);
  });

  it("rejects a second turn that reverses into the snake within one tick", () => {
    const g = createGame({ gridSize: 10, seed: 1 });
    // Moving right with a body to the left of the head.
    g.state.snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }];
    g.state.direction = "right";
    // Valid 90° turn, then a turn that is 180° vs the *actual* heading.
    g.turn("up");
    g.turn("left");
    g.tick();
    expect(g.state.gameOver).toBe(false);
    expect(g.state.snake[0]).toEqual({ x: 5, y: 4 }); // moved up, not left into neck
  });

  it("ends the game as a win instead of hanging when the grid is full", () => {
    const g = createGame({ gridSize: 2, seed: 1 });
    // 2x2 = 4 cells: 3 body cells + food on the last free cell.
    g.state.snake = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    g.state.food = { x: 0, y: 1 };
    g.state.direction = "down";
    g.tick();
    expect(g.state.gameOver).toBe(true);
    expect(g.state.won).toBe(true);
  }, 1000);
});
