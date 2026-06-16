import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GAME_IDS } from "./game-registry";

// Mock the per-game reader so the cache logic is tested in isolation.
const readGameLeaderboard = vi.fn();
vi.mock("./leaderboard-reads", () => ({
  readGameLeaderboard: (...args: unknown[]) => readGameLeaderboard(...args),
}));

import {
  getLeaderboardSnapshot,
  resetLeaderboardCacheForTest,
} from "./leaderboard-cache";

const good = {
  topTen: [{ player: "SP1", score: 9 }],
  currentSeason: 1,
  prizePool: 500,
  seasonEndBlock: 8470355,
};

beforeEach(() => {
  resetLeaderboardCacheForTest();
  readGameLeaderboard.mockReset();
  readGameLeaderboard.mockResolvedValue(good);
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("getLeaderboardSnapshot", () => {
  it("returns a result for every game", async () => {
    const snap = await getLeaderboardSnapshot();
    for (const id of GAME_IDS) expect(snap.games[id]).toEqual(good);
    expect(typeof snap.updatedAt).toBe("string");
  });

  it("serves from cache within TTL (no extra reads)", async () => {
    await getLeaderboardSnapshot();
    const callsAfterFirst = readGameLeaderboard.mock.calls.length;
    await getLeaderboardSnapshot();
    expect(readGameLeaderboard.mock.calls.length).toBe(callsAfterFirst);
  });

  it("dedupes concurrent rebuilds (single-flight)", async () => {
    resetLeaderboardCacheForTest();
    const [a, b] = await Promise.all([getLeaderboardSnapshot(), getLeaderboardSnapshot()]);
    expect(a).toBe(b);
    expect(readGameLeaderboard.mock.calls.length).toBe(GAME_IDS.length);
  });

  it("keeps the previous good value when a later read fails (serve-stale)", async () => {
    await getLeaderboardSnapshot(); // seed good
    vi.advanceTimersByTime(31_000);
    readGameLeaderboard.mockResolvedValue({
      topTen: [],
      currentSeason: null,
      prizePool: null,
      seasonEndBlock: null,
    });
    const snap = await getLeaderboardSnapshot();
    expect(snap.games[GAME_IDS[0]]).toEqual(good); // previous values retained
  });
});
