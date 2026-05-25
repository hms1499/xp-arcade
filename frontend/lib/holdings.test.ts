import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchScoreHoldings, scoreNftKey } from "./holdings";

function jsonResponse(body: unknown): Response {
  return { json: async () => body } as Response;
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
        return jsonResponse({
          name: `Snake Score #${id}`,
          image: `data:image/svg+xml,${id}`,
          attributes: [
            { trait_type: "Rarity", value: "Common" },
            { trait_type: "Season", value: "1" },
            { trait_type: "Score", value: String(id) },
          ],
        });
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
});
