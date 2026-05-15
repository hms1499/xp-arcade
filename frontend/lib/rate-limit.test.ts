import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { rateLimit, _resetRateLimitForTests } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    _resetRateLimitForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to the limit then blocks", () => {
    const k = "ip-1.2.3.4";
    expect(rateLimit(k, 3, 60_000).ok).toBe(true);
    expect(rateLimit(k, 3, 60_000).ok).toBe(true);
    expect(rateLimit(k, 3, 60_000).ok).toBe(true);
    expect(rateLimit(k, 3, 60_000).ok).toBe(false);
  });

  it("isolates buckets per key", () => {
    expect(rateLimit("a", 1, 60_000).ok).toBe(true);
    expect(rateLimit("b", 1, 60_000).ok).toBe(true);
    expect(rateLimit("a", 1, 60_000).ok).toBe(false);
  });

  it("resets after the window elapses", () => {
    expect(rateLimit("c", 1, 1_000).ok).toBe(true);
    expect(rateLimit("c", 1, 1_000).ok).toBe(false);
    vi.advanceTimersByTime(1_001);
    expect(rateLimit("c", 1, 1_000).ok).toBe(true);
  });

  it("reports remaining and resetAt", () => {
    const r1 = rateLimit("d", 5, 60_000);
    expect(r1.remaining).toBe(4);
    expect(r1.resetAt).toBeGreaterThan(Date.now());
  });
});
