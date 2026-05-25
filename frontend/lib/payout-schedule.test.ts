import { describe, expect, it } from "vitest";
import { buildPayoutRows, computePayoutUstx } from "./payout-schedule";

describe("computePayoutUstx", () => {
  it("uses 20% for ranks 1-3 and 4/70 for ranks 4-10", () => {
    expect(computePayoutUstx(1_000_000, 1)).toBe(200_000);
    expect(computePayoutUstx(1_000_000, 3)).toBe(200_000);
    expect(computePayoutUstx(1_000_000, 4)).toBe(57_142);
  });
});

describe("buildPayoutRows", () => {
  it("uses row-position ranks for ties so scheduled payouts do not exceed the pool", () => {
    const rows = buildPayoutRows(
      1_000_000,
      Array.from({ length: 10 }, (_, i) => ({
        player: `SP${i}`,
        score: 100,
      })),
    );

    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rows.reduce((sum, r) => sum + r.payoutUstx, 0)).toBeLessThanOrEqual(
      1_000_000,
    );
  });

  it("keeps on-chain snapshot order for equal scores", () => {
    const rows = buildPayoutRows(1_000_000, [
      { player: "SP_A", score: 100 },
      { player: "SP_B", score: 100 },
      { player: "SP_C", score: 90 },
    ]);

    expect(rows.map((r) => r.player)).toEqual(["SP_A", "SP_B", "SP_C"]);
  });
});
