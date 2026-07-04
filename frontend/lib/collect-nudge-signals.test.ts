import { describe, expect, it, vi } from "vitest";
import { collectNudgeSignals, type CollectDeps } from "./collect-nudge-signals";
import type { LeaderboardSnapshot } from "./leaderboard-snapshot";

const dailyState = { lastCompletedDate: null, currentStreak: 2, bestStreak: 5 };

const emptyGame = { topTen: [], currentSeason: null, prizePool: null, seasonEndBlock: null };

function snapshotWith(snakeAddr: string, snakeEndBlock: number): LeaderboardSnapshot {
  return {
    games: {
      snake: {
        topTen: [{ player: snakeAddr, score: 100 }],
        currentSeason: 1, prizePool: 0, seasonEndBlock: snakeEndBlock,
      },
      tetris: { ...emptyGame }, pacman: { ...emptyGame },
      breakout: { ...emptyGame }, minesweeper: { ...emptyGame }, solitaire: { ...emptyGame },
    },
  } as unknown as LeaderboardSnapshot;
}

function makeDeps(overrides: Partial<CollectDeps> = {}): CollectDeps {
  return {
    address: null,
    dailyState,
    shownToday: {},
    lastSeenRanks: null,
    fetchSnapshot: async () => snapshotWith("SP1", 1000),
    fetchTip: async () => 990,
    fetchUnclaimed: async () => null,
    ...overrides,
  };
}

describe("collectNudgeSignals", () => {
  it("skips network when disconnected", async () => {
    const fetchSnapshot = vi.fn();
    const fetchTip = vi.fn();
    const s = await collectNudgeSignals(makeDeps({
      address: null, fetchSnapshot, fetchTip,
    }));
    expect(fetchSnapshot).not.toHaveBeenCalled();
    expect(fetchTip).not.toHaveBeenCalled();
    expect(s.ranks).toBeNull();
    expect(s.countdowns).toEqual({});
    expect(s.dailyGame).toBeDefined();
  });

  it("fetches ranks + a countdown only for ranked games with an end block", async () => {
    const fetchTip = vi.fn(async () => 990);
    const s = await collectNudgeSignals(makeDeps({
      address: "SP1",
      fetchSnapshot: async () => snapshotWith("SP1", 1000),
      fetchTip, now: Date.now(),
    }));
    expect(s.ranks?.snake).toBe(1);
    expect(s.countdowns.snake).toBeDefined();
    expect(s.countdowns.tetris).toBeUndefined();
    expect(fetchTip).toHaveBeenCalledTimes(1); // one tip read, reused for all ranked games
  });

  it("populates unclaimed from the injected fetcher", async () => {
    const signals = await collectNudgeSignals(makeDeps({
      address: "SP_A",
      fetchUnclaimed: async () => ({ totalUstx: 500_000, gamesCount: 1, topGame: "snake" }),
    }));
    expect(signals.unclaimed).toEqual({ totalUstx: 500_000, gamesCount: 1, topGame: "snake" });
  });

  it("unclaimed stays null when disconnected", async () => {
    const fetchUnclaimed = vi.fn(async () => ({ totalUstx: 1, gamesCount: 1, topGame: "snake" as const }));
    const signals = await collectNudgeSignals(makeDeps({ address: null, fetchUnclaimed }));
    expect(signals.unclaimed).toBeNull();
    expect(fetchUnclaimed).not.toHaveBeenCalled();
  });

  it("a failing unclaimed fetch degrades to null without breaking other signals", async () => {
    const signals = await collectNudgeSignals(makeDeps({
      address: "SP_A",
      fetchUnclaimed: async () => { throw new Error("down"); },
    }));
    expect(signals.unclaimed).toBeNull();
    expect(signals.ranks).not.toBeUndefined(); // snapshot path unaffected
  });
});
