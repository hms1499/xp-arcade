import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  useUnclaimedPrizes, summarize, resetUnclaimedForTest,
  type ScanDeps, type UnclaimedPrize,
} from "./unclaimed-prizes";
import type { LeaderboardSnapshot } from "@/lib/leaderboard-snapshot";
import { cachedRead, clearReadCache } from "@/lib/read-cache";
import { GAME_IDS, type GameId } from "@/lib/game-registry";

function snapshot(seasons: Partial<Record<GameId, number>>): LeaderboardSnapshot {
  const games = Object.fromEntries(
    GAME_IDS.map((g): [GameId, LeaderboardSnapshot["games"][GameId]] => [g, {
      topTen: [], currentSeason: seasons[g] ?? 1, prizePool: null, seasonEndBlock: null,
    }]),
  ) as LeaderboardSnapshot["games"];
  return { updatedAt: "t", games };
}

function deps(over: Partial<ScanDeps> = {}): ScanDeps {
  return {
    fetchSnapshot: vi.fn(async () => snapshot({ snake: 2, tetris: 2 })),
    findClaimable: vi.fn(async (gameId) =>
      gameId === "snake"
        ? [{ season: 1, amountUstx: 500_000, claimOpen: true }]
        : gameId === "tetris"
          ? [{ season: 1, amountUstx: 200_000, claimOpen: false }]
          : []),
    ...over,
  };
}

beforeEach(() => {
  resetUnclaimedForTest();
  clearReadCache();
});

describe("summarize", () => {
  it("returns null for no claims", () => {
    expect(summarize([])).toBeNull();
  });

  it("totals amounts, counts distinct games, picks the largest prize's game", () => {
    const claims: UnclaimedPrize[] = [
      { gameId: "snake", season: 1, amountUstx: 300_000 },
      { gameId: "snake", season: 2, amountUstx: 100_000 },
      { gameId: "tetris", season: 1, amountUstx: 900_000 },
    ];
    expect(summarize(claims)).toEqual({
      totalUstx: 1_300_000, gamesCount: 2, topGame: "tetris",
    });
  });
});

describe("scan", () => {
  it("keeps only claim-open prizes and fills the summary", async () => {
    const d = deps();
    await useUnclaimedPrizes.getState().scan("SP_A", d);
    const s = useUnclaimedPrizes.getState();
    expect(s.status).toBe("done");
    expect(s.claims).toEqual([{ gameId: "snake", season: 1, amountUstx: 500_000 }]);
    expect(s.totalUstx).toBe(500_000);
    expect(s.gamesCount).toBe(1);
    expect(s.topGame).toBe("snake");
    expect(s.scannedFor).toBe("SP_A");
  });

  it("skips games still on season 1 (nothing closed to scan)", async () => {
    const d = deps();
    await useUnclaimedPrizes.getState().scan("SP_A", d);
    expect(d.findClaimable).toHaveBeenCalledTimes(2); // snake + tetris only
  });

  it("dedupes: second scan for the same address does not re-fetch", async () => {
    const d = deps();
    await useUnclaimedPrizes.getState().scan("SP_A", d);
    await useUnclaimedPrizes.getState().scan("SP_A", d);
    expect(d.fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it("concurrent scans for the same address share one flight", async () => {
    const d = deps();
    await Promise.all([
      useUnclaimedPrizes.getState().scan("SP_A", d),
      useUnclaimedPrizes.getState().scan("SP_A", d),
    ]);
    expect(d.fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it("a snapshot failure yields error status and an empty result", async () => {
    const d = deps({ fetchSnapshot: vi.fn(async () => { throw new Error("down"); }) });
    await useUnclaimedPrizes.getState().scan("SP_A", d);
    const s = useUnclaimedPrizes.getState();
    expect(s.status).toBe("error");
    expect(s.claims).toEqual([]);
    expect(s.totalUstx).toBe(0);
  });

  it("one game's failure never hides another game's prize", async () => {
    const d = deps({
      findClaimable: vi.fn(async (gameId) => {
        if (gameId === "tetris") throw new Error("boom");
        return gameId === "snake"
          ? [{ season: 1, amountUstx: 500_000, claimOpen: true }] : [];
      }),
    });
    await useUnclaimedPrizes.getState().scan("SP_A", d);
    expect(useUnclaimedPrizes.getState().claims).toHaveLength(1);
  });
});

describe("refresh / reset", () => {
  it("refresh invalidates the claimed keys and re-scans the same address", async () => {
    const d = deps();
    await useUnclaimedPrizes.getState().scan("SP_A", d);

    // Warm two cache keys; refresh must only drop the claimed game+season ones.
    let claimedCalls = 0;
    let otherCalls = 0;
    await cachedRead("claimed:snake:1:SP_A", 60_000, async () => ++claimedCalls);
    await cachedRead("claimable:snake:1:SP_A", 60_000, async () => ++claimedCalls);
    await cachedRead("claimed:tetris:1:SP_A", 60_000, async () => ++otherCalls);

    const d2 = deps({ findClaimable: vi.fn(async () => []) });
    await useUnclaimedPrizes.getState().refresh({ gameId: "snake", season: 1 }, d2);

    await cachedRead("claimed:snake:1:SP_A", 60_000, async () => ++claimedCalls);
    await cachedRead("claimable:snake:1:SP_A", 60_000, async () => ++claimedCalls);
    await cachedRead("claimed:tetris:1:SP_A", 60_000, async () => ++otherCalls);
    expect(claimedCalls).toBe(4); // both snake keys refetched
    expect(otherCalls).toBe(1);   // tetris key untouched

    const s = useUnclaimedPrizes.getState();
    expect(s.status).toBe("done");
    expect(s.claims).toEqual([]); // re-scan saw nothing left
  });

  it("refresh without a prior scan is a no-op", async () => {
    const d = deps();
    await useUnclaimedPrizes.getState().refresh({ gameId: "snake", season: 1 }, d);
    expect(d.fetchSnapshot).not.toHaveBeenCalled();
  });

  it("reset clears everything", async () => {
    await useUnclaimedPrizes.getState().scan("SP_A", deps());
    useUnclaimedPrizes.getState().reset();
    const s = useUnclaimedPrizes.getState();
    expect(s).toMatchObject({
      status: "idle", scannedFor: null, claims: [], totalUstx: 0, gamesCount: 0, topGame: null,
    });
  });
});
