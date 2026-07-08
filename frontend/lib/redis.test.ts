import { afterEach, describe, expect, it, vi } from "vitest";
import { incrWithTtl, mget, _setRedisForTests } from "./redis";

afterEach(() => {
  _setRedisForTests(null);
});

describe("redis wrapper", () => {
  it("no-ops when no client is configured", async () => {
    _setRedisForTests(null);
    await expect(incrWithTtl("ev:x:2026-07-08", 100)).resolves.toBeUndefined();
    await expect(mget(["ev:x:2026-07-08"])).resolves.toEqual([null]);
  });

  it("incrs then sets ttl when a client is configured", async () => {
    const incr = vi.fn().mockResolvedValue(1);
    const expire = vi.fn().mockResolvedValue(1);
    _setRedisForTests({ incr, expire, mget: vi.fn() });
    await incrWithTtl("ev:mint_confirmed:2026-07-08", 200);
    expect(incr).toHaveBeenCalledWith("ev:mint_confirmed:2026-07-08");
    expect(expire).toHaveBeenCalledWith("ev:mint_confirmed:2026-07-08", 200);
  });

  it("skips expire when ttl is omitted", async () => {
    const incr = vi.fn().mockResolvedValue(1);
    const expire = vi.fn().mockResolvedValue(1);
    _setRedisForTests({ incr, expire, mget: vi.fn() });
    await incrWithTtl("ev:mint_confirmed:total");
    expect(incr).toHaveBeenCalledOnce();
    expect(expire).not.toHaveBeenCalled();
  });

  it("coerces mget string values to numbers", async () => {
    const mgetFn = vi.fn().mockResolvedValue(["3", null, 5]);
    _setRedisForTests({ incr: vi.fn(), expire: vi.fn(), mget: mgetFn });
    await expect(mget(["a", "b", "c"])).resolves.toEqual([3, null, 5]);
  });

  it("swallows client errors and returns safe defaults", async () => {
    _setRedisForTests({
      incr: vi.fn().mockRejectedValue(new Error("boom")),
      expire: vi.fn(),
      mget: vi.fn().mockRejectedValue(new Error("boom")),
    });
    await expect(incrWithTtl("k", 10)).resolves.toBeUndefined();
    await expect(mget(["k"])).resolves.toEqual([null]);
  });
});
