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

export function useLeaderboardShowcase() {
  const [rowsByGame, setRowsByGame] = useState<RowsByGame>(EMPTY_ROWS);
  const [seasonsByGame, setSeasonsByGame] = useState<SeasonsByGame>(EMPTY_SEASONS);
  const [poolsByGame, setPoolsByGame] = useState<PoolsByGame>(EMPTY_POOLS);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [rowEntries, seasonEntries, poolEntries] = await Promise.all([
        Promise.all(
          GAME_IDS.map(async (gameId) => [gameId, await getTopTenForGame(gameId)] as const),
        ),
        Promise.all(
          GAME_IDS.map(async (gameId) => [gameId, await getCurrentSeasonForGame(gameId)] as const),
        ),
        Promise.all(
          GAME_IDS.map(async (gameId) => [
            gameId,
            await getPrizePoolBalanceForGame(gameId).catch(() => null),
          ] as const),
        ),
      ] as const);
      setRowsByGame(Object.fromEntries(rowEntries) as RowsByGame);
      setSeasonsByGame(
        Object.fromEntries(seasonEntries) as SeasonsByGame,
      );
      setPoolsByGame(Object.fromEntries(poolEntries) as PoolsByGame);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Leaderboard refresh failed");
    }
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
