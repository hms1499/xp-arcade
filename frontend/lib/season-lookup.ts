import {
  getCurrentSeasonForGame,
  getTopTenForGame,
  getPrizePoolBalanceForGame,
  getSeasonPrizeForGame,
} from "@/lib/contract-calls";
import { rankRows } from "@/lib/leaderboard-showcase";
import { GAMES, type GameId } from "@/lib/game-registry";

export type SeasonRow = { player: string; score: number; rank: number };

export type SeasonLookup = {
  gameId: GameId;
  gameName: string;
  emoji: string;
  season: number;
  status: "live" | "closed";
  totalUstx: number;
  rows: SeasonRow[];
};

// Returns null for unknown / future / empty seasons. Network errors propagate
// so server callers can return 500 and crawlers retry (matches score-lookup.ts).
export async function fetchSeasonLookup(
  gameId: GameId,
  season: number,
): Promise<SeasonLookup | null> {
  if (!Number.isInteger(season) || season < 1) return null;

  const currentSeason = await getCurrentSeasonForGame(gameId);
  if (season > currentSeason) return null;

  let status: "live" | "closed";
  let totalUstx: number;
  let topTen: Array<{ player: string; score: number }>;

  if (season === currentSeason) {
    status = "live";
    const [rows, prizePool] = await Promise.all([
      getTopTenForGame(gameId),
      getPrizePoolBalanceForGame(gameId),
    ]);
    if (rows.length === 0) return null;
    topTen = rows;
    totalUstx = prizePool;
  } else {
    status = "closed";
    const prize = await getSeasonPrizeForGame(gameId, season);
    if (!prize || prize.topTen.length === 0) return null;
    topTen = prize.topTen;
    totalUstx = prize.total;
  }

  return {
    gameId,
    gameName: GAMES[gameId].label,
    emoji: GAMES[gameId].emoji,
    season,
    status,
    totalUstx,
    rows: rankRows(topTen),
  };
}
