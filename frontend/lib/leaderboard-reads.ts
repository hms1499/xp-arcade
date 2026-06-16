import {
  uintCV,
  cvToValue,
  fetchCallReadOnlyFunction,
} from "@stacks/transactions";
import { stacks } from "./stacks";
import { unwrap } from "./cv-unwrap";
import { GAMES, onchainIdFor, type GameId } from "./game-registry";
import { retryWithBackoff } from "./retry";

export type TopEntry = { player: string; score: number };

/** Per-game contract coordinates for a read-only call. */
export function gameBase(gameId: GameId) {
  const g = GAMES[gameId];
  return {
    network: stacks.network,
    contractAddress: g.contractAddress,
    contractName: g.contractName,
  };
}

export async function getTopTenForGame(gameId: GameId): Promise<TopEntry[]> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-top-ten",
    functionArgs: [uintCV(onchainIdFor(gameId))],
    senderAddress: GAMES[gameId].contractAddress,
  });
  const v = unwrap<Array<{ player: string; score: string }>>(cvToValue(res));
  return v.map((e) => ({ player: String(e.player), score: Number(e.score) }));
}

export async function getCurrentSeasonForGame(gameId: GameId): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-current-season",
    functionArgs: [uintCV(onchainIdFor(gameId))],
    senderAddress: GAMES[gameId].contractAddress,
  });
  return Number(unwrap(cvToValue(res)));
}

export async function getSeasonEndBlockForGame(gameId: GameId): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-season-end-block",
    functionArgs: [uintCV(onchainIdFor(gameId))],
    senderAddress: GAMES[gameId].contractAddress,
  });
  return Number(unwrap(cvToValue(res)));
}

export async function getPrizePoolBalanceForGame(gameId: GameId): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-prize-pool-balance",
    functionArgs: [uintCV(onchainIdFor(gameId))],
    senderAddress: GAMES[gameId].contractAddress,
  });
  return Number(unwrap(cvToValue(res)));
}

export type GameLeaderboard = {
  topTen: TopEntry[];
  currentSeason: number | null;
  prizePool: number | null;
  seasonEndBlock: number | null;
};

export type Readers = {
  topTen: (g: GameId) => Promise<TopEntry[]>;
  currentSeason: (g: GameId) => Promise<number>;
  prizePool: (g: GameId) => Promise<number>;
  seasonEndBlock: (g: GameId) => Promise<number>;
};

const defaultReaders: Readers = {
  topTen: getTopTenForGame,
  currentSeason: getCurrentSeasonForGame,
  prizePool: getPrizePoolBalanceForGame,
  seasonEndBlock: getSeasonEndBlockForGame,
};

async function safeRead<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await retryWithBackoff(fn);
  } catch {
    return fallback;
  }
}

/** Read one game's leaderboard fields; a failed field falls back, never throws. */
export async function readGameLeaderboard(
  gameId: GameId,
  readers: Readers = defaultReaders,
): Promise<GameLeaderboard> {
  const [topTen, currentSeason, prizePool, seasonEndBlock] = await Promise.all([
    safeRead<TopEntry[]>(() => readers.topTen(gameId), []),
    safeRead<number | null>(() => readers.currentSeason(gameId), null),
    safeRead<number | null>(() => readers.prizePool(gameId), null),
    safeRead<number | null>(() => readers.seasonEndBlock(gameId), null),
  ]);
  return { topTen, currentSeason, prizePool, seasonEndBlock };
}
