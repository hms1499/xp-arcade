import { describe, expect, it, vi } from "vitest";
import { findClaimablePrizes, type FindClaimableDeps } from "./claimable-prizes";
import type { SeasonPrize } from "./contract-calls";

const ME = "SP_ME";
const OTHER = "SP_OTHER";

// Build deps from a season->prize map plus a set of already-claimed seasons.
// computePayout returns the rank so tests can assert which rank was computed.
function makeDeps(
  prizes: Record<number, SeasonPrize>,
  claimed: Set<number> = new Set(),
  overrides: Partial<FindClaimableDeps> = {},
): FindClaimableDeps {
  return {
    getSeasonPrize: vi.fn(async (_g, season: number) => prizes[season] ?? null),
    hasClaimed: vi.fn(async (_g, _addr, season: number) => claimed.has(season)),
    computePayout: (_total, rank) => rank,
    ...overrides,
  };
}

describe("findClaimablePrizes", () => {
  it("returns empty when there is no closed season (currentSeason <= 1)", async () => {
    const deps = makeDeps({});
    const result = await findClaimablePrizes("snake", ME, 1, deps);
    expect(result).toEqual([]);
    expect(deps.getSeasonPrize).not.toHaveBeenCalled();
  });

  it("returns empty when the player is in no closed-season top ten", async () => {
    const deps = makeDeps({
      1: { total: 1_000_000, topTen: [{ player: OTHER, score: 50 }] },
    });
    const result = await findClaimablePrizes("snake", ME, 2, deps);
    expect(result).toEqual([]);
  });

  it("returns a single claim when one closed season is eligible", async () => {
    const deps = makeDeps({
      1: { total: 1_000_000, topTen: [{ player: ME, score: 50 }] },
    });
    const result = await findClaimablePrizes("snake", ME, 2, deps);
    // rank 1 -> computePayout returns the rank (1)
    expect(result).toEqual([{ season: 1, amountUstx: 1 }]);
  });

  it("returns every unclaimed season sorted ascending by season", async () => {
    const deps = makeDeps({
      1: { total: 1_000_000, topTen: [{ player: ME, score: 50 }] },
      2: { total: 2_000_000, topTen: [{ player: ME, score: 90 }] },
      3: { total: 3_000_000, topTen: [{ player: ME, score: 10 }] },
    });
    const result = await findClaimablePrizes("snake", ME, 4, deps);
    expect(result.map((c) => c.season)).toEqual([1, 2, 3]);
  });

  it("filters out seasons the player has already claimed", async () => {
    const deps = makeDeps(
      {
        1: { total: 1_000_000, topTen: [{ player: ME, score: 50 }] },
        2: { total: 2_000_000, topTen: [{ player: ME, score: 90 }] },
      },
      new Set([1]),
    );
    const result = await findClaimablePrizes("snake", ME, 3, deps);
    expect(result.map((c) => c.season)).toEqual([2]);
  });

  it("filters out seasons where the prize pool is empty (total 0)", async () => {
    const deps = makeDeps({
      1: { total: 0, topTen: [{ player: ME, score: 50 }] },
    });
    const result = await findClaimablePrizes("snake", ME, 2, deps);
    expect(result).toEqual([]);
  });

  it("computes rank as one plus the count of strictly-higher scores", async () => {
    const deps = makeDeps({
      1: {
        total: 1_000_000,
        topTen: [
          { player: OTHER, score: 90 },
          { player: "SP_X", score: 80 },
          { player: ME, score: 70 },
        ],
      },
    });
    const result = await findClaimablePrizes("snake", ME, 2, deps);
    // two strictly-higher scores -> rank 3 -> computePayout returns 3
    expect(result).toEqual([{ season: 1, amountUstx: 3 }]);
  });

  it("skips a season whose prize read fails without dropping the others", async () => {
    const deps = makeDeps({
      2: { total: 2_000_000, topTen: [{ player: ME, score: 90 }] },
    });
    deps.getSeasonPrize = vi.fn(async (_g, season: number) => {
      if (season === 1) throw new Error("network");
      return { total: 2_000_000, topTen: [{ player: ME, score: 90 }] };
    });
    const result = await findClaimablePrizes("snake", ME, 3, deps);
    expect(result.map((c) => c.season)).toEqual([2]);
  });

  it("does not query claim status for seasons the player is not in", async () => {
    const deps = makeDeps({
      1: { total: 1_000_000, topTen: [{ player: OTHER, score: 50 }] },
    });
    await findClaimablePrizes("snake", ME, 2, deps);
    expect(deps.hasClaimed).not.toHaveBeenCalled();
  });
});
