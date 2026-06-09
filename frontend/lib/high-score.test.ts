import { describe, it, expect, beforeEach } from "vitest";
import { getBestScore, recordScore } from "./high-score";

describe("high-score", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns 0 when no score has been stored for that game", () => {
    expect(getBestScore("snake")).toBe(0);
    expect(getBestScore("tetris")).toBe(0);
  });

  it("persists a higher score and reports a new record", () => {
    expect(recordScore("snake", 7)).toEqual({ best: 7, isNewRecord: true });
    expect(getBestScore("snake")).toBe(7);
  });

  it("does not lower the best for an equal or smaller score", () => {
    recordScore("snake", 10);
    expect(recordScore("snake", 10)).toEqual({ best: 10, isNewRecord: false });
    expect(recordScore("snake", 3)).toEqual({ best: 10, isNewRecord: false });
    expect(getBestScore("snake")).toBe(10);
  });

  it("keeps best scores isolated per game", () => {
    recordScore("snake", 400);
    recordScore("tetris", 9000);
    expect(getBestScore("snake")).toBe(400);
    expect(getBestScore("tetris")).toBe(9000);
  });

  it("treats a corrupt stored value as 0", () => {
    localStorage.setItem("xp-arcade:best-score:snake", "not-a-number");
    expect(getBestScore("snake")).toBe(0);
    expect(recordScore("snake", 1)).toEqual({ best: 1, isNewRecord: true });
  });

  it("falls back to the legacy global key for snake only", () => {
    localStorage.setItem("xp-arcade:best-score", "42");
    expect(getBestScore("snake")).toBe(42);
    expect(getBestScore("tetris")).toBe(0);
  });
});
