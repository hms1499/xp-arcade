import { describe, it, expect, vi, afterEach } from "vitest";
import { pollTxStatus } from "./tx-tracker";

function mockFetch(ok: boolean, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
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
