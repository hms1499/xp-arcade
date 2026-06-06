import {
  getSeasonPrizeForGame,
  hasClaimedPrizeForGame,
  computePayoutUstx,
  type SeasonPrize,
} from "./contract-calls";
import type { GameId } from "./game-registry";
import type { TxStatus } from "./tx-tracker";

export type ClaimOutcome = "confirmed" | "failed" | "pending";

/**
 * Map a claim transaction's on-chain status to a UI outcome. A claim moves real
 * STX via as-contract, so a post-condition abort (the deny-mode risk) must be
 * treated as a terminal failure — the caller restores the Claim button so the
 * player can retry instead of silently losing the prize.
 */
export function classifyClaimTx(status: TxStatus): ClaimOutcome {
  if (status === "success") return "confirmed";
  if (status === "pending") return "pending";
  return "failed";
}

export type Claim = { season: number; amountUstx: number };

export type FindClaimableDeps = {
  getSeasonPrize: (gameId: GameId, season: number) => Promise<SeasonPrize>;
  hasClaimed: (gameId: GameId, address: string, season: number) => Promise<boolean>;
  computePayout: (total: number, rank: number) => number;
};

const defaultDeps: FindClaimableDeps = {
  getSeasonPrize: getSeasonPrizeForGame,
  hasClaimed: hasClaimedPrizeForGame,
  computePayout: computePayoutUstx,
};

/**
 * Find every closed season (1 .. currentSeason-1) whose prize the player can
 * still claim. The contract allows claiming any past season forever, so the UI
 * must surface all of them, not just the immediately-previous one.
 *
 * Returns claims sorted ascending by season (oldest first) — matching the
 * contract's capped-pool payout, where earlier claimers draw from the pool
 * before it is drained.
 */
export async function findClaimablePrizes(
  gameId: GameId,
  address: string,
  currentSeason: number,
  deps: FindClaimableDeps = defaultDeps,
): Promise<Claim[]> {
  if (currentSeason <= 1) return [];

  const seasons = Array.from({ length: currentSeason - 1 }, (_, i) => i + 1);

  const results = await Promise.all(
    seasons.map(async (season): Promise<Claim | null> => {
      const prize = await deps.getSeasonPrize(gameId, season).catch(() => null);
      if (!prize || prize.total <= 0) return null;

      const mine = prize.topTen.find((e) => e.player === address);
      if (!mine) return null;

      const already = await deps
        .hasClaimed(gameId, address, season)
        .catch(() => true);
      if (already) return null;

      const rank = prize.topTen.filter((e) => e.score > mine.score).length + 1;
      return { season, amountUstx: deps.computePayout(prize.total, rank) };
    }),
  );

  return results.filter((c): c is Claim => c !== null);
}
