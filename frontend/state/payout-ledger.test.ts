import { beforeEach, describe, expect, it } from "vitest";
import { usePayoutLedger, payoutKey, type PayoutStatus } from "./payout-ledger";

beforeEach(() => {
  usePayoutLedger.setState({ entries: {} });
  localStorage.clear();
});

describe("payoutKey", () => {
  it("composes a stable key", () => {
    expect(payoutKey("snake", 2, "SP123")).toBe("snake-2-SP123");
  });
});

describe("usePayoutLedger", () => {
  it("starts empty", () => {
    expect(usePayoutLedger.getState().entries).toEqual({});
  });

  it("submit() records pending entry", () => {
    usePayoutLedger.getState().submit("snake", 1, "SP_A", "0xtx1");
    const entry = usePayoutLedger.getState().get("snake", 1, "SP_A");
    expect(entry?.txId).toBe("0xtx1");
    expect(entry?.status).toBe("pending" as PayoutStatus);
    expect(entry?.submittedAt).toBeGreaterThan(0);
  });

  it("updateStatus() promotes to success / failed", () => {
    usePayoutLedger.getState().submit("snake", 1, "SP_A", "0xtx1");
    usePayoutLedger.getState().updateStatus("snake", 1, "SP_A", "success");
    expect(usePayoutLedger.getState().get("snake", 1, "SP_A")?.status).toBe(
      "success",
    );
  });

  it("updateStatus() is a no-op for unknown key", () => {
    usePayoutLedger.getState().updateStatus("snake", 1, "SP_X", "success");
    expect(usePayoutLedger.getState().get("snake", 1, "SP_X")).toBeUndefined();
  });

  it("submit() overwrites a previous entry for the same key", () => {
    usePayoutLedger.getState().submit("snake", 1, "SP_A", "0xtx1");
    usePayoutLedger.getState().updateStatus("snake", 1, "SP_A", "failed");
    usePayoutLedger.getState().submit("snake", 1, "SP_A", "0xtx2");
    const entry = usePayoutLedger.getState().get("snake", 1, "SP_A");
    expect(entry?.txId).toBe("0xtx2");
    expect(entry?.status).toBe("pending");
  });
});
