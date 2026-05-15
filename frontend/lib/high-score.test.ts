import { describe, it, expect, beforeEach } from "vitest";
import { getBestScore, recordScore } from "./high-score";

describe("high-score", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns 0 when no score has been stored", () => {
    expect(getBestScore()).toBe(0);
  });

  it("persists a higher score and reports it as a new record", () => {
    const r = recordScore(7);
    expect(r).toEqual({ best: 7, isNewRecord: true });
    expect(getBestScore()).toBe(7);
  });

  it("does not lower the best for an equal or smaller score", () => {
    recordScore(10);
    expect(recordScore(10)).toEqual({ best: 10, isNewRecord: false });
    expect(recordScore(3)).toEqual({ best: 10, isNewRecord: false });
    expect(getBestScore()).toBe(10);
  });

  it("treats a corrupt stored value as 0", () => {
    localStorage.setItem("xp-snake:best-score", "not-a-number");
    expect(getBestScore()).toBe(0);
    expect(recordScore(1)).toEqual({ best: 1, isNewRecord: true });
  });
});
