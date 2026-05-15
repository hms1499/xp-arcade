import { describe, it, expect } from "vitest";
import { computePlayerStats, ustxToStx } from "./player-stats";

describe("computePlayerStats", () => {
  it("returns zeroed stats for empty holdings", () => {
    expect(computePlayerStats([])).toEqual({
      totalMints: 0,
      bestScore: 0,
      totalScore: 0,
      rarityCounts: {},
      seasonsPlayed: 0,
      mintFeesUstx: 0,
    });
  });

  it("aggregates across multiple NFTs", () => {
    const stats = computePlayerStats([
      { id: 1, name: "a", image: "", score: 100, season: 1, rarity: "Common" },
      { id: 2, name: "b", image: "", score: 250, season: 1, rarity: "Rare" },
      { id: 3, name: "c", image: "", score: 50, season: 2, rarity: "Common" },
    ]);
    expect(stats.totalMints).toBe(3);
    expect(stats.bestScore).toBe(250);
    expect(stats.totalScore).toBe(400);
    expect(stats.rarityCounts).toEqual({ Common: 2, Rare: 1 });
    expect(stats.seasonsPlayed).toBe(2);
    expect(stats.mintFeesUstx).toBe(30_000);
  });

  it("tolerates missing numeric fields", () => {
    const stats = computePlayerStats([
      { id: 1, name: "a", image: "" },
      { id: 2, name: "b", image: "", score: 5 },
    ]);
    expect(stats.bestScore).toBe(5);
    expect(stats.seasonsPlayed).toBe(0);
  });
});

describe("ustxToStx", () => {
  it("formats whole STX cleanly", () => {
    expect(ustxToStx(1_000_000)).toBe("1");
    expect(ustxToStx(0)).toBe("0");
  });

  it("trims trailing zeros", () => {
    expect(ustxToStx(1_500_000)).toBe("1.5");
  });
});
