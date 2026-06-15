// frontend/lib/retry.test.ts
import { describe, it, expect, vi } from "vitest";
import { retryWithBackoff, isRateLimitError } from "./retry";

const noSleep = () => Promise.resolve();

describe("isRateLimitError", () => {
  it("detects 429 by status, statusCode, or message; rejects others", () => {
    expect(isRateLimitError({ status: 429 })).toBe(true);
    expect(isRateLimitError({ statusCode: 429 })).toBe(true);
    expect(isRateLimitError(new Error("HTTP 429 Too Many Requests"))).toBe(true);
    expect(isRateLimitError(new Error("rate limit exceeded"))).toBe(true);
    expect(isRateLimitError(new Error("boom"))).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
  });
});

describe("retryWithBackoff", () => {
  it("returns immediately on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(retryWithBackoff(fn, { sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a rate-limit error then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValue("ok");
    await expect(retryWithBackoff(fn, { sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("gives up after `attempts` rate-limit errors", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 429 });
    await expect(
      retryWithBackoff(fn, { attempts: 3, sleep: noSleep }),
    ).rejects.toEqual({ status: 429 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-rate-limit error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(retryWithBackoff(fn, { sleep: noSleep })).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
