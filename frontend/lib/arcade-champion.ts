import { GAME_IDS, type GameId } from "./game-registry";
import type { TopEntry } from "./contract-calls";
import { findPlayerRank } from "./leaderboard-showcase";

export type RowsByGame = Record<GameId, TopEntry[]>;

export type ChampionEntry = {
  player: string;
  points: number;
  ranks: Record<GameId, number | null>;
  firsts: number;
  /** Best (lowest) single rank across games; 11 = unranked sentinel (real ranks 1..10). */
  bestRank: number;
  gamesRanked: number;
};

/** Top-10 placement of rank r earns 11 - r points (#1=10 ... #10=1); else 0. */
export function rankPoints(rank: number): number {
  return rank >= 1 && rank <= 10 ? 11 - rank : 0;
}

/** Cross-game ranking from the per-game top-10 rows. Players not in any game's
 *  top-10 are excluded. Sorted: points desc -> firsts desc -> bestRank asc ->
 *  address (deterministic final tiebreak). Pure; no I/O. */
export function computeArcadeChampions(rows: RowsByGame): ChampionEntry[] {
  const players = new Set<string>();
  for (const id of GAME_IDS) {
    for (const entry of rows[id] ?? []) players.add(entry.player);
  }

  const entries: ChampionEntry[] = [];
  for (const player of players) {
    const ranks = {} as Record<GameId, number | null>;
    let points = 0;
    let firsts = 0;
    let bestRank = 11;
    let gamesRanked = 0;
    for (const id of GAME_IDS) {
      const rank = findPlayerRank(rows[id] ?? [], player);
      ranks[id] = rank;
      if (rank != null) {
        points += rankPoints(rank);
        gamesRanked += 1;
        if (rank === 1) firsts += 1;
        if (rank < bestRank) bestRank = rank;
      }
    }
    if (gamesRanked > 0) {
      entries.push({ player, points, ranks, firsts, bestRank, gamesRanked });
    }
  }

  entries.sort(
    (a, b) =>
      b.points - a.points ||
      b.firsts - a.firsts ||
      a.bestRank - b.bestRank ||
      a.player.localeCompare(b.player),
  );
  return entries;
}
