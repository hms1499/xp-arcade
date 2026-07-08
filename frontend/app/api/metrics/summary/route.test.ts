import { afterEach, describe, expect, it, vi } from "vitest";
import { _setRedisForTests, type MinimalRedis } from "@/lib/redis";
import { GET } from "./route";

afterEach(() => _setRedisForTests(null));

describe("GET /api/metrics/summary", () => {
  it("returns per-event counts and a cache header", async () => {
    // mget echoes 1 for any requested key so totals are deterministic.
    _setRedisForTests({
      incr: vi.fn(),
      expire: vi.fn(),
      mget: vi.fn((...keys: string[]) => Promise.resolve(keys.map(() => 1))) as unknown as MinimalRedis["mget"],
    });

    const response = await GET(
      new Request("http://localhost/api/metrics/summary?days=7"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage");
    const body = await response.json();
    expect(body.days).toBe(7);
    expect(body.events.mint_confirmed).toBeDefined();
    expect(body.events.game_over).toBeDefined();
  });

  it("clamps days to the max", async () => {
    _setRedisForTests({
      incr: vi.fn(),
      expire: vi.fn(),
      mget: vi.fn((...keys: string[]) => Promise.resolve(keys.map(() => null))) as unknown as MinimalRedis["mget"],
    });
    const response = await GET(
      new Request("http://localhost/api/metrics/summary?days=9999"),
    );
    const body = await response.json();
    expect(body.days).toBe(90);
  });
});
