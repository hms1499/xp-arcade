import { describe, it, expect, vi, afterEach } from "vitest";
import { pollTxStatus, watchTx } from "./tx-tracker";

function mockFetch(ok: boolean, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status: ok ? 200 : 503,
      statusText: ok ? "OK" : "Unavailable",
      json: async () => body,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pollTxStatus", () => {
  it("passes through the four known statuses", async () => {
    for (const st of [
      "pending",
      "success",
      "abort_by_response",
      "abort_by_post_condition",
    ]) {
      mockFetch(true, { tx_status: st });
      expect(await pollTxStatus("0xabc")).toBe(st);
    }
  });

  it("maps dropped / replace / unknown to 'failed'", async () => {
    for (const st of [
      "dropped_replace_by_fee",
      "dropped_stale_garbage_collect",
      "something_new",
    ]) {
      mockFetch(true, { tx_status: st });
      expect(await pollTxStatus("0xabc")).toBe("failed");
    }
  });

  it("returns 'pending' on a non-OK HTTP response (transient, keep polling)", async () => {
    mockFetch(false, {});
    expect(await pollTxStatus("0xabc")).toBe("pending");
  });

  it("returns 'pending' when tx_status is missing", async () => {
    mockFetch(true, {});
    expect(await pollTxStatus("0xabc")).toBe("pending");
  });
});

describe("watchTx", () => {
  it("stops polling and reports timeout after the configured duration", async () => {
    vi.useFakeTimers();
    mockFetch(true, { tx_status: "pending" });
    const onUpdate = vi.fn();

    watchTx("0xabc", onUpdate, {
      initialIntervalMs: 10,
      maxIntervalMs: 10,
      maxDurationMs: 25,
    });

    await vi.advanceTimersByTimeAsync(30);
    expect(onUpdate).toHaveBeenLastCalledWith("timeout");
    vi.useRealTimers();
  });

  it("backs off polling intervals up to the configured cap", async () => {
    vi.useFakeTimers();
    mockFetch(true, { tx_status: "pending" });
    const onUpdate = vi.fn();

    const stop = watchTx("0xabc", onUpdate, {
      initialIntervalMs: 10,
      maxIntervalMs: 20,
      maxDurationMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(9);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(onUpdate).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(19);
    expect(onUpdate).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(onUpdate).toHaveBeenCalledTimes(3);
    stop();
    vi.useRealTimers();
  });
});
