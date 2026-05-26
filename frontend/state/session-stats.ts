"use client";
import { create } from "zustand";
import { type GameId } from "@/lib/game-registry";

export type GameSessionStats = {
  runs: number;
  bestScore: number;
  lastScore: number;
  totalScore: number;
};

type SessionStatsState = {
  byGame: Record<GameId, GameSessionStats>;
  recordResult: (gameId: GameId, score: number) => void;
  reset: () => void;
};

const EMPTY_GAME_STATS: GameSessionStats = {
  runs: 0,
  bestScore: 0,
  lastScore: 0,
  totalScore: 0,
};

function emptyStats(): Record<GameId, GameSessionStats> {
  return {
    snake: { ...EMPTY_GAME_STATS },
    tetris: { ...EMPTY_GAME_STATS },
    pacman: { ...EMPTY_GAME_STATS },
  };
}

export const useSessionStats = create<SessionStatsState>((set) => ({
  byGame: emptyStats(),
  recordResult: (gameId, score) =>
    set((s) => {
      const current = s.byGame[gameId];
      return {
        byGame: {
          ...s.byGame,
          [gameId]: {
            runs: current.runs + 1,
            bestScore: Math.max(current.bestScore, score),
            lastScore: score,
            totalScore: current.totalScore + score,
          },
        },
      };
    }),
  reset: () => set({ byGame: emptyStats() }),
}));
