import { GAME_IDS, type GameId } from "./game-registry";
import { readGameLeaderboard, type GameLeaderboard } from "./leaderboard-reads";

export type LeaderboardSnapshot = {
  updatedAt: string;
  games: Record<GameId, GameLeaderboard>;
};

const TTL_MS = 30_000;
const BATCH = 2; // limit concurrency against Hiro on a rebuild

let cache: { data: LeaderboardSnapshot; expiresAt: number } | null = null;
let inFlight: Promise<LeaderboardSnapshot> | null = null;

export function resetLeaderboardCacheForTest(): void {
  cache = null;
  inFlight = null;
}

function emptyGame(): GameLeaderboard {
  return { topTen: [], currentSeason: null, prizePool: null, seasonEndBlock: null };
}

/** Keep the previous good value where a fresh read came back empty/null. */
function mergeGame(fresh: GameLeaderboard, prev: GameLeaderboard | undefined): GameLeaderboard {
  if (!prev) return fresh;
  return {
    topTen: fresh.topTen.length ? fresh.topTen : prev.topTen,
    currentSeason: fresh.currentSeason ?? prev.currentSeason,
    prizePool: fresh.prizePool ?? prev.prizePool,
    seasonEndBlock: fresh.seasonEndBlock ?? prev.seasonEndBlock,
  };
}

async function rebuild(prev: LeaderboardSnapshot | null): Promise<LeaderboardSnapshot> {
  const games = {} as Record<GameId, GameLeaderboard>;
  for (let i = 0; i < GAME_IDS.length; i += BATCH) {
    const slice = GAME_IDS.slice(i, i + BATCH);
    const results = await Promise.all(slice.map((g) => readGameLeaderboard(g)));
    slice.forEach((g, idx) => {
      games[g] = mergeGame(results[idx], prev?.games[g]);
    });
  }
  return { updatedAt: new Date().toISOString(), games };
}

/** Cached leaderboard snapshot: fresh-within-TTL, single-flight rebuild,
 *  serve-stale on failure, never throws. */
export async function getLeaderboardSnapshot(): Promise<LeaderboardSnapshot> {
  if (cache && Date.now() < cache.expiresAt) return cache.data;
  if (inFlight) return inFlight;

  const prev = cache?.data ?? null;
  inFlight = rebuild(prev)
    .then((data) => {
      cache = { data, expiresAt: Date.now() + TTL_MS };
      return data;
    })
    .catch(() => {
      if (cache) return cache.data;
      const games = GAME_IDS.reduce((acc, g) => {
        acc[g] = emptyGame();
        return acc;
      }, {} as Record<GameId, GameLeaderboard>);
      return { updatedAt: new Date().toISOString(), games };
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
