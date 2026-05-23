"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getTopTenForGame, type TopEntry } from "@/lib/contract-calls";
import { GAMES, type GameId } from "@/lib/game-registry";
import { summarizeLeaderboard, type LeaderboardSummary } from "@/lib/leaderboard-showcase";

const GAME_IDS = Object.keys(GAMES) as GameId[];

type RowsByGame = Record<GameId, TopEntry[]>;

const EMPTY_ROWS: RowsByGame = {
  snake: [],
  tetris: [],
  pacman: [],
};

export function useLeaderboardShowcase() {
  const [rowsByGame, setRowsByGame] = useState<RowsByGame>(EMPTY_ROWS);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const entries = await Promise.all(
        GAME_IDS.map(async (gameId) => [gameId, await getTopTenForGame(gameId)] as const),
      );
      setRowsByGame(Object.fromEntries(entries) as RowsByGame);
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
    summaries,
    lastUpdated,
    error,
    refresh,
  };
}
