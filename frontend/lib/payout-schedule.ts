import type { TopEntry } from "./contract-calls";

export type RankedPayout = TopEntry & {
  rank: number;
  payoutUstx: number;
};

// Rank-based payout: top 1-3 get 20% each, rank 4-10 get 4/70 each.
// The frontend admin uses row position after sorting so tied scores cannot
// multiply the payout pool.
export function computePayoutUstx(total: number, rank: number): number {
  if (rank <= 3) return Math.floor((total * 20) / 100);
  return Math.floor((total * 4) / 70);
}

export function buildPayoutRows(total: number, topTen: TopEntry[]): RankedPayout[] {
  return topTen
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.score - a.row.score || a.index - b.index)
    .map(({ row }, index) => {
      const rank = index + 1;
      return {
        ...row,
        rank,
        payoutUstx: computePayoutUstx(total, rank),
      };
    });
}
