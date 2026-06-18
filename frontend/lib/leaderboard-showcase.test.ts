import { describe, expect, it } from "vitest";
import {
  findPlayerRank,
  findTopTenChange,
  leaderboardGoal,
  rankRows,
  scoreRarity,
  shortPlayer,
  summarizeLeaderboard,
  sumPrizePoolUstx,
  topTenEntryHint,
} from "./leaderboard-showcase";
import type { GameId } from "@/lib/game-registry";

describe("leaderboard showcase helpers", () => {
  it("sorts rows descending and assigns ranks", () => {
    expect(
      rankRows([
        { player: "SP_B", score: 10 },
        { player: "SP_A", score: 40 },
      ]),
    ).toEqual([
      { player: "SP_A", score: 40, rank: 1 },
      { player: "SP_B", score: 10, rank: 2 },
    ]);
  });

  it("summarizes leader, top three, and cutoff", () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      player: `SP_${index}`,
      score: 100 - index,
    }));
    const summary = summarizeLeaderboard("snake", rows);
    expect(summary.leader?.score).toBe(100);
    expect(summary.topThree).toHaveLength(3);
    expect(summary.cutoff?.rank).toBe(10);
  });

  it("detects a new leader before other changes", () => {
    const change = findTopTenChange(
      [
        { player: "SP_A", score: 100 },
        { player: "SP_B", score: 90 },
      ],
      [
        { player: "SP_B", score: 120 },
        { player: "SP_C", score: 80 },
      ],
    );
    expect(change).toEqual({
      kind: "new-leader",
      player: "SP_B",
      score: 120,
      previousRank: 2,
    });
  });

  it("detects new top-ten entries", () => {
    const change = findTopTenChange(
      [{ player: "SP_A", score: 100 }],
      [
        { player: "SP_A", score: 100 },
        { player: "SP_B", score: 80 },
      ],
    );
    expect(change).toEqual({
      kind: "new-entry",
      player: "SP_B",
      score: 80,
      rank: 2,
    });
  });

  it("formats player labels and rarity bands", () => {
    expect(shortPlayer("SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV")).toBe(
      "SP2CM…13SV",
    );
    expect(scoreRarity(42)).toBe("Common");
    expect(scoreRarity(167)).toBe("Rare");
    expect(scoreRarity(500)).toBe("Epic");
    expect(scoreRarity(1000)).toBe("Legendary");
  });

  it("findPlayerRank returns the player's positional rank", () => {
    const rows = [
      { player: "SP_B", score: 10 },
      { player: "SP_A", score: 40 },
      { player: "SP_C", score: 25 },
    ];
    expect(findPlayerRank(rows, "SP_A")).toBe(1);
    expect(findPlayerRank(rows, "SP_C")).toBe(2);
    expect(findPlayerRank(rows, "SP_B")).toBe(3);
  });

  it("findPlayerRank returns null when the player is not on the board", () => {
    const rows = [{ player: "SP_A", score: 40 }];
    expect(findPlayerRank(rows, "SP_X")).toBeNull();
    expect(findPlayerRank([], "SP_A")).toBeNull();
  });

  it("findPlayerRank breaks ties the same way rankRows does", () => {
    // Equal scores: rankRows tie-breaks by player.localeCompare, so SP_A < SP_B.
    const rows = [
      { player: "SP_B", score: 50 },
      { player: "SP_A", score: 50 },
    ];
    expect(findPlayerRank(rows, "SP_A")).toBe(1);
    expect(findPlayerRank(rows, "SP_B")).toBe(2);
  });

  it("uses minesweeper time-based rarity thresholds", () => {
    // Match on-chain register-game: u9819 rare / u9909 epic / u9959 legend.
    expect(scoreRarity(9800, "minesweeper")).toBe("Common");
    expect(scoreRarity(9819, "minesweeper")).toBe("Rare");
    expect(scoreRarity(9909, "minesweeper")).toBe("Epic");
    expect(scoreRarity(9959, "minesweeper")).toBe("Legendary");
  });

  it("phrases minesweeper goal copy in seconds, not points", () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      player: `SP_${index}`,
      score: 9900 - index, // #10 cutoff = 9891
    }));
    expect(leaderboardGoal({ rows, playerBest: 9880, gameId: "minesweeper" }).primary).toBe(
      "Need 12s faster.",
    );
    expect(leaderboardGoal({ rows, playerBest: null, gameId: "minesweeper" }).primary).toBe(
      "Beat #10: 108s",
    );
  });

  it("phrases solitaire goal copy in real seconds, not score-point deltas", () => {
    // Solitaire score = round(720000 / winSeconds) is non-linear, so a score
    // delta is NOT a seconds delta. cutoff #10 = 4500 (160s); best = 4000 (180s)
    // → ~20s faster needed, not a 501-point gap.
    const rows = Array.from({ length: 10 }, (_, index) => ({
      player: `SP_${index}`,
      score: 4500 + index * 100, // #10 cutoff = 4500
    }));
    expect(
      leaderboardGoal({ rows, playerBest: 4000, gameId: "solitaire" }).primary,
    ).toBe("Need 20s faster.");
    expect(
      leaderboardGoal({ rows, score: 4000, gameId: "solitaire" }).secondary,
    ).toBe("Needs 20s faster to beat #10 (160s).");
  });

  it("builds player goal copy for open, cutoff, and ready states", () => {
    expect(leaderboardGoal({ rows: [] }).primary).toBe("Top-10 is open.");

    const rows = Array.from({ length: 10 }, (_, index) => ({
      player: `SP_${index}`,
      score: 100 - index,
    }));

    expect(leaderboardGoal({ rows, playerBest: null }).primary).toBe("Beat #10: 91");
    expect(leaderboardGoal({ rows, playerBest: 88 }).primary).toBe("Need 4 more points.");
    expect(leaderboardGoal({ rows, playerBest: 95 }).primary).toBe("Your best is top-10 ready.");
    expect(leaderboardGoal({ rows, score: 92 }).topTenReady).toBe(true);
    expect(leaderboardGoal({ rows, score: 10 }).secondary).toBe(
      "Needs 82 more points to beat #10 (91).",
    );
  });
});

// Keys are irrelevant to the sum; cast a plain object for the test.
function pools(obj: Record<string, number | null>) {
  return obj as Record<GameId, number | null>;
}

describe("sumPrizePoolUstx", () => {
  it("sums non-null pools", () => {
    expect(sumPrizePoolUstx(pools({ a: 1_000_000, b: 2_500_000 }))).toBe(3_500_000);
  });

  it("ignores null pools", () => {
    expect(sumPrizePoolUstx(pools({ a: 1_000_000, b: null }))).toBe(1_000_000);
  });

  it("returns null when every pool is null", () => {
    expect(sumPrizePoolUstx(pools({ a: null, b: null }))).toBe(null);
  });
});

describe("leaderboard-showcase solitaire", () => {
  it("uses solitaire rarity thresholds (2400/4000/6000)", () => {
    expect(scoreRarity(2399, "solitaire")).toBe("Common");
    expect(scoreRarity(2400, "solitaire")).toBe("Rare");
    expect(scoreRarity(4000, "solitaire")).toBe("Epic");
    expect(scoreRarity(6000, "solitaire")).toBe("Legendary");
  });

  it("phrases the solitaire gap in win-time, not points", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      player: `P${i}`,
      score: 5000 - i * 100,
    }));
    const goal = leaderboardGoal({ rows, score: 1000, gameId: "solitaire" });
    expect(goal.secondary).not.toContain("point");
  });
});

describe("topTenEntryHint", () => {
  it("frames the gap in points for points games", () => {
    expect(topTenEntryHint("snake", 91, 88)).toBe(
      "You need 4 more points than your current best to enter top 10.",
    );
    expect(topTenEntryHint("snake", 91, 91)).toBe(
      "You need 1 more point than your current best to enter top 10.",
    );
  });

  it("frames the gap in real seconds for time-based games", () => {
    // minesweeper: 9880 = 119s, cutoff 9891 = 108s -> 12s faster
    expect(topTenEntryHint("minesweeper", 9891, 9880)).toBe(
      "You need to finish 12s faster than your current best to enter top 10.",
    );
    // solitaire: 4000 = 180s, cutoff 4500 = 160s -> 20s faster
    expect(topTenEntryHint("solitaire", 4500, 4000)).toBe(
      "You need to finish 20s faster than your current best to enter top 10.",
    );
  });

  it("says the best is already enough when it clears the cutoff", () => {
    expect(topTenEntryHint("snake", 91, 100)).toBe(
      "Your current best is enough to enter; mint a qualifying run to update your row.",
    );
  });

  it("handles missing cutoff and unknown best", () => {
    expect(topTenEntryHint("snake", null, 50)).toBe(
      "Any minted score will enter this leaderboard.",
    );
    expect(topTenEntryHint("snake", 91, null)).toBe(
      "Current best could not be read.",
    );
  });
});
