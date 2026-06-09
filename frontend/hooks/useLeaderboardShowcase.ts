"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCurrentSeasonForGame,
  getPrizePoolBalanceForGame,
  getTopTenForGame,
  type TopEntry,
} from "@/lib/contract-calls";
import { GAME_IDS, type GameId } from "@/lib/game-registry";
import { summarizeLeaderboard, type LeaderboardSummary } from "@/lib/leaderboard-showcase";

type RowsByGame = Record<GameId, TopEntry[]>;
type SeasonsByGame = Record<GameId, number | null>;
type PoolsByGame = Record<GameId, number | null>;

const EMPTY_ROWS = GAME_IDS.reduce((acc, gameId) => {
  acc[gameId] = [];
  return acc;
}, {} as RowsByGame);

const EMPTY_SEASONS = GAME_IDS.reduce((acc, gameId) => {
  acc[gameId] = null;
  return acc;
}, {} as SeasonsByGame);

const EMPTY_POOLS = GAME_IDS.reduce((acc, gameId) => {
  acc[gameId] = null;
  return acc;
}, {} as PoolsByGame);

/** Merge fresh per-game values over the previous map; a null entry means that
 * game's read failed, so its previous value is kept (no blanking). Relies on
 * getTopTenForGame/getCurrentSeasonForGame/getPrizePoolBalanceForGame never
 * resolving to null on success — null unambiguously signals a failed read. */
export function mergeWithFallback<T>(
  prev: Record<GameId, T>,
  entries: ReadonlyArray<readonly [GameId, T | null]>,
): Record<GameId, T> {
  const next = { ...prev };
  for (const [gameId, value] of entries) {
    if (value !== null) next[gameId] = value;
  }
  return next;
}

export function useLeaderboardShowcase() {
  const [rowsByGame, setRowsByGame] = useState<RowsByGame>(EMPTY_ROWS);
  const [seasonsByGame, setSeasonsByGame] = useState<SeasonsByGame>(EMPTY_SEASONS);
  const [poolsByGame, setPoolsByGame] = useState<PoolsByGame>(EMPTY_POOLS);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [rowEntries, seasonEntries, poolEntries] = await Promise.all([
      Promise.all(
        GAME_IDS.map(
          async (gameId) =>
            [gameId, await getTopTenForGame(gameId).catch(() => null)] as const,
        ),
      ),
      Promise.all(
        GAME_IDS.map(
          async (gameId) =>
            [
              gameId,
              await getCurrentSeasonForGame(gameId).catch(() => null),
            ] as const,
        ),
      ),
      Promise.all(
        GAME_IDS.map(
          async (gameId) =>
            [
              gameId,
              await getPrizePoolBalanceForGame(gameId).catch(() => null),
            ] as const,
        ),
      ),
    ] as const);

    setRowsByGame((prev) => mergeWithFallback(prev, rowEntries));
    setSeasonsByGame((prev) => mergeWithFallback(prev, seasonEntries));
    setPoolsByGame((prev) => mergeWithFallback(prev, poolEntries));
    setLastUpdated(new Date());
    const allFailed = rowEntries.every(([, value]) => value === null);
    setError(allFailed ? "Leaderboard refresh failed" : null);
  }, []);

  useEffect(() => {
    const initialId = setTimeout(() => {
      void refresh();
    }, 0);
    const id = setInterval(() => {
      void refresh();
    }, 30_000);
    return () => {
      clearTimeout(initialId);
      clearInterval(id);
    };
  }, [refresh]);

  const summaries = useMemo(
    () =>
      GAME_IDS.reduce(
        (acc, gameId) => {
          acc[gameId] = summarizeLeaderboard(gameId, rowsByGame[gameId]);
          return acc;
        },
        {} as Record<GameId, LeaderboardSummary>,
      ),
    [rowsByGame],
  );

  return {
    rowsByGame,
    seasonsByGame,
    poolsByGame,
    summaries,
    lastUpdated,
    error,
    refresh,
  };
}
