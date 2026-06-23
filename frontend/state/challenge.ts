"use client";
import { create } from "zustand";
import type { Challenge } from "@/lib/challenge-link";

export type ChallengeStatus = "pending" | "accepted" | "met";

type ChallengeState = {
  active: Challenge | null;
  status: ChallengeStatus | null;
  setPending: (c: Challenge) => void;
  accept: () => void;
  decline: () => void;
  markMet: () => void;
  clear: () => void;
};

export const useChallenge = create<ChallengeState>((set) => ({
  active: null,
  status: null,
  setPending: (c) => set({ active: c, status: "pending" }),
  accept: () => set((s) => (s.status === "pending" ? { status: "accepted" } : s)),
  decline: () => set({ active: null, status: null }),
  markMet: () => set((s) => (s.status === "accepted" ? { status: "met" } : s)),
  clear: () => set({ active: null, status: null }),
}));
