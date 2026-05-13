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

  it("direction-lock prevents 180-degree reversal", () => {
    const g = createGame({ gridSize: 10, seed: 1 });
    g.turn("left");
    g.tick();
    expect(g.state.snake[0].x).toBeGreaterThan(5);
  });
});
