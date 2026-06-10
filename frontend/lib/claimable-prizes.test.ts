import { describe, expect, it, vi } from "vitest";
import {
  findClaimablePrizes,
  classifyClaimTx,
  type FindClaimableDeps,
} from "./claimable-prizes";
import type { SeasonPrize } from "./contract-calls";

const ME = "SP_ME";
const OTHER = "SP_OTHER";

// Build deps from a season->prize map plus a set of already-claimed seasons.
// getClaimableAmount returns the on-chain payable amount; the contract owns the
// rank/tie split now, so the fake just echoes a per-season amount derived from
// the prize total (proving the value flows from the chain helper, not a formula).
// closedSeasons marks seasons whose claim window is closed.
function makeDeps(
  prizes: Record<number, SeasonPrize>,
  claimed: Set<number> = new Set(),
  overrides: Partial<FindClaimableDeps> = {},
  closedSeasons: Set<number> = new Set(),
): FindClaimableDeps {
  return {
    getSeasonPrize: vi.fn(async (_g, season: number) => prizes[season] ?? null),
    hasClaimed: vi.fn(async (_g, _addr, season: number) => claimed.has(season)),
    getClaimableAmount: vi.fn(async (_g, season: number) => (prizes[season]?.total ?? 0) / 1000),
    isClaimOpen: vi.fn(async (_g, season: number) => !closedSeasons.has(season)),
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
    // amount comes from the on-chain getClaimableAmount (total/1000), not a formula
    expect(result).toEqual([{ season: 1, amountUstx: 1000, claimOpen: true }]);
  });

  it("surfaces a season whose claim window is closed, marked claimOpen: false", async () => {
    const deps = makeDeps(
      { 1: { total: 1_000_000, topTen: [{ player: ME, score: 50 }] } },
      new Set(),
      {},
      new Set([1]),
    );
    const result = await findClaimablePrizes("snake", ME, 2, deps);
    expect(result).toEqual([{ season: 1, amountUstx: 1000, claimOpen: false }]);
  });

  it("uses the on-chain getClaimableAmount value, ignoring rank ordering", async () => {
    const deps = makeDeps({
      1: {
        total: 5_000_000,
        topTen: [
          { player: OTHER, score: 90 },
          { player: ME, score: 70 },
        ],
      },
    });
    // ME is rank 2, but the amount is whatever the chain returns (total/1000 = 5000)
    const result = await findClaimablePrizes("snake", ME, 2, deps);
    expect(result).toEqual([{ season: 1, amountUstx: 5000, claimOpen: true }]);
  });

  it("skips a season the chain reports as not claimable (amount 0)", async () => {
    const deps = makeDeps(
      { 1: { total: 1_000_000, topTen: [{ player: ME, score: 50 }] } },
      new Set(),
      { getClaimableAmount: vi.fn(async () => 0) },
    );
    const result = await findClaimablePrizes("snake", ME, 2, deps);
    expect(result).toEqual([]);
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

  it("only claims for seasons whose snapshot includes the player", async () => {
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
    // present in the snapshot -> claim returned with the on-chain amount (total/1000)
    expect(result).toEqual([{ season: 1, amountUstx: 1000, claimOpen: true }]);
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

describe("classifyClaimTx", () => {
  it("treats a successful tx as confirmed", () => {
    expect(classifyClaimTx("success")).toBe("confirmed");
  });

  it("treats a still-pending tx as pending", () => {
    expect(classifyClaimTx("pending")).toBe("pending");
  });

  it("keeps a polling timeout distinct from an on-chain failure", () => {
    expect(classifyClaimTx("timeout")).toBe("timeout");
  });

  it("treats a post-condition abort as failed so the button can be restored", () => {
    expect(classifyClaimTx("abort_by_post_condition")).toBe("failed");
  });

  it("treats a response abort as failed", () => {
    expect(classifyClaimTx("abort_by_response")).toBe("failed");
  });

  it("treats a dropped/unknown failure as failed", () => {
    expect(classifyClaimTx("failed")).toBe("failed");
  });
});
