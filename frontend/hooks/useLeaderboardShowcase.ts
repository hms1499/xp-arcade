"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCurrentSeasonForGame,
  getTopTenForGame,
  type TopEntry,
} from "@/lib/contract-calls";
import { GAMES, type GameId } from "@/lib/game-registry";
import { summarizeLeaderboard, type LeaderboardSummary } from "@/lib/leaderboard-showcase";

const GAME_IDS = Object.keys(GAMES) as GameId[];

type RowsByGame = Record<GameId, TopEntry[]>;
type SeasonsByGame = Record<GameId, number | null>;

const EMPTY_ROWS: RowsByGame = {
  snake: [],
  tetris: [],
  pacman: [],
};

const EMPTY_SEASONS: SeasonsByGame = {
  snake: null,
  tetris: null,
  pacman: null,
};

export function useLeaderboardShowcase() {
  const [rowsByGame, setRowsByGame] = useState<RowsByGame>(EMPTY_ROWS);
  const [seasonsByGame, setSeasonsByGame] = useState<SeasonsByGame>(EMPTY_SEASONS);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [rowEntries, seasonEntries] = await Promise.all([
        Promise.all(
          GAME_IDS.map(async (gameId) => [gameId, await getTopTenForGame(gameId)] as const),
        ),
        Promise.all(
          GAME_IDS.map(async (gameId) => [gameId, await getCurrentSeasonForGame(gameId)] as const),
        ),
      ] as const);
      setRowsByGame(Object.fromEntries(rowEntries) as RowsByGame);
      setSeasonsByGame(
        Object.fromEntries(seasonEntries) as SeasonsByGame,
      );
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
    summaries,
    lastUpdated,
    error,
    refresh,
  };
}
