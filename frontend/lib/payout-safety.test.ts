import { describe, expect, it } from "vitest";
import {
  buildBatchPayoutConfirmation,
  buildPayoutConfirmation,
  formatStx,
  getPayoutBlockReason,
} from "./payout-safety";
import type { PayoutEntry } from "@/state/payout-ledger";

const failedEntry: PayoutEntry = {
  txId: "0xfailed",
  status: "failed",
  submittedAt: 1,
};

describe("formatStx", () => {
  it("formats micro-STX as STX with fixed precision", () => {
    expect(formatStx(1_234_567)).toBe("1.234567 STX");
    expect(formatStx(10_000, 4)).toBe("0.0100 STX");
  });
});

describe("getPayoutBlockReason", () => {
  it("blocks successful and pending entries but allows missing or failed entries", () => {
    expect(getPayoutBlockReason(undefined)).toBeNull();
    expect(getPayoutBlockReason(failedEntry)).toBeNull();
    expect(getPayoutBlockReason({ ...failedEntry, status: "pending" })).toBe("pending");
    expect(getPayoutBlockReason({ ...failedEntry, status: "success" })).toBe("already-paid");
  });
});

describe("buildPayoutConfirmation", () => {
  it("includes exact payout fields and retry context", () => {
    const message = buildPayoutConfirmation({
      gameId: "snake",
      gameLabel: "Snake",
      season: 2,
      row: {
        player: "SP123456789",
        rank: 3,
        score: 420,
        payoutUstx: 2_000_000,
      },
      memo: "xpa-snake-s2-r3",
      existingEntry: failedEntry,
      ownerBalanceUstx: 10_000_000,
    });

    expect(message).toContain("Game: Snake (snake)");
    expect(message).toContain("Season: 2");
    expect(message).toContain("Rank: #3");
    expect(message).toContain("Score: 420");
    expect(message).toContain("Recipient: SP123456789");
    expect(message).toContain("Amount: 2.000000 STX");
    expect(message).toContain("Memo: xpa-snake-s2-r3");
    expect(message).toContain("Owner balance: 10.000000 STX");
    expect(message).toContain("Retrying failed tx: 0xfailed");
  });
});

describe("buildBatchPayoutConfirmation", () => {
  it("summarizes rows, total, signatures, recipients, and memos", () => {
    const message = buildBatchPayoutConfirmation({
      gameId: "pacman",
      gameLabel: "Pac-Man",
      season: 4,
      rows: [
        { player: "SP_A", rank: 1, score: 500, payoutUstx: 2_000_000 },
        { player: "SP_B", rank: 2, score: 400, payoutUstx: 1_000_000 },
      ],
      ownerBalanceUstx: 9_000_000,
    });

    expect(message).toContain("Game: Pac-Man (pacman)");
    expect(message).toContain("Rows: 2");
    expect(message).toContain("Total: 3.000000 STX");
    expect(message).toContain("Wallet signatures: 2");
    expect(message).toContain("#1 SP_A 2.000000 STX memo=xpa-pacman-s4-r1");
    expect(message).toContain("#2 SP_B 1.000000 STX memo=xpa-pacman-s4-r2");
  });
});
