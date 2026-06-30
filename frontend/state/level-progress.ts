"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type LevelProgressState = {
  /** address -> last acknowledged level (so a reload / wallet switch never re-toasts). */
  acknowledged: Record<string, number>;
  acknowledge: (address: string, level: number) => void;
};

export const useLevelProgress = create<LevelProgressState>()(
  persist(
    (set) => ({
      acknowledged: {},
      acknowledge: (address, level) =>
        set((s) => {
          const prev = s.acknowledged[address] ?? 0;
          if (level <= prev) return s;
          return { acknowledged: { ...s.acknowledged, [address]: level } };
        }),
    }),
    {
      name: "xp-arcade-level-progress",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({ acknowledged: state.acknowledged }),
    },
  ),
);
