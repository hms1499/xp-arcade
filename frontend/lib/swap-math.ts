// frontend/lib/swap-math.ts
// Pure numeric helpers. On-chain amounts use integer base units.

/** Network-fee reserve, in uSTX (0.5 STX). */
export const STX_GAS_BUFFER_USTX = 500_000;

/** Human amount (e.g. 1.5) → integer base units for `decimals`. */
export function toBaseUnits(amount: number, decimals: number): number {
  return Math.round(amount * 10 ** decimals);
}

/** Integer base units → human number for display. */
export function fromBaseUnits(base: number, decimals: number): number {
  return base / 10 ** decimals;
}

/** Slippage in basis points → fraction the Bitflow SDK expects (50 → 0.005). */
export function slippageBpsToTolerance(bps: number): number {
  return bps / 10_000;
}

/** Max STX spendable: balance minus the gas buffer, floored at 0. uSTX in/out. */
export function maxStxInput(balanceUstx: number): number {
  return Math.max(0, balanceUstx - STX_GAS_BUFFER_USTX);
}
