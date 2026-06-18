import { GAME_IDS, type GameId } from "./game-registry";
import { findPlayerRank } from "./leaderboard-showcase";
import type { LeaderboardSnapshot } from "./leaderboard-snapshot";

export type LiveRanks = Record<GameId, number | null>;

/** The player's current-season rank in every game (null where not ranked). */
export function playerLiveRanks(
  snapshot: LeaderboardSnapshot,
  address: string,
): LiveRanks {
  return Object.fromEntries(
    GAME_IDS.map((id) => [
      id,
      findPlayerRank(snapshot.games[id].topTen, address),
    ]),
  ) as LiveRanks;
}

/** The single best (lowest-number) live rank across all games, or null. */
export function bestLiveRank(
  ranks: LiveRanks,
): { gameId: GameId; rank: number } | null {
  let best: { gameId: GameId; rank: number } | null = null;
  for (const id of GAME_IDS) {
    const rank = ranks[id];
    if (rank == null) continue;
    if (!best || rank < best.rank) best = { gameId: id, rank };
  }
  return best;
}
