"use client";
import { create } from "zustand";
import { type GameId } from "@/lib/game-registry";

export type WindowType =
  | `game-${GameId}`
  | "highscore"
  | "hall-of-fame"
  | "arcade-champion"
  | "mynfts"
  | "season-admin"
  | "player-profile"
  | "control-panel"
  | "how-it-works"
  | "browser";

export type WindowPayload = {
  address?: string;
  initialTab?: GameId;
  initialGame?: GameId;
};

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
  lastPos: Partial<Record<WindowType, { x: number; y: number }>>;
  open: (type: WindowType, payload?: WindowPayload) => void;
  close: (id: string) => void;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  toggleMaximize: (id: string) => void;
  closeTopWindowIfUtility: () => void;
};

/**
 * Cascade anchor for the Nth concurrently-open window. Wraps every 8 windows so
 * a long session never sends new windows marching off the bottom-right.
 */
export function cascadePosition(count: number): { x: number; y: number } {
  const STEP = 24;
  const n = ((count % 8) + 8) % 8;
  return { x: 100 + n * STEP, y: 80 + n * STEP };
}

/** A "utility" window is closable via Escape; games and the browser are not. */
export function isUtilityType(type: WindowType): boolean {
  return !type.startsWith("game-") && type !== "browser";
}

/**
 * On phones/short viewports every window renders full-screen (see Window.tsx),
 * so two open windows stack invisibly and look like the app froze. Keep just
 * one visible: minimize every other non-minimized window. Pure for testing.
 */
export function soloVisible(
  windows: WindowEntry[],
  keepId: string,
): WindowEntry[] {
  return windows.map((w) =>
    w.id === keepId || w.minimized ? w : { ...w, minimized: true },
  );
}

/** True when the viewport forces full-screen windows (matches Window.tsx). */
export function isCompactViewport(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(max-width: 640px), (max-height: 620px)").matches;
}

export const useWindows = create<S>((set, get) => ({
  windows: [],
  topZ: 10,
  lastPos: {},
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
    // Reopen where the user last left this window; otherwise cascade.
    const remembered = get().lastPos[type];
    const pos = remembered ?? cascadePosition(get().windows.length);
    const id = `${type}-${Date.now()}`;
    set((s) => {
      const next = [
        ...s.windows,
        {
          id,
          type,
          x: pos.x,
          y: pos.y,
          z,
          minimized: false,
          // Solitaire's Klondike board and the browser both need the room —
          // open them maximized.
          maximized: type === "game-solitaire" || type === "browser",
          payload,
        },
      ];
      return {
        topZ: z,
        windows: isCompactViewport() ? soloVisible(next, id) : next,
      };
    });
  },
  close: (id) =>
    set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),
  focus: (id) =>
    set((s) => {
      const z = s.topZ + 1;
      const next = s.windows.map((w) =>
        w.id === id ? { ...w, z, minimized: false } : w
      );
      return {
        topZ: z,
        windows: isCompactViewport() ? soloVisible(next, id) : next,
      };
    }),
  minimize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)),
    })),
  move: (id, x, y) =>
    set((s) => {
      const win = s.windows.find((w) => w.id === id);
      return {
        windows: s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)),
        lastPos: win ? { ...s.lastPos, [win.type]: { x, y } } : s.lastPos,
      };
    }),
  closeTopWindowIfUtility: () =>
    set((s) => {
      const visible = s.windows.filter((w) => !w.minimized);
      if (visible.length === 0) return s;
      const top = visible.reduce((a, b) => (b.z > a.z ? b : a));
      // A game/browser on top owns Escape (pause etc.) — leave it alone.
      if (!isUtilityType(top.type)) return s;
      return { windows: s.windows.filter((w) => w.id !== top.id) };
    }),
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
