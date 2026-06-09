import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchScoreHoldings, scoreNftKey } from "./holdings";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

function metaBody(id: number) {
  return {
    name: `Snake Score #${id}`,
    image: `data:image/svg+xml,${id}`,
    attributes: [
      { trait_type: "Rarity", value: "Common" },
      { trait_type: "Season", value: "1" },
      { trait_type: "Score", value: String(id) },
    ],
  };
}

describe("holdings", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/extended/v1/tokens/nft/holdings")) {
          const parsed = new URL(url);
          const offset = Number(parsed.searchParams.get("offset") ?? 0);
          const ids =
            offset === 0
              ? Array.from({ length: 50 }, (_, i) => i + 1)
              : [51, 52];
          return jsonResponse({
            results: ids.map((id) => ({ value: { repr: `u${id}` } })),
          });
        }
        const id = Number(url.match(/\/api\/metadata\/score\/(\d+)/)?.[1]);
        return jsonResponse(metaBody(id));
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("paginates score NFT holdings beyond the first 50 results", async () => {
    const nfts = await fetchScoreHoldings(
      "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV",
      "snake",
    );

    expect(nfts).toHaveLength(52);
    expect(nfts.at(-1)).toMatchObject({ id: 52, score: 52 });
    const holdingsCalls = vi
      .mocked(fetch)
      .mock.calls.map(([input]) => String(input))
      .filter((url) => url.includes("/extended/v1/tokens/nft/holdings"));
    expect(holdingsCalls).toHaveLength(2);
    expect(new URL(holdingsCalls[0]).searchParams.get("offset")).toBe("0");
    expect(new URL(holdingsCalls[1]).searchParams.get("offset")).toBe("50");
  });

  it("builds stable keys across games with overlapping token ids", () => {
    expect(scoreNftKey({ gameId: "snake", id: 1 })).toBe("snake-1");
    expect(scoreNftKey({ gameId: "tetris", id: 1 })).toBe("tetris-1");
  });

  it("skips NFTs whose metadata fetch fails instead of dropping the whole game", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/extended/v1/tokens/nft/holdings")) {
          return jsonResponse({
            results: [1, 2, 3].map((id) => ({ value: { repr: `u${id}` } })),
          });
        }
        const id = Number(url.match(/\/api\/metadata\/score\/(\d+)/)?.[1]);
        if (id === 2) return jsonResponse({ error: "rate limited" }, false);
        return jsonResponse(metaBody(id));
      }),
    );

    const nfts = await fetchScoreHoldings(
      "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV",
      "snake",
    );

    expect(nfts.map((n) => n.id).sort((a, b) => a - b)).toEqual([1, 3]);
  });

  it("never exceeds the metadata concurrency cap", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/extended/v1/tokens/nft/holdings")) {
          return jsonResponse({
            results: Array.from({ length: 30 }, (_, i) => ({
              value: { repr: `u${i + 1}` },
            })),
          });
        }
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        const id = Number(url.match(/\/api\/metadata\/score\/(\d+)/)?.[1]);
        return jsonResponse(metaBody(id));
      }),
    );

    await fetchScoreHoldings("SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV", "snake");
    expect(maxInFlight).toBeLessThanOrEqual(5);
  });
});
