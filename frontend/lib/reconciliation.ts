import type { PayoutEntry } from "@/state/payout-ledger";

export type ReconRow = {
  player: string;
  rank: number;
  score: number;
  expectedUstx: number;
  claimed: boolean;
};

export type ReconAnomaly =
  | { kind: "unpaid"; player: string }
  | { kind: "failed"; player: string; txId: string }
  | { kind: "double-tracked"; player: string; txId: string };

export type ReconSummary = {
  total: number;
  paid: number;
  pending: number;
  failed: number;
  unsent: number;
  anomalies: ReconAnomaly[];
};

// Cross-reference expected payouts against the off-chain ledger and the on-chain
// has-claimed-prize flag. Returns counts plus a list of anomalies the admin
// should investigate before sending more STX.
export function reconcile(
  rows: ReconRow[],
  ledger: Record<string, PayoutEntry>,
  keyFor: (player: string) => string,
): ReconSummary {
  let paid = 0;
  let pending = 0;
  let failed = 0;
  let unsent = 0;
  const anomalies: ReconAnomaly[] = [];
  for (const r of rows) {
    const entry = ledger[keyFor(r.player)];
    if (!entry) {
      unsent++;
      if (r.expectedUstx > 0) anomalies.push({ kind: "unpaid", player: r.player });
      continue;
    }
    if (entry.status === "success") {
      paid++;
      // Player called claim-prize on-chain AND admin paid off-chain — could
      // signal double-tracking or a UI regression. Flag for human review.
      if (r.claimed) {
        anomalies.push({ kind: "double-tracked", player: r.player, txId: entry.txId });
      }
    } else if (entry.status === "pending") {
      pending++;
    } else {
      failed++;
      anomalies.push({ kind: "failed", player: r.player, txId: entry.txId });
    }
  }
  return { total: rows.length, paid, pending, failed, unsent, anomalies };
}
