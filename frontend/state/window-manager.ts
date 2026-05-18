"use client";
import { create } from "zustand";

export type WindowType =
  | "game"
  | "leaderboard"
  | "my-nfts"
  | "season-admin"
  | "player-profile";

export type WindowPayload = { address?: string };

export type WindowEntry = {
  id: string;
  type: WindowType;
  x: number;
  y: number;
  z: number;
  minimized: boolean;
  maximized?: boolean;
  payload?: WindowPayload;
};

type S = {
  windows: WindowEntry[];
  topZ: number;
  open: (type: WindowType, payload?: WindowPayload) => void;
  close: (id: string) => void;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  toggleMaximize: (id: string) => void;
};

export const useWindows = create<S>((set, get) => ({
  windows: [],
  topZ: 10,
  open: (type, payload) => {
    const existing = get().windows.find((w) => w.type === type);
    if (existing) {
      if (payload) {
        set((s) => ({
          windows: s.windows.map((w) =>
            w.id === existing.id ? { ...w, payload } : w
          ),
        }));
      }
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
          payload,
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
  toggleMaximize: (id) =>
    set((s) => {
      // no-op: unknown id — return same state ref so Zustand skips re-render
      if (!s.windows.some((w) => w.id === id)) return s;
      const z = s.topZ + 1;
      return {
        topZ: z,
        windows: s.windows.map((w) =>
          w.id === id ? { ...w, maximized: !w.maximized, z } : w,
        ),
      };
    }),
}));

/**
 * A window is "active" (the one the player is interacting with) when it
 * exists, is not minimized, and sits at the top of the z-order. Mirrors the
 * isActive logic in Window.tsx. Pure so it can be unit-tested.
 *
 * Pass the live max z among non-minimized windows (as Window.tsx computes
 * it), NOT the store's monotonic `topZ` — `topZ` is never decremented when
 * the top window closes, which would yield false negatives.
 */
export function isWindowActive(
  entry: WindowEntry | undefined,
  topZ: number,
): boolean {
  return !!entry && !entry.minimized && entry.z === topZ;
}
