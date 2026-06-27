// frontend/lib/swap-errors.ts
// Map raw swap/SDK/wallet errors to short, user-facing messages.

export type SwapErrorKind =
  | "no-route"
  | "slippage"
  | "cancelled"
  | "quote"
  | "unknown";

export function classifySwapError(e: unknown): SwapErrorKind {
  const msg = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  if (/cancel|reject|abort|denied/.test(msg)) return "cancelled";
  if (/no route|route not found|insufficient liquidity|no liquidity/.test(msg)) return "no-route";
  if (/slippage|post-?condition|price moved|too little received/.test(msg)) return "slippage";
  if (/quote|timeout|network|fetch/.test(msg)) return "quote";
  return "unknown";
}

export function mapSwapError(e: unknown): string {
  switch (classifySwapError(e)) {
    case "cancelled":
      return ""; // user cancelled — surface nothing
    case "no-route":
      return "No liquidity for this amount. Try a smaller amount.";
    case "slippage":
      return "Price moved. Retry, or raise your slippage tolerance.";
    case "quote":
      return "Couldn't fetch a price. Check your connection and try again.";
    default:
      return "Swap failed. Please try again.";
  }
}
