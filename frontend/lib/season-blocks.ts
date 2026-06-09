// Measured mainnet cadence (2026-06-08): ~10,944 stacks blocks/day ≈ 7.9 s/block.
// Single source of truth for converting a stacks-block-height delta into wall time.
export const AVG_STACKS_BLOCK_SECONDS = 7.9;

/** Estimated wall-clock time at which `targetBlock` is reached, given `currentBlock`. */
export function blocksToEta(
  targetBlock: number,
  currentBlock: number,
  now: Date = new Date(),
): Date {
  const remainingBlocks = Math.max(0, targetBlock - currentBlock);
  return new Date(now.getTime() + remainingBlocks * AVG_STACKS_BLOCK_SECONDS * 1000);
}
