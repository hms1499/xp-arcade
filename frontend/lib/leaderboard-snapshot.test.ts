import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GAME_IDS } from "./game-registry";
import {
  fetchLeaderboardSnapshot,
  resetSnapshotCacheForTest,
} from "./leaderboard-snapshot";

const snapshot = {
  updatedAt: new Date().toISOString(),
  games: GAME_IDS.reduce((acc, g) => {
    acc[g] = { topTen: [], currentSeason: 1, prizePool: 0, seasonEndBlock: 1 };
    return acc;
  }, {} as Record<string, unknown>),
};

beforeEach(() => {
  resetSnapshotCacheForTest();
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchLeaderboardSnapshot", () => {
  it("dedupes concurrent calls into one fetch", async () => {
    const [a, b] = await Promise.all([fetchLeaderboardSnapshot(), fetchLeaderboardSnapshot()]);
    expect(a).toEqual(b);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("serves from cache within TTL", async () => {
    await fetchLeaderboardSnapshot();
    await fetchLeaderboardSnapshot();
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    vi.advanceTimersByTime(31_000);
    await fetchLeaderboardSnapshot();
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it("returns the last cached snapshot when a later fetch fails", async () => {
    await fetchLeaderboardSnapshot(); // seed cache
    vi.advanceTimersByTime(31_000);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 429 });
    const snap = await fetchLeaderboardSnapshot();
    expect(snap.games[GAME_IDS[0]]).toBeDefined();
  });
});
