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
  | "browser"
  | "swap";

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
  /** Set once the user has resized; undefined = default width, auto height. */
  w?: number;
  h?: number;
  payload?: WindowPayload;
};

type S = {
  windows: WindowEntry[];
  topZ: number;
  lastPos: Partial<Record<WindowType, { x: number; y: number; w?: number; h?: number }>>;
  open: (type: WindowType, payload?: WindowPayload) => void;
  close: (id: string) => void;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  resize: (id: string, geom: WindowGeometry) => void;
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

export type WindowGeometry = { x: number; y: number; w: number; h: number };
export type ResizeEdges = {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
};

export const MIN_WINDOW_W = 300;
export const MIN_WINDOW_H = 200;
const TASKBAR_H = 28;

/**
 * Resizable = every non-game window. Deliberately NOT isUtilityType: that
 * helper is Escape-close semantics and excludes the browser, which must
 * still be resizable.
 */
export function isResizableType(type: WindowType): boolean {
  return !type.startsWith("game-");
}

/**
 * Clamp a window's geometry: 300x200 minimum (which wins over a degenerate
 * viewport), viewport-minus-taskbar maximum, and position bounds matching
 * the title-bar drag clamp so the title bar stays reachable.
 */
export function clampGeometry(
  geom: WindowGeometry,
  viewport: { width: number; height: number },
): WindowGeometry {
  const w = Math.min(geom.w, Math.max(MIN_WINDOW_W, viewport.width));
  const h = Math.min(geom.h, Math.max(MIN_WINDOW_H, viewport.height - TASKBAR_H));
  const cw = Math.max(w, MIN_WINDOW_W);
  const ch = Math.max(h, MIN_WINDOW_H);
  return {
    x: Math.max(-cw + 60, Math.min(geom.x, viewport.width - 60)),
    y: Math.max(0, Math.min(geom.y, viewport.height - TASKBAR_H)),
    w: cw,
    h: ch,
  };
}

/**
 * Apply a pointer delta to the edges being dragged. Size is clamped first
 * and position derived from it, so when a left/top drag hits the size
 * limit the opposite edge stays anchored (real-Windows behavior).
 */
export function resizeGeometry(
  start: WindowGeometry,
  edges: ResizeEdges,
  dx: number,
  dy: number,
  viewport: { width: number; height: number },
): WindowGeometry {
  const raw: WindowGeometry = {
    x: start.x,
    y: start.y,
    w: edges.right ? start.w + dx : edges.left ? start.w - dx : start.w,
    h: edges.bottom ? start.h + dy : edges.top ? start.h - dy : start.h,
  };
  const clamped = clampGeometry(raw, viewport);
  return clampGeometry(
    {
      ...clamped,
      x: edges.left ? start.x + (start.w - clamped.w) : clamped.x,
      y: edges.top ? start.y + (start.h - clamped.h) : clamped.y,
    },
    viewport,
  );
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
          w: remembered?.w,
          h: remembered?.h,
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
        lastPos: win
          ? { ...s.lastPos, [win.type]: { ...s.lastPos[win.type], x, y } }
          : s.lastPos,
      };
    }),
  resize: (id, geom) =>
    set((s) => {
      const win = s.windows.find((w) => w.id === id);
      // no-op: unknown id — same state ref so Zustand skips re-render
      if (!win) return s;
      const g =
        typeof window === "undefined"
          ? geom
          : clampGeometry(geom, {
              width: window.innerWidth,
              height: window.innerHeight,
            });
      return {
        windows: s.windows.map((w) =>
          w.id === id ? { ...w, x: g.x, y: g.y, w: g.w, h: g.h } : w,
        ),
        lastPos: { ...s.lastPos, [win.type]: { x: g.x, y: g.y, w: g.w, h: g.h } },
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
