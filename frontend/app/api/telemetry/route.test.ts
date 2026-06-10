import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimitForTests } from "@/lib/rate-limit";
import { POST } from "./route";

describe("POST /api/telemetry", () => {
  beforeEach(() => {
    _resetRateLimitForTests();
  });

  it("logs a sanitized allowed event", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await POST(
      new Request("http://localhost/api/telemetry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        body: JSON.stringify({
          event: "wallet_connect_error",
          message: "failed for SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV",
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("failed for [address]"),
    );
    log.mockRestore();
  });

  it("rejects an unknown event", async () => {
    const response = await POST(
      new Request("http://localhost/api/telemetry", {
        method: "POST",
        body: JSON.stringify({ event: "unknown", message: "nope" }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
