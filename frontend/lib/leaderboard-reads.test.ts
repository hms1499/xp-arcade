import { describe, it, expect } from "vitest";
import { readGameLeaderboard, type Readers } from "./leaderboard-reads";

const ok: Readers = {
  topTen: async () => [{ player: "SP1", score: 5 }],
  currentSeason: async () => 1,
  prizePool: async () => 1000,
  seasonEndBlock: async () => 8470355,
};

describe("readGameLeaderboard", () => {
  it("returns all four fields on success", async () => {
    const r = await readGameLeaderboard("snake", ok);
    expect(r).toEqual({
      topTen: [{ player: "SP1", score: 5 }],
      currentSeason: 1,
      prizePool: 1000,
      seasonEndBlock: 8470355,
    });
  });

  it("falls back per field on failure (null, and [] for topTen)", async () => {
    const partial: Readers = {
      ...ok,
      currentSeason: async () => {
        throw new Error("boom");
      },
      topTen: async () => {
        throw new Error("boom");
      },
    };
    const r = await readGameLeaderboard("snake", partial);
    expect(r.topTen).toEqual([]);
    expect(r.currentSeason).toBeNull();
    expect(r.prizePool).toBe(1000);
    expect(r.seasonEndBlock).toBe(8470355);
  });
});
