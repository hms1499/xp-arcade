import { describe, it, expect } from "vitest";
import { reconcile, type ReconRow } from "./reconciliation";
import type { PayoutEntry } from "@/state/payout-ledger";

const row = (over: Partial<ReconRow> = {}): ReconRow => ({
  player: "SP1",
  rank: 1,
  score: 100,
  expectedUstx: 2_000_000,
  claimed: false,
  ...over,
});

const entry = (over: Partial<PayoutEntry> = {}): PayoutEntry => ({
  txId: "0xabc",
  status: "success",
  submittedAt: 1,
  ...over,
});

const keyFor = (p: string) => `snake-1-${p}`;

describe("reconcile", () => {
  it("returns zeros for an empty row list", () => {
    const r = reconcile([], {}, keyFor);
    expect(r).toEqual({ total: 0, paid: 0, pending: 0, failed: 0, unsent: 0, anomalies: [] });
  });

  it("flags unsent rows with a non-zero expected payout as 'unpaid'", () => {
    const rows = [row({ player: "SP_A" }), row({ player: "SP_B", expectedUstx: 0 })];
    const r = reconcile(rows, {}, keyFor);
    expect(r.unsent).toBe(2);
    expect(r.anomalies).toEqual([{ kind: "unpaid", player: "SP_A" }]);
  });

  it("counts success/pending/failed and reports failed in anomalies", () => {
    const rows = [
      row({ player: "SP_A" }),
      row({ player: "SP_B" }),
      row({ player: "SP_C" }),
    ];
    const ledger: Record<string, PayoutEntry> = {
      [keyFor("SP_A")]: entry({ status: "success" }),
      [keyFor("SP_B")]: entry({ status: "pending", txId: "0xbbb" }),
      [keyFor("SP_C")]: entry({ status: "failed", txId: "0xccc" }),
    };
    const r = reconcile(rows, ledger, keyFor);
    expect(r).toMatchObject({ paid: 1, pending: 1, failed: 1, unsent: 0 });
    expect(r.anomalies).toEqual([{ kind: "failed", player: "SP_C", txId: "0xccc" }]);
  });

  it("flags a row as double-tracked when on-chain claimed AND off-chain paid", () => {
    const rows = [row({ player: "SP_A", claimed: true })];
    const ledger = { [keyFor("SP_A")]: entry({ status: "success", txId: "0xaaa" }) };
    const r = reconcile(rows, ledger, keyFor);
    expect(r.paid).toBe(1);
    expect(r.anomalies).toEqual([{ kind: "double-tracked", player: "SP_A", txId: "0xaaa" }]);
  });

  it("does NOT flag double-tracked when only on-chain claimed (no off-chain entry)", () => {
    const rows = [row({ player: "SP_A", claimed: true })];
    const r = reconcile(rows, {}, keyFor);
    expect(r.anomalies).toEqual([{ kind: "unpaid", player: "SP_A" }]);
  });
});
