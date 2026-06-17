import { describe, expect, it, vi } from "vitest";
import { GAME_IDS, type GameId } from "@/lib/game-registry";
import { mergeWithFallback } from "./useLeaderboardShowcase";

vi.mock("@/lib/leaderboard-snapshot", () => ({
  fetchLeaderboardSnapshot: vi.fn().mockResolvedValue({
    updatedAt: new Date().toISOString(),
    games: GAME_IDS.reduce((acc, g) => {
      acc[g] = { topTen: [{ player: "SP1", score: 7 }], currentSeason: 2, prizePool: 100, seasonEndBlock: 9 };
      return acc;
    }, {} as Record<string, unknown>),
  }),
}));

describe("mergeWithFallback", () => {
  it("updates games with a fresh value", () => {
    const prev = { snake: 1, tetris: 2, pacman: 3, breakout: 4, minesweeper: 5, solitaire: 6 };
    const next = mergeWithFallback(prev, [
      ["snake", 10],
      ["tetris", 20],
      ["pacman", 30],
      ["breakout", 40],
    ]);
    expect(next).toEqual({ snake: 10, tetris: 20, pacman: 30, breakout: 40, minesweeper: 5, solitaire: 6 });
  });

  it("keeps the previous value when the fresh value is null (failed read)", () => {
    const prev = { snake: 1, tetris: 2, pacman: 3, breakout: 4, minesweeper: 5, solitaire: 6 };
    const next = mergeWithFallback(prev, [
      ["snake", 10],
      ["tetris", null],
      ["pacman", 30],
      ["breakout", null],
    ]);
    expect(next).toEqual({ snake: 10, tetris: 2, pacman: 30, breakout: 4, minesweeper: 5, solitaire: 6 });
  });

  it("preserves initial/empty previous values for failed games", () => {
    const prev = { snake: [], tetris: [], pacman: [], breakout: [], minesweeper: [], solitaire: [] } as Record<
      GameId,
      number[]
    >;
    const next = mergeWithFallback(prev, [
      ["snake", [1, 2]],
      ["tetris", null],
      ["pacman", null],
      ["breakout", [3]],
    ]);
    expect(next).toEqual({ snake: [1, 2], tetris: [], pacman: [], breakout: [3], minesweeper: [], solitaire: [] });
  });
});
