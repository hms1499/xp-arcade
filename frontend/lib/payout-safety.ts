import type { PayoutEntry } from "@/state/payout-ledger";
import type { GameId } from "./game-registry";

export type PayoutSafetyRow = {
  player: string;
  rank: number;
  score: number;
  payoutUstx: number;
};

export function formatStx(ustx: number, digits = 6): string {
  return `${(ustx / 1_000_000).toFixed(digits)} STX`;
}

export function getPayoutBlockReason(entry: PayoutEntry | undefined): string | null {
  if (!entry) return null;
  if (entry.status === "success") return "already-paid";
  if (entry.status === "pending") return "pending";
  return null;
}

export function buildPayoutConfirmation(args: {
  gameId: GameId;
  gameLabel: string;
  season: number;
  row: PayoutSafetyRow;
  memo: string;
  existingEntry?: PayoutEntry;
  ownerBalanceUstx: number | null;
}): string {
  const { gameId, gameLabel, season, row, memo, existingEntry, ownerBalanceUstx } = args;
  const lines = [
    "Confirm owner payout",
    "",
    `Game: ${gameLabel} (${gameId})`,
    `Season: ${season}`,
    `Rank: #${row.rank}`,
    `Score: ${row.score}`,
    `Recipient: ${row.player}`,
    `Amount: ${formatStx(row.payoutUstx)}`,
    `Memo: ${memo}`,
  ];

  if (ownerBalanceUstx != null) {
    lines.push(`Owner balance: ${formatStx(ownerBalanceUstx)}`);
  }

  if (existingEntry?.status === "failed") {
    lines.push("", `Retrying failed tx: ${existingEntry.txId}`);
  }

  lines.push(
    "",
    "This sends real STX from the connected owner wallet. Confirm the address and amount before signing.",
  );
  return lines.join("\n");
}

export function buildBatchPayoutConfirmation(args: {
  gameId: GameId;
  gameLabel: string;
  season: number;
  rows: PayoutSafetyRow[];
  ownerBalanceUstx: number | null;
}): string {
  const { gameId, gameLabel, season, rows, ownerBalanceUstx } = args;
  const totalUstx = rows.reduce((sum, row) => sum + row.payoutUstx, 0);
  const sendCount = rows.filter((row) => row.payoutUstx > 0).length;
  const lines = [
    "Confirm batch owner payout",
    "",
    `Game: ${gameLabel} (${gameId})`,
    `Season: ${season}`,
    `Rows: ${rows.length}`,
    `Total: ${formatStx(totalUstx)}`,
    `Wallet signatures: ${rows.length}`,
  ];

  if (ownerBalanceUstx != null) {
    lines.push(`Owner balance: ${formatStx(ownerBalanceUstx)}`);
  }

  lines.push(
    "",
    "Recipients:",
    ...rows.map((row) => `#${row.rank} ${row.player} ${formatStx(row.payoutUstx)} memo=xpa-${gameId}-s${season}-r${row.rank}`),
    "",
    `${sendCount} row${sendCount === 1 ? "" : "s"} will be sent one by one. Stop if any wallet prompt does not match this preview.`,
  );
  return lines.join("\n");
}
