import type { TxStatus } from "./tx-tracker";

// Single source of truth for turning raw wallet / on-chain failures into plain
// language. The xp-arcade-v4 contract error codes (u101-u108) are mirrored here;
// keep this table in sync with contract/contracts/*.clar.
const CONTRACT_ERROR_MESSAGES: Record<string, string> = {
  "101": "Your score isn't in this season's top-10, so there's no prize to claim.",
  "102": "You've already claimed your prize for this season.",
  "103": "Only the contract owner can do that.",
  "104": "Score rejected by the contract (too high). Please play a normal game.",
  "105": "The season hasn't ended yet, so prizes aren't open to claim.",
  "106": "This season's prize pool is empty.",
  "107": "No prize record was found for this season.",
  "108": "Mint limit reached for this season (10/10).",
};

// Keyword fallbacks for wallets that surface the named error rather than a code.
const KEYWORD_MESSAGES: Array<[RegExp, string]> = [
  [/mint-limit/i, CONTRACT_ERROR_MESSAGES["108"]],
  [/score-too-high/i, CONTRACT_ERROR_MESSAGES["104"]],
  [/already-claimed/i, CONTRACT_ERROR_MESSAGES["102"]],
  [/not-in-top-ten/i, CONTRACT_ERROR_MESSAGES["101"]],
];

const POST_CONDITION_MESSAGE =
  "Transaction blocked by a post-condition (amount mismatch). Please try again.";

export function isUserCancellation(raw: string): boolean {
  return /\bcancel/i.test(raw) || /user rejected|rejected the request/i.test(raw);
}

export function humanizeContractError(raw: string): string {
  // Numeric code with a word boundary so u1048 is not read as u104.
  const codeMatch = raw.match(/\bu?(\d{3})\b/);
  if (codeMatch) {
    const mapped = CONTRACT_ERROR_MESSAGES[codeMatch[1]];
    if (mapped) return mapped;
  }
  for (const [pattern, message] of KEYWORD_MESSAGES) {
    if (pattern.test(raw)) return message;
  }
  if (/post.?condition/i.test(raw)) return POST_CONDITION_MESSAGE;
  return raw.trim();
}

const TX_STATUS_MESSAGES: Record<TxStatus, string> = {
  pending: "Submitted · confirming on-chain…",
  success: "Confirmed on-chain.",
  abort_by_response: "The contract rejected this transaction.",
  abort_by_post_condition: POST_CONDITION_MESSAGE,
  failed: "The transaction failed on-chain. You can try again.",
  timeout: "Still confirming · check it on the Explorer.",
};

export function humanizeTxStatus(status: TxStatus): string {
  return TX_STATUS_MESSAGES[status];
}
