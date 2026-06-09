import { describe, expect, it } from "vitest";
import { mergeWithFallback } from "./useLeaderboardShowcase";

describe("mergeWithFallback", () => {
  it("updates games with a fresh value", () => {
    const prev = { snake: 1, tetris: 2, pacman: 3, breakout: 4 };
    const next = mergeWithFallback(prev, [
      ["snake", 10],
      ["tetris", 20],
      ["pacman", 30],
      ["breakout", 40],
    ]);
    expect(next).toEqual({ snake: 10, tetris: 20, pacman: 30, breakout: 40 });
  });

  it("keeps the previous value when the fresh value is null (failed read)", () => {
    const prev = { snake: 1, tetris: 2, pacman: 3, breakout: 4 };
    const next = mergeWithFallback(prev, [
      ["snake", 10],
      ["tetris", null],
      ["pacman", 30],
      ["breakout", null],
    ]);
    expect(next).toEqual({ snake: 10, tetris: 2, pacman: 30, breakout: 4 });
  });
});
