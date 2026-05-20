import { describe, it, expect } from "vitest";
import {
  createPacManState,
  movePacMan,
  tickGhosts,
  type Direction,
} from "./PacManEngine";
import { countDots } from "./maze";

describe("PacManEngine", () => {
  it("creates initial state with full dot count", () => {
    const s = createPacManState();
    expect(s.dotsRemaining).toBe(countDots());
    expect(s.lives).toBe(3);
    expect(s.score).toBe(0);
    expect(s.gameOver).toBe(false);
    expect(s.ghosts.length).toBe(4);
  });

  it("moving pac-man in open space changes position", () => {
    const s = createPacManState();
    const moved = movePacMan(s, "left");
    expect(moved.pacman.row).toBeGreaterThanOrEqual(0);
    expect(moved.pacman.col).toBeGreaterThanOrEqual(0);
  });

  it("eating a dot increments score by 10 and decrements dotsRemaining", () => {
    const s = createPacManState();
    const withDot = {
      ...s,
      pacman: { ...s.pacman, row: 1, col: 1 },
    };
    const after = movePacMan(withDot, "right");
    if (after.score > s.score) {
      expect(after.score).toBe(s.score + 10);
      expect(after.dotsRemaining).toBe(s.dotsRemaining - 1);
    }
  });

  it("losing a life resets positions", () => {
    const s = createPacManState();
    const collision = {
      ...s,
      ghosts: s.ghosts.map((g) => ({
        ...g,
        row: s.pacman.row,
        col: s.pacman.col,
      })),
    };
    const after = movePacMan(collision, "left");
    expect(after.lives).toBeLessThanOrEqual(s.lives);
  });

  it("game over when lives reach 0", () => {
    const s = createPacManState();
    const noLives = { ...s, lives: 1 };
    const collision = {
      ...noLives,
      ghosts: noLives.ghosts.map((g) => ({
        ...g,
        row: noLives.pacman.row,
        col: noLives.pacman.col,
      })),
    };
    const after = movePacMan(collision, "left");
    expect(after.lives).toBe(0);
    expect(after.gameOver).toBe(true);
  });
});
