import { GAMES } from "./game-registry";
import type { GameId } from "./game-registry";
import type { ScoreNft } from "./holdings";

export type GamePlayerStats = {
  totalMints: number;
  bestScore: number;
  totalScore: number;
  seasonsPlayed: number;
  mintFeesUstx: number;
};

export type PlayerStats = {
  totalMints: number;
  bestScore: number;
  totalScore: number;
  rarityCounts: Record<string, number>;
  seasonsPlayed: number;
  mintFeesUstx: number;
  byGame: Record<GameId, GamePlayerStats>;
};

export function computePlayerStats(nfts: ScoreNft[]): PlayerStats {
  const seasons = new Set<number>();
  const rarityCounts: Record<string, number> = {};
  const byGame = Object.fromEntries(
    (Object.keys(GAMES) as GameId[]).map((id) => [
      id,
      {
        totalMints: 0,
        bestScore: 0,
        totalScore: 0,
        seasonsPlayed: 0,
        mintFeesUstx: 0,
      },
    ]),
  ) as Record<GameId, GamePlayerStats>;
  const gameSeasons: Record<GameId, Set<number>> = {
    snake: new Set(),
    tetris: new Set(),
    pacman: new Set(),
  };
  let bestScore = 0;
  let totalScore = 0;
  let mintFeesUstx = 0;

  for (const n of nfts) {
    const gameStats = byGame[n.gameId];
    gameStats.totalMints += 1;
    if (typeof n.score === "number") {
      totalScore += n.score;
      if (n.score > bestScore) bestScore = n.score;
      gameStats.totalScore += n.score;
      if (n.score > gameStats.bestScore) gameStats.bestScore = n.score;
    }
    if (typeof n.season === "number") {
      seasons.add(n.season);
      gameSeasons[n.gameId].add(n.season);
    }
    if (n.rarity) rarityCounts[n.rarity] = (rarityCounts[n.rarity] ?? 0) + 1;
    const fee = Number(GAMES[n.gameId].mintFeeUstx);
    mintFeesUstx += fee;
    gameStats.mintFeesUstx += fee;
  }

  for (const gameId of Object.keys(GAMES) as GameId[]) {
    byGame[gameId].seasonsPlayed = gameSeasons[gameId].size;
  }

  return {
    totalMints: nfts.length,
    bestScore,
    totalScore,
    rarityCounts,
    seasonsPlayed: seasons.size,
    mintFeesUstx,
    byGame,
  };
}

export function ustxToStx(ustx: number): string {
  return (ustx / 1_000_000).toFixed(6).replace(/\.?0+$/, "");
}
