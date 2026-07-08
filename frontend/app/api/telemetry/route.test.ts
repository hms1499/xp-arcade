import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimitForTests } from "@/lib/rate-limit";
import { _setRedisForTests } from "@/lib/redis";
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

  it("increments counters for a funnel event", async () => {
    const incr = vi.fn().mockResolvedValue(1);
    const expire = vi.fn().mockResolvedValue(1);
    _setRedisForTests({ incr, expire, mget: vi.fn() });

    const response = await POST(
      new Request("http://localhost/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.1" },
        body: JSON.stringify({ event: "mint_confirmed", game: "snake" }),
      }),
    );

    expect(response.status).toBe(202);
    const keys = incr.mock.calls.map((c) => c[0]);
    expect(keys).toContain("ev:mint_confirmed:total");
    expect(keys.some((k) => k.startsWith("ev:mint_confirmed:2026") || /ev:mint_confirmed:\d{4}-\d{2}-\d{2}$/.test(k))).toBe(true);
    expect(keys.some((k) => k.startsWith("ev:mint_confirmed:snake:"))).toBe(true);
    _setRedisForTests(null);
  });

  it("still returns 202 when redis throws", async () => {
    _setRedisForTests({
      incr: vi.fn().mockRejectedValue(new Error("down")),
      expire: vi.fn(),
      mget: vi.fn(),
    });
    const response = await POST(
      new Request("http://localhost/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.2" },
        body: JSON.stringify({ event: "game_over", game: "tetris" }),
      }),
    );
    expect(response.status).toBe(202);
    _setRedisForTests(null);
  });
});
