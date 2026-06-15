import { describe, it, expect } from "vitest";
import { computePlayerStats } from "@/lib/player-stats";
import { GAME_IDS } from "@/lib/game-registry";
import type { ScoreNft } from "@/lib/holdings";
import {
  evaluateAchievements,
  earnedCount,
  ACHIEVEMENTS,
} from "@/lib/achievements";

function nft(over: Partial<ScoreNft> = {}): ScoreNft {
  return { id: 1, gameId: "snake", image: "", name: "Snake", season: 1, ...over };
}

// n NFTs, all snake/season 1, unique ids → totalMints === n
function mints(n: number, over: Partial<ScoreNft> = {}): ScoreNft[] {
  return Array.from({ length: n }, (_, i) => nft({ id: i + 1, ...over }));
}

function evalFor(nfts: ScoreNft[]) {
  return evaluateAchievements(computePlayerStats(nfts));
}

function badge(nfts: ScoreNft[], id: string) {
  const b = evalFor(nfts).find((a) => a.id === id);
  if (!b) throw new Error(`no badge ${id}`);
  return b;
}

describe("evaluateAchievements", () => {
  it("empty player: nothing earned, every current 0", () => {
    const list = evalFor([]);
    expect(earnedCount(list)).toBe(0);
    expect(list.every((a) => a.current === 0)).toBe(true);
    expect(list.length).toBe(ACHIEVEMENTS.length);
  });

  it("first-mint flips at 1 mint", () => {
    expect(badge([], "first-mint").earned).toBe(false);
    expect(badge(mints(1), "first-mint").earned).toBe(true);
  });

  it("count milestones flip at their boundaries", () => {
    expect(badge(mints(9), "getting-started").earned).toBe(false);
    expect(badge(mints(10), "getting-started").earned).toBe(true);
    expect(badge(mints(49), "dedicated").earned).toBe(false);
    expect(badge(mints(50), "dedicated").earned).toBe(true);
    expect(badge(mints(99), "centurion").earned).toBe(false);
    expect(badge(mints(100), "centurion").earned).toBe(true);
  });

  it("current is capped at target", () => {
    const b = badge(mints(150), "centurion");
    expect(b.earned).toBe(true);
    expect(b.current).toBe(100);
  });

  it("arcade-complete needs a mint in every game", () => {
    const all = GAME_IDS.map((g, i) => nft({ id: i + 1, gameId: g }));
    const missingOne = GAME_IDS.slice(0, -1).map((g, i) =>
      nft({ id: i + 1, gameId: g }),
    );
    expect(badge(all, "arcade-complete").earned).toBe(true);
    const locked = badge(missingOne, "arcade-complete");
    expect(locked.earned).toBe(false);
    expect(locked.current).toBe(GAME_IDS.length - 1);
  });

  it("season milestones flip at their boundaries", () => {
    const seasons = (n: number) =>
      Array.from({ length: n }, (_, i) => nft({ id: i + 1, season: i + 1 }));
    expect(badge(seasons(2), "seasoned").earned).toBe(false);
    expect(badge(seasons(3), "seasoned").earned).toBe(true);
    expect(badge(seasons(4), "veteran").earned).toBe(false);
    expect(badge(seasons(5), "veteran").earned).toBe(true);
  });

  it("earnedCount counts earned badges", () => {
    expect(earnedCount(evalFor(mints(1)))).toBe(1);
  });
});

import { evaluateAchievements } from "./achievements";
// Reuse the existing test's stats factory if present; otherwise build a minimal
// PlayerStats via computePlayerStats([]) (an empty NFT list = all-zero stats).
import { computePlayerStats } from "./player-stats";

describe("streak milestone achievements", () => {
  const zero = computePlayerStats([]);

  it("earns streak badges at 7 / 30 / 100 best-streak", () => {
    const list = evaluateAchievements(zero, { bestStreak: 100 });
    const ids = list.filter((a) => a.earned).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["streak-7", "streak-30", "streak-100"]));
  });

  it("leaves streak badges unearned below their target and when extra omitted", () => {
    const some = evaluateAchievements(zero, { bestStreak: 10 });
    const byId = Object.fromEntries(some.map((a) => [a.id, a]));
    expect(byId["streak-7"].earned).toBe(true);
    expect(byId["streak-30"].earned).toBe(false);

    const none = evaluateAchievements(zero);
    expect(none.find((a) => a.id === "streak-7")!.earned).toBe(false);
  });
});
