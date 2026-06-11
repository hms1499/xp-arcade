import { describe, it, expect } from "vitest";
import { formatScore, formatScoreValue } from "./score-format";

describe("score-format", () => {
  it("passes other games through unchanged", () => {
    expect(formatScore("snake", 400)).toBe("400");
    expect(formatScoreValue("breakout", 123)).toBe("123");
  });

  it("renders minesweeper score as elapsed time", () => {
    // score = 9999 - seconds  ->  seconds = 9999 - score
    expect(formatScore("minesweeper", 9952)).toBe("Cleared in 47s");
    expect(formatScoreValue("minesweeper", 9952)).toBe("47s");
  });

  it("clamps minesweeper seconds at 0 for a perfect/forged score", () => {
    expect(formatScoreValue("minesweeper", 9999)).toBe("0s");
    expect(formatScoreValue("minesweeper", 10050)).toBe("0s");
  });

  it("clamps minesweeper seconds for a score of 0", () => {
    expect(formatScoreValue("minesweeper", 0)).toBe("9999s");
  });
});
