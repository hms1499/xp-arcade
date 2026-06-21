import { describe, it, expect } from "vitest";
import { formatScore, formatScoreValue } from "./score-format";

describe("score-format", () => {
  it("renders every game's score as the raw on-chain number", () => {
    expect(formatScore("snake", 400)).toBe("400");
    expect(formatScoreValue("breakout", 123)).toBe("123");
  });

  it("shows minesweeper and solitaire as plain numbers, higher = better", () => {
    // The stored value stays the encoded score (a higher number is a faster
    // result); it is now displayed verbatim, exactly like the points games.
    expect(formatScore("minesweeper", 9952)).toBe("9952");
    expect(formatScoreValue("minesweeper", 9952)).toBe("9952");
    expect(formatScore("solitaire", 6000)).toBe("6000");
    expect(formatScoreValue("solitaire", 6000)).toBe("6000");
  });
});
