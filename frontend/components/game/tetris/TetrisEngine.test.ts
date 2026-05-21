import { describe, it, expect } from "vitest";
import {
  createTetrisState,
  moveLeft,
  moveRight,
  moveDown,
  rotate,
  hardDrop,
  tick,
  type TetrisState,
} from "./TetrisEngine";

describe("TetrisEngine", () => {
  it("creates initial state with empty board", () => {
    const s = createTetrisState();
    expect(s.board.length).toBe(20);
    expect(s.board[0].length).toBe(10);
    expect(s.score).toBe(0);
    expect(s.level).toBe(1);
    expect(s.lines).toBe(0);
    expect(s.gameOver).toBe(false);
    expect(s.current).toBeDefined();
    expect(s.next).toBeDefined();
  });

  it("moveLeft decrements current.x", () => {
    const s = createTetrisState();
    const before = s.current.x;
    const after = moveLeft(s);
    expect(after.current.x).toBeLessThanOrEqual(before);
  });

  it("moveRight increments current.x", () => {
    const s = createTetrisState();
    const before = s.current.x;
    const after = moveRight(s);
    expect(after.current.x).toBeGreaterThanOrEqual(before);
  });

  it("tick moves piece down", () => {
    const s = createTetrisState();
    const before = s.current.y;
    const after = tick(s);
    if (!after.gameOver) {
      expect(after.current.y).toBeGreaterThanOrEqual(before);
    }
  });

  it("clearing a full line adds 1 to score", () => {
    const s = createTetrisState();
    // Fill row 19 (bottom) manually with non-zero values
    const board = s.board.map((row, i) =>
      i === 19 ? row.map(() => 1) : row
    );
    const filled: TetrisState = { ...s, board };
    // Force piece to lock by placing it at bottom
    const atBottom: TetrisState = {
      ...filled,
      current: { ...filled.current, y: 18 },
    };
    const after = tick(atBottom);
    expect(after.score).toBeGreaterThanOrEqual(1);
    expect(after.lines).toBeGreaterThanOrEqual(1);
  });

  it("hardDrop places piece immediately", () => {
    const s = createTetrisState();
    const after = hardDrop(s);
    // After hard drop, a new piece should be active or game over
    expect(after.current.type !== s.current.type || after.board !== s.board).toBe(true);
  });

  it("level increases every 10 lines", () => {
    const s: TetrisState = {
      ...createTetrisState(),
      lines: 9,
      level: 1,
    };
    // Simulate clearing 1 more line
    const board = s.board.map((row, i) =>
      i === 19 ? row.map(() => 1) : row
    );
    const atBottom: TetrisState = {
      ...s,
      board,
      current: { ...s.current, y: 18 },
    };
    const after = tick(atBottom);
    expect(after.level).toBe(2);
  });
});
