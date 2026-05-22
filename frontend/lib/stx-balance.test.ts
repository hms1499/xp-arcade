import { describe, it, expect, vi, afterEach } from "vitest";
import { getStxBalance } from "./stx-balance";

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

describe("getStxBalance", () => {
  it("parses the µSTX balance from the Hiro balances endpoint", async () => {
    mockFetch(true, { stx: { balance: "1234567" } });
    expect(await getStxBalance("SP123")).toBe(1234567);
  });

  it("returns null on a non-OK HTTP response", async () => {
    mockFetch(false, {});
    expect(await getStxBalance("SP123")).toBeNull();
  });

  it("returns null when the balance field is missing", async () => {
    mockFetch(true, { stx: {} });
    expect(await getStxBalance("SP123")).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    expect(await getStxBalance("SP123")).toBeNull();
  });

  it("returns null when balance is not a finite number", async () => {
    mockFetch(true, { stx: { balance: "not-a-number" } });
    expect(await getStxBalance("SP123")).toBeNull();
  });
});
