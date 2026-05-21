"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { GameId } from "@/lib/game-registry";

export type PayoutStatus = "pending" | "success" | "failed";

export type PayoutEntry = {
  txId: string;
  status: PayoutStatus;
  submittedAt: number;
};

export function payoutKey(gameId: GameId, season: number, player: string): string {
  return `${gameId}-${season}-${player}`;
}

type State = {
  entries: Record<string, PayoutEntry>;
  submit: (gameId: GameId, season: number, player: string, txId: string) => void;
  updateStatus: (
    gameId: GameId,
    season: number,
    player: string,
    status: PayoutStatus,
  ) => void;
  get: (gameId: GameId, season: number, player: string) => PayoutEntry | undefined;
};

export const usePayoutLedger = create<State>()(
  persist(
    (set, getState) => ({
      entries: {},
      submit: (gameId, season, player, txId) => {
        const key = payoutKey(gameId, season, player);
        set((s) => ({
          entries: {
            ...s.entries,
            [key]: { txId, status: "pending", submittedAt: Date.now() },
          },
        }));
      },
      updateStatus: (gameId, season, player, status) => {
        const key = payoutKey(gameId, season, player);
        set((s) => {
          const existing = s.entries[key];
          if (!existing) return s;
          return { entries: { ...s.entries, [key]: { ...existing, status } } };
        });
      },
      get: (gameId, season, player) =>
        getState().entries[payoutKey(gameId, season, player)],
    }),
    {
      name: "xp-arcade-payout-ledger",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
