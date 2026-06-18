import { describe, expect, it } from "vitest";
import { playerLiveRanks, bestLiveRank, type LiveRanks } from "./player-ranks";
import { GAME_IDS, type GameId } from "./game-registry";
import type { LeaderboardSnapshot } from "./leaderboard-snapshot";

// Build a snapshot where each named game gets the given top-ten rows; all other
// games are empty boards.
function snapshotWith(
  boards: Partial<Record<GameId, { player: string; score: number }[]>>,
): LeaderboardSnapshot {
  const games = Object.fromEntries(
    GAME_IDS.map((id) => [
      id,
      {
        topTen: boards[id] ?? [],
        currentSeason: 1,
        prizePool: 0,
        seasonEndBlock: 0,
      },
    ]),
  ) as LeaderboardSnapshot["games"];
  return { updatedAt: "2026-06-18T00:00:00.000Z", games };
}

describe("player-ranks", () => {
  it("maps each game to the player's rank or null", () => {
    const snap = snapshotWith({
      snake: [
        { player: "SP_X", score: 100 },
        { player: "SP_ME", score: 90 },
      ],
      tetris: [{ player: "SP_OTHER", score: 50 }],
    });
    const ranks = playerLiveRanks(snap, "SP_ME");
    expect(ranks.snake).toBe(2);
    expect(ranks.tetris).toBeNull();
    expect(ranks.pacman).toBeNull();
  });

  it("returns null for every game when the address is nowhere", () => {
    const snap = snapshotWith({ snake: [{ player: "SP_X", score: 100 }] });
    const ranks = playerLiveRanks(snap, "SP_NOBODY");
    for (const id of GAME_IDS) expect(ranks[id]).toBeNull();
  });

  it("bestLiveRank picks the lowest rank number across games", () => {
    const ranks: LiveRanks = {
      snake: 3,
      tetris: 1,
      pacman: null,
      breakout: 5,
      minesweeper: null,
      solitaire: null,
    };
    expect(bestLiveRank(ranks)).toEqual({ gameId: "tetris", rank: 1 });
  });

  it("bestLiveRank returns null when the player is in no top-10", () => {
    const ranks: LiveRanks = {
      snake: null,
      tetris: null,
      pacman: null,
      breakout: null,
      minesweeper: null,
      solitaire: null,
    };
    expect(bestLiveRank(ranks)).toBeNull();
  });
});
