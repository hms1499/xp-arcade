import type { ScoreNft } from "./holdings";

export type PlayerStats = {
  totalMints: number;
  bestScore: number;
  totalScore: number;
  rarityCounts: Record<string, number>;
  seasonsPlayed: number;
  mintFeesUstx: number;
};

const MINT_FEE_USTX = 10_000;

export function computePlayerStats(nfts: ScoreNft[]): PlayerStats {
  const seasons = new Set<number>();
  const rarityCounts: Record<string, number> = {};
  let bestScore = 0;
  let totalScore = 0;

  for (const n of nfts) {
    if (typeof n.score === "number") {
      totalScore += n.score;
      if (n.score > bestScore) bestScore = n.score;
    }
    if (typeof n.season === "number") seasons.add(n.season);
    if (n.rarity) rarityCounts[n.rarity] = (rarityCounts[n.rarity] ?? 0) + 1;
  }

  return {
    totalMints: nfts.length,
    bestScore,
    totalScore,
    rarityCounts,
    seasonsPlayed: seasons.size,
    mintFeesUstx: nfts.length * MINT_FEE_USTX,
  };
}

export function ustxToStx(ustx: number): string {
  return (ustx / 1_000_000).toFixed(6).replace(/\.?0+$/, "");
}
