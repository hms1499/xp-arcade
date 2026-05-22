import { describe, it, expect } from "vitest";
import { buildPayoutCsv } from "./payout-csv";
import type { ReconRow } from "./reconciliation";
import type { PayoutEntry } from "@/state/payout-ledger";

const row = (over: Partial<ReconRow> = {}): ReconRow => ({
  player: "SP1",
  rank: 1,
  score: 100,
  expectedUstx: 2_000_000,
  claimed: false,
  ...over,
});

const keyFor = (p: string) => `snake-2-${p}`;

describe("buildPayoutCsv", () => {
  it("emits a header line plus one row per entry, trailing newline", () => {
    const csv = buildPayoutCsv({ gameId: "snake", season: 2, rows: [row()], ledger: {}, keyFor });
    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "game,season,rank,player,score,expected_ustx,expected_stx,paid_status,tx_id,submitted_at,on_chain_claimed",
    );
    expect(lines[1]).toBe("snake,2,1,SP1,100,2000000,2.000000,unsent,,,false");
    expect(lines[2]).toBe("");
  });

  it("renders ledger fields when an entry exists", () => {
    const ledger: Record<string, PayoutEntry> = {
      [keyFor("SP1")]: { txId: "0xabc", status: "success", submittedAt: 1_700_000_000_000 },
    };
    const csv = buildPayoutCsv({ gameId: "snake", season: 2, rows: [row()], ledger, keyFor });
    const dataRow = csv.split("\n")[1];
    expect(dataRow).toContain(",success,");
    expect(dataRow).toContain(",0xabc,");
    expect(dataRow).toMatch(/,2023-11-14T/);
  });

  it("marks on-chain claimed as 'true'", () => {
    const csv = buildPayoutCsv({
      gameId: "snake",
      season: 2,
      rows: [row({ claimed: true })],
      ledger: {},
      keyFor,
    });
    expect(csv.split("\n")[1]).toMatch(/,true$/);
  });
});
