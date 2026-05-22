import type { ReconRow } from "./reconciliation";
import type { PayoutEntry } from "@/state/payout-ledger";

const HEADER = [
  "game",
  "season",
  "rank",
  "player",
  "score",
  "expected_ustx",
  "expected_stx",
  "paid_status",
  "tx_id",
  "submitted_at",
  "on_chain_claimed",
] as const;

// Build an audit CSV for one season. All values are alphanumeric / numeric so
// no escaping is required, but we still wrap freeform strings in quotes to be
// safe if a future column ever holds commas.
export function buildPayoutCsv(args: {
  gameId: string;
  season: number;
  rows: ReconRow[];
  ledger: Record<string, PayoutEntry>;
  keyFor: (player: string) => string;
}): string {
  const { gameId, season, rows, ledger, keyFor } = args;
  const lines = rows.map((r) => {
    const entry = ledger[keyFor(r.player)];
    const status = entry?.status ?? "unsent";
    const txId = entry?.txId ?? "";
    const submittedAt = entry ? new Date(entry.submittedAt).toISOString() : "";
    const expectedStx = (r.expectedUstx / 1_000_000).toFixed(6);
    return [
      gameId,
      season,
      r.rank,
      r.player,
      r.score,
      r.expectedUstx,
      expectedStx,
      status,
      txId,
      submittedAt,
      r.claimed ? "true" : "false",
    ].join(",");
  });
  return [HEADER.join(","), ...lines].join("\n") + "\n";
}
