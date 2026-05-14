"use client";
import { create } from "zustand";

export type WindowType = "game" | "leaderboard" | "my-nfts" | "season-admin";

export type WindowEntry = {
  id: string;
  type: WindowType;
  x: number;
  y: number;
  z: number;
  minimized: boolean;
};

type S = {
  windows: WindowEntry[];
  topZ: number;
  open: (type: WindowType) => void;
  close: (id: string) => void;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
};

export const useWindows = create<S>((set, get) => ({
  windows: [],
  topZ: 10,
  open: (type) => {
    const existing = get().windows.find((w) => w.type === type);
    if (existing) {
      get().focus(existing.id);
      return;
    }
    const z = get().topZ + 1;
    set((s) => ({
      topZ: z,
      windows: [
        ...s.windows,
        {
          id: `${type}-${Date.now()}`,
          type,
          x: 100 + s.windows.length * 24,
          y: 80 + s.windows.length * 24,
          z,
          minimized: false,
        },
      ],
    }));
  },
  close: (id) =>
    set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),
  focus: (id) =>
    set((s) => {
      const z = s.topZ + 1;
      return {
        topZ: z,
        windows: s.windows.map((w) =>
          w.id === id ? { ...w, z, minimized: false } : w
        ),
      };
    }),
  minimize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)),
    })),
  move: (id, x, y) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)),
    })),
}));
