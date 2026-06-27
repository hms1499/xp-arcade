// Derives the Swap window status-bar text from current UI state. Pure — the
// component owns the spinner (keyed off loadingQuote) separately.
export function swapStatusText(s: {
  amountValid: boolean;
  hasQuote: boolean;
  quoteStale: boolean;
  submitting: boolean;
}): string {
  if (s.submitting) return "Confirm in wallet…";
  if (!s.amountValid) return "Enter an amount";
  if (s.hasQuote && s.quoteStale) return "Quote expired";
  if (s.hasQuote) return "Ready";
  return "Fetching quote…";
}
