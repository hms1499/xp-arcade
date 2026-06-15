// frontend/state/daily-challenge.ts
"use client";
import { create } from "zustand";
import { type GameId } from "@/lib/game-registry";
import {
  type DailyChallengeState,
  applyCompletion,
  loadDailyState,
  meetsDailyTarget,
  saveDailyState,
  todayKey,
} from "@/lib/daily-challenge";

type DailyChallengeStore = DailyChallengeState & {
  hydrate: () => void;
  recordPlay: (gameId: GameId, score: number) => void;
};

export const useDailyChallenge = create<DailyChallengeStore>((set, get) => ({
  lastCompletedDate: null,
  currentStreak: 0,
  bestStreak: 0,

  hydrate: () => set(loadDailyState()),

  recordPlay: (gameId, score) => {
    const today = todayKey();
    if (!meetsDailyTarget(gameId, score, today)) return;
    const { lastCompletedDate, currentStreak, bestStreak } = get();
    const next = applyCompletion({ lastCompletedDate, currentStreak, bestStreak }, today);
    set(next);
    saveDailyState(next);
  },
}));
