import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getCurrentSeasonForGame,
  getTopTenForGame,
  getPrizePoolBalanceForGame,
  getSeasonPrizeForGame,
} from "./contract-calls";
import { fetchSeasonLookup } from "./season-lookup";

vi.mock("./contract-calls", () => ({
  getCurrentSeasonForGame: vi.fn(),
  getTopTenForGame: vi.fn(),
  getPrizePoolBalanceForGame: vi.fn(),
  getSeasonPrizeForGame: vi.fn(),
}));

const currentSeason = vi.mocked(getCurrentSeasonForGame);
const topTen = vi.mocked(getTopTenForGame);
const pool = vi.mocked(getPrizePoolBalanceForGame);
const seasonPrize = vi.mocked(getSeasonPrizeForGame);

describe("fetchSeasonLookup", () => {
  beforeEach(() => {
    currentSeason.mockReset();
    topTen.mockReset();
    pool.mockReset();
    seasonPrize.mockReset();
  });

  it("resolves the live current season from top-ten + pool, ranked desc", async () => {
    currentSeason.mockResolvedValueOnce(2);
    topTen.mockResolvedValueOnce([
      { player: "SPB", score: 100 },
      { player: "SPA", score: 300 },
    ]);
    pool.mockResolvedValueOnce(770000);

    const data = await fetchSeasonLookup("snake", 2);

    expect(data).toEqual({
      gameId: "snake",
      gameName: "Snake",
      emoji: "🐍",
      season: 2,
      status: "live",
      totalUstx: 770000,
      rows: [
        { player: "SPA", score: 300, rank: 1 },
        { player: "SPB", score: 100, rank: 2 },
      ],
    });
    expect(seasonPrize).not.toHaveBeenCalled();
  });

  it("resolves a closed season from the snapshot", async () => {
    currentSeason.mockResolvedValueOnce(3);
    seasonPrize.mockResolvedValueOnce({
      total: 500000,
      topTen: [{ player: "SPX", score: 42 }],
    });

    const data = await fetchSeasonLookup("snake", 1);

    expect(data).toMatchObject({
      season: 1,
      status: "closed",
      totalUstx: 500000,
      rows: [{ player: "SPX", score: 42, rank: 1 }],
    });
    expect(topTen).not.toHaveBeenCalled();
  });

  it("returns null for a future season", async () => {
    currentSeason.mockResolvedValueOnce(2);
    expect(await fetchSeasonLookup("snake", 5)).toBeNull();
  });

  it("returns null for a non-positive or non-integer season", async () => {
    expect(await fetchSeasonLookup("snake", 0)).toBeNull();
    expect(await fetchSeasonLookup("snake", 1.5)).toBeNull();
    expect(currentSeason).not.toHaveBeenCalled();
  });

  it("returns null when the live season has no minted scores", async () => {
    currentSeason.mockResolvedValueOnce(1);
    topTen.mockResolvedValueOnce([]);
    pool.mockResolvedValueOnce(0);
    expect(await fetchSeasonLookup("snake", 1)).toBeNull();
  });

  it("returns null when a closed-season snapshot is missing", async () => {
    currentSeason.mockResolvedValueOnce(3);
    seasonPrize.mockResolvedValueOnce(null);
    expect(await fetchSeasonLookup("snake", 1)).toBeNull();
  });
});
