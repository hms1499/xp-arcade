"use client";
import { create } from "zustand";
import { GAME_IDS, type GameId } from "@/lib/game-registry";
import { fetchLeaderboardSnapshot } from "@/lib/leaderboard-snapshot";
import { findClaimablePrizes } from "@/lib/claimable-prizes";
import { invalidateReadCache } from "@/lib/read-cache";

export type UnclaimedPrize = { gameId: GameId; season: number; amountUstx: number };
export type UnclaimedSummary = { totalUstx: number; gamesCount: number; topGame: GameId };

export type ScanDeps = {
  fetchSnapshot: typeof fetchLeaderboardSnapshot;
  findClaimable: typeof findClaimablePrizes;
};

const defaultDeps: ScanDeps = {
  fetchSnapshot: fetchLeaderboardSnapshot,
  findClaimable: findClaimablePrizes,
};

/** Total, distinct-game count, and the game holding the single largest prize. */
export function summarize(claims: UnclaimedPrize[]): UnclaimedSummary | null {
  if (claims.length === 0) return null;
  let totalUstx = 0;
  let top = claims[0];
  const games = new Set<GameId>();
  for (const c of claims) {
    totalUstx += c.amountUstx;
    games.add(c.gameId);
    if (c.amountUstx > top.amountUstx) top = c;
  }
  return { totalUstx, gamesCount: games.size, topGame: top.gameId };
}

type S = {
  status: "idle" | "loading" | "done" | "error";
  scannedFor: string | null;
  claims: UnclaimedPrize[];
  totalUstx: number;
  gamesCount: number;
  topGame: GameId | null;
  scan: (address: string, deps?: ScanDeps) => Promise<void>;
  refresh: (claimed?: { gameId: GameId; season: number }, deps?: ScanDeps) => Promise<void>;
  reset: () => void;
};

const empty = {
  status: "idle" as const,
  scannedFor: null,
  claims: [],
  totalUstx: 0,
  gamesCount: 0,
  topGame: null,
};

// Module-level so concurrent scan calls (watcher + balloon) share one flight.
let inFlight: { address: string; promise: Promise<void> } | null = null;

export function resetUnclaimedForTest(): void {
  inFlight = null;
  useUnclaimedPrizes.setState(empty);
}

export const useUnclaimedPrizes = create<S>((set, get) => ({
  ...empty,

  scan: (address, deps = defaultDeps) => {
    if (get().scannedFor === address && get().status === "done") return Promise.resolve();
    if (inFlight?.address === address) return inFlight.promise;

    const promise = (async () => {
      set({ status: "loading", scannedFor: address });
      try {
        const snap = await deps.fetchSnapshot();
        const perGame = await Promise.all(
          GAME_IDS.map(async (gameId) => {
            const season = snap.games[gameId]?.currentSeason;
            if (!season || season <= 1) return [];
            const found = await deps.findClaimable(gameId, address, season).catch(() => []);
            return found
              .filter((c) => c.claimOpen)
              .map((c) => ({ gameId, season: c.season, amountUstx: c.amountUstx }));
          }),
        );
        if (get().scannedFor !== address) return; // wallet switched mid-scan
        const claims = perGame.flat();
        const sum = summarize(claims);
        set({
          status: "done",
          claims,
          totalUstx: sum?.totalUstx ?? 0,
          gamesCount: sum?.gamesCount ?? 0,
          topGame: sum?.topGame ?? null,
        });
      } catch {
        if (get().scannedFor !== address) return;
        set({ status: "error", claims: [], totalUstx: 0, gamesCount: 0, topGame: null });
      }
    })().finally(() => {
      if (inFlight?.address === address) inFlight = null;
    });
    inFlight = { address, promise };
    return promise;
  },

  refresh: async (claimed, deps = defaultDeps) => {
    const address = get().scannedFor;
    if (!address) return;
    if (claimed) {
      // Trailing colon so season 1 never prefix-matches season 10+ keys.
      invalidateReadCache(`claimed:${claimed.gameId}:${claimed.season}:`);
      invalidateReadCache(`claimable:${claimed.gameId}:${claimed.season}:`);
    }
    set({ status: "idle" }); // defeat the done-dedupe so scan really re-runs
    await get().scan(address, deps);
  },

  reset: () => {
    inFlight = null;
    set(empty);
  },
}));
