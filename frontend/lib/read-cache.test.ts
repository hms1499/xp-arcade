// frontend/lib/read-cache.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cachedRead, clearReadCache, invalidateReadCache } from "./read-cache";

beforeEach(() => {
  clearReadCache();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("cachedRead", () => {
  it("dedupes concurrent calls for the same key into one underlying call", async () => {
    let calls = 0;
    const fn = () => {
      calls++;
      return Promise.resolve(calls);
    };
    const [a, b] = await Promise.all([
      cachedRead("k", 1000, fn),
      cachedRead("k", 1000, fn),
    ]);
    expect(calls).toBe(1);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("serves from cache within TTL, refetches after expiry", async () => {
    let calls = 0;
    const fn = () => Promise.resolve(++calls);
    await cachedRead("k", 1000, fn);
    await cachedRead("k", 1000, fn);
    expect(calls).toBe(1);
    vi.advanceTimersByTime(1001);
    await cachedRead("k", 1000, fn);
    expect(calls).toBe(2);
  });

  it("retries a rate-limit error via backoff", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValue(7);
    const result = await cachedRead("k", 1000, fn, { sleep: () => Promise.resolve() });
    expect(result).toBe(7);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("invalidateReadCache", () => {
  it("drops matching keys and keeps others", async () => {
    let aCalls = 0;
    let bCalls = 0;
    await cachedRead("claimed:snake:1:SP_A", 60_000, async () => ++aCalls);
    await cachedRead("best:snake:SP_A", 60_000, async () => ++bCalls);

    invalidateReadCache("claimed:snake:1");

    await cachedRead("claimed:snake:1:SP_A", 60_000, async () => ++aCalls);
    await cachedRead("best:snake:SP_A", 60_000, async () => ++bCalls);
    expect(aCalls).toBe(2); // refetched after invalidation
    expect(bCalls).toBe(1); // untouched key still cached
  });
});
