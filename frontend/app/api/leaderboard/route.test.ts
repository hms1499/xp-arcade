import { describe, it, expect, vi, beforeEach } from "vitest";
import { GAME_IDS } from "@/lib/game-registry";

const getLeaderboardSnapshot = vi.fn();
vi.mock("@/lib/leaderboard-cache", () => ({
  getLeaderboardSnapshot: () => getLeaderboardSnapshot(),
}));

import { GET } from "./route";

const snapshot = {
  updatedAt: new Date().toISOString(),
  games: GAME_IDS.reduce((acc, g) => {
    acc[g] = { topTen: [], currentSeason: 1, prizePool: 0, seasonEndBlock: 1 };
    return acc;
  }, {} as Record<string, unknown>),
};

beforeEach(() => {
  getLeaderboardSnapshot.mockReset();
  getLeaderboardSnapshot.mockResolvedValue(snapshot);
});

describe("GET /api/leaderboard", () => {
  it("returns 200 with the snapshot for every game and a cache header", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=30");
    const body = await res.json();
    for (const id of GAME_IDS) expect(body.games[id]).toBeDefined();
  });
});
