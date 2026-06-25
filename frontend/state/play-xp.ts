"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { GAME_IDS, type GameId } from "@/lib/game-registry";

/** Flat XP for finishing any run, mint or not. */
export const PLAY_FINISH_XP = 10;
/** Each PLAY_SCORE_DIVISOR points of score adds 1 XP. Score is capped at
 *  MAX-SCORE (u9999) on-chain, so this stays bounded. */
export const PLAY_SCORE_DIVISOR = 25;

export function playXpForRun(score: number): number {
  const s = Math.max(0, Math.floor(score));
  return PLAY_FINISH_XP + Math.floor(s / PLAY_SCORE_DIVISOR);
}

function emptyByGame(): Record<GameId, number> {
  return Object.fromEntries(GAME_IDS.map((id) => [id, 0])) as Record<
    GameId,
    number
  >;
}

type PlayXpState = {
  lifetimeXp: number;
  byGame: Record<GameId, number>;
  addPlay: (gameId: GameId, score: number) => void;
  reset: () => void;
};

export const usePlayXp = create<PlayXpState>()(
  persist(
    (set) => ({
      lifetimeXp: 0,
      byGame: emptyByGame(),
      addPlay: (gameId, score) =>
        set((s) => {
          const gained = playXpForRun(score);
          return {
            lifetimeXp: s.lifetimeXp + gained,
            byGame: { ...s.byGame, [gameId]: (s.byGame[gameId] ?? 0) + gained },
          };
        }),
      reset: () => set({ lifetimeXp: 0, byGame: emptyByGame() }),
    }),
    {
      name: "xp-arcade-play-xp",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        lifetimeXp: state.lifetimeXp,
        byGame: state.byGame,
      }),
      // Backfill any games added since the data was persisted, so byGame[id]
      // is never undefined.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PlayXpState>;
        return {
          ...current,
          lifetimeXp: typeof p.lifetimeXp === "number" ? p.lifetimeXp : 0,
          byGame: { ...emptyByGame(), ...(p.byGame ?? {}) },
        };
      },
    },
  ),
);
