// NOTE: Bitflow token ids below are PLACEHOLDERS pending the Task 1 Bitflow probe.
// Decimals (STX 6, sBTC 8) and symbols are final. Replace ids before any live swap.

export type SwapToken = {
  /** Bitflow SDK token id used in getQuoteForRoute / route building. */
  id: string;
  symbol: string;
  decimals: number;
};

// Use the EXACT ids recorded in the comment block above (Task 1 probe).
export const STX_TOKEN: SwapToken = { id: "token-stx", symbol: "STX", decimals: 6 };
export const SBTC_TOKEN: SwapToken = { id: "token-sbtc", symbol: "sBTC", decimals: 8 };

export type Direction = "stx-to-sbtc" | "sbtc-to-stx";

/** The token sold (tokenX) and bought (tokenY) for a direction. */
export function tokensForDirection(direction: Direction): {
  tokenX: SwapToken;
  tokenY: SwapToken;
} {
  return direction === "stx-to-sbtc"
    ? { tokenX: STX_TOKEN, tokenY: SBTC_TOKEN }
    : { tokenX: SBTC_TOKEN, tokenY: STX_TOKEN };
}

/** Opposite direction — for the ⇅ switch button. */
export function flipDirection(direction: Direction): Direction {
  return direction === "stx-to-sbtc" ? "sbtc-to-stx" : "stx-to-sbtc";
}
