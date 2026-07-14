export type SeasonCloseInput = {
  /** The on-chain deadline block for this game has been reached. */
  countdownReached: boolean;
  /** This browser already submitted a close for the same deadline block. */
  alreadyEnded: boolean;
  /** Current season's accumulated pool, in uSTX. `null` = unknown (read failed). */
  poolUstx: number | null;
  /** Entries in the current season's on-chain top-10. */
  topTenCount: number;
};

/**
 * Whether to offer the permissionless "End Season" button.
 *
 * `end-season` does not reset `season-end-block`, so a season that opens after a
 * close inherits the old (now past) deadline and reads as "reached" from block
 * one. Closing such a season snapshots an empty top-10 and an empty pool, then
 * rolls another season with the same stale deadline. Requiring the season to
 * hold something worth locking (fees or a ranked score) keeps that loop from
 * being one click away for every visitor.
 */
export function canOfferSeasonClose({
  countdownReached,
  alreadyEnded,
  poolUstx,
  topTenCount,
}: SeasonCloseInput): boolean {
  if (!countdownReached || alreadyEnded) return false;
  if (poolUstx === null) return false;
  return poolUstx > 0 || topTenCount > 0;
}
