import { describe, it, expect } from "vitest";
import { computePlayerStats } from "@/lib/player-stats";
import type { ScoreNft } from "@/lib/holdings";
import {
  XP_BASE,
  cumulativeXpToReach,
  levelForXp,
  levelTitle,
  computeLevel,
} from "@/lib/level";

function statsWithScore(total: number) {
  const nft: ScoreNft = {
    id: 1,
    gameId: "snake",
    image: "",
    name: "Snake",
    season: 1,
    score: total,
  };
  return computePlayerStats([nft]);
}

describe("xp/level curve", () => {
  it("XP_BASE is 100", () => {
    expect(XP_BASE).toBe(100);
  });

  it("cumulativeXpToReach follows 100*(L-1)^2", () => {
    expect(cumulativeXpToReach(1)).toBe(0);
    expect(cumulativeXpToReach(5)).toBe(1600);
    expect(cumulativeXpToReach(10)).toBe(8100);
  });

  it("levelForXp maps xp to level at the right boundaries", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(1599)).toBe(4);
    expect(levelForXp(1600)).toBe(5);
    expect(levelForXp(8100)).toBe(10);
  });

  it("levelForXp clamps non-positive xp to level 1", () => {
    expect(levelForXp(-50)).toBe(1);
  });

  it("levelTitle bands", () => {
    expect(levelTitle(1)).toBe("Rookie");
    expect(levelTitle(4)).toBe("Rookie");
    expect(levelTitle(5)).toBe("Player");
    expect(levelTitle(10)).toBe("Pro");
    expect(levelTitle(20)).toBe("Veteran");
    expect(levelTitle(30)).toBe("Arcade Legend");
    expect(levelTitle(100)).toBe("Arcade Legend");
  });
});

describe("computeLevel", () => {
  it("derives level info from totalScore", () => {
    const info = computeLevel(statsWithScore(8100));
    expect(info.xp).toBe(8100);
    expect(info.level).toBe(10);
    expect(info.title).toBe("Pro");
    expect(info.xpIntoLevel).toBe(0);
    expect(info.xpForNextLevel).toBe(1900);
    expect(info.progress).toBe(0);
  });

  it("mid-level progress is between 0 and 1 with a positive denominator", () => {
    const info = computeLevel(statsWithScore(9340));
    expect(info.level).toBe(10);
    expect(info.xpIntoLevel).toBe(1240);
    expect(info.xpForNextLevel).toBe(1900);
    expect(info.xpForNextLevel).toBeGreaterThan(0);
    expect(info.progress).toBeCloseTo(1240 / 1900, 6);
  });

  it("zero score is level 1 at 0 progress", () => {
    const info = computeLevel(statsWithScore(0));
    expect(info.level).toBe(1);
    expect(info.xpIntoLevel).toBe(0);
    expect(info.progress).toBe(0);
    expect(info.xpForNextLevel).toBeGreaterThan(0);
  });
});
