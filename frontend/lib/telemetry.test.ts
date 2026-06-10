import { describe, expect, it } from "vitest";
import { sanitizeTelemetryPayload } from "./telemetry";

describe("sanitizeTelemetryPayload", () => {
  it("rejects unknown events", () => {
    expect(
      sanitizeTelemetryPayload({ event: "arbitrary", message: "nope" }),
    ).toBeNull();
  });

  it("redacts wallet addresses and transaction ids", () => {
    const payload = sanitizeTelemetryPayload({
      event: "wallet_connect_error",
      message:
        "wallet SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV tx 0x1234567890abcdef1234567890abcdef",
      path: "/player/SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV",
    });

    expect(payload?.message).toBe("wallet [address] tx [txid]");
    expect(payload?.path).toBe("/player/[address]");
  });

  it("caps message and path lengths", () => {
    const payload = sanitizeTelemetryPayload({
      event: "holdings_total_failure",
      message: "x".repeat(500),
      path: `/${"y".repeat(200)}`,
    });

    expect(payload?.message).toHaveLength(300);
    expect(payload?.path).toHaveLength(120);
  });
});
