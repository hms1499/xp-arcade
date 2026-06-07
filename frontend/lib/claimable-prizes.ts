import {
  getSeasonPrizeForGame,
  hasClaimedPrizeForGame,
  getClaimableAmount,
  isClaimOpen,
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

export type Claim = { season: number; amountUstx: number; claimOpen: boolean };

export type FindClaimableDeps = {
  getSeasonPrize: (gameId: GameId, season: number) => Promise<SeasonPrize>;
  hasClaimed: (gameId: GameId, address: string, season: number) => Promise<boolean>;
  getClaimableAmount: (gameId: GameId, season: number, address: string) => Promise<number>;
  isClaimOpen: (gameId: GameId, season: number) => Promise<boolean>;
};

const defaultDeps: FindClaimableDeps = {
  getSeasonPrize: getSeasonPrizeForGame,
  hasClaimed: hasClaimedPrizeForGame,
  getClaimableAmount,
  isClaimOpen,
};

/**
 * Find every closed season (1 .. currentSeason-1) whose prize the player can
 * still claim. The contract allows claiming any past season forever, so the UI
 * must surface all of them, not just the immediately-previous one.
 *
 * The payable amount is read straight from the chain (`get-claimable-amount`),
 * which already accounts for tie-aware rank splits and the remaining pool —
 * the frontend no longer recomputes it off-chain. Each claim also carries the
 * on-chain claim-window state (`is-claim-open`) so the UI can gate the button.
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

      const amountUstx = await deps
        .getClaimableAmount(gameId, season, address)
        .catch(() => 0);
      if (amountUstx <= 0) return null;

      const claimOpen = await deps
        .isClaimOpen(gameId, season)
        .catch(() => false);
      return { season, amountUstx, claimOpen };
    }),
  );

  return results.filter((c): c is Claim => c !== null);
}
