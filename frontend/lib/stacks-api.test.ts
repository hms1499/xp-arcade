import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentStacksBlockHeight } from "./stacks-api";

afterEach(() => vi.restoreAllMocks());

describe("getCurrentStacksBlockHeight", () => {
  it("returns the height of the latest block from the Hiro tip", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ results: [{ height: 8222219 }] }),
      })),
    );
    expect(await getCurrentStacksBlockHeight()).toBe(8222219);
  });

  it("throws when the tip request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));
    await expect(getCurrentStacksBlockHeight()).rejects.toThrow("503");
  });
});
