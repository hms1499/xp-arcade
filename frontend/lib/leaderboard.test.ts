import { describe, expect, it } from "vitest";
import { isTopTenScore } from "./leaderboard";

describe("isTopTenScore", () => {
  it("accepts any score while leaderboard has open slots", () => {
    expect(isTopTenScore(0, [])).toBe(true);
    expect(isTopTenScore(1, [{ player: "a", score: 9 }])).toBe(true);
  });

  it("requires beating the lowest score when leaderboard is full", () => {
    const full = Array.from({ length: 10 }, (_, i) => ({
      player: String(i),
      score: i + 1,
    }));

    expect(isTopTenScore(1, full)).toBe(false);
    expect(isTopTenScore(2, full)).toBe(true);
  });
});
