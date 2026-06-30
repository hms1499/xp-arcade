// frontend/hooks/useLevelUpToast.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PlayerStats } from "@/lib/player-stats";

// stats come from a mocked dependency hook; base XP is held constant per test and
// the *live* increase is driven by bumping the real play-XP store (as a game-over
// would), which re-renders the probe.
let mockStats: PlayerStats | null = null;
vi.mock("./useConnectedPlayerStats", () => ({
  useConnectedPlayerStats: () => ({ stats: mockStats }),
}));

import { useWallet } from "@/state/wallet";
import { usePlayXp } from "@/state/play-xp";
import { useDailyChallenge } from "@/state/daily-challenge";
import { useToasts } from "@/state/toasts";
import { useLevelProgress } from "@/state/level-progress";
import { useLevelUpToast } from "./useLevelUpToast";

// @ts-expect-error -- non-standard React internal flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  useLevelUpToast();
  return null;
}
function statsWithScore(totalScore: number): PlayerStats {
  return { totalScore } as PlayerStats;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear(); // keep daily-challenge hydrate() from pulling stale streak
  mockStats = null;
  useWallet.setState({ address: "SP_A" });
  // computeLevel: level = floor(sqrt(xp/100)) + 1. xp 0 -> Lv1; 2500 -> Lv6; 4900 -> Lv8.
  usePlayXp.setState({ lifetimeXp: 0 });
  useDailyChallenge.setState({ bestStreak: 0, currentStreak: 0, lastCompletedDate: null });
  useToasts.setState({ toasts: [] });
  useLevelProgress.setState({ acknowledged: {} });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

describe("useLevelUpToast", () => {
  it("does nothing while stats are still loading", () => {
    mockStats = null;
    act(() => { root.render(<Probe />); });
    expect(useToasts.getState().toasts).toHaveLength(0);
    expect(useLevelProgress.getState().acknowledged.SP_A).toBeUndefined();
  });

  it("baselines silently on first observation (no toast)", () => {
    mockStats = statsWithScore(2500); // Lv6
    act(() => { root.render(<Probe />); });
    expect(useToasts.getState().toasts).toHaveLength(0);
    expect(useLevelProgress.getState().acknowledged.SP_A).toBe(6);
  });

  it("toasts on a live level increase after baseline", () => {
    mockStats = statsWithScore(2500); // Lv6 baseline
    act(() => { root.render(<Probe />); });
    expect(useToasts.getState().toasts).toHaveLength(0);
    act(() => { usePlayXp.setState({ lifetimeXp: 2400 }); }); // xp 4900 -> Lv8
    expect(useToasts.getState().toasts.length).toBeGreaterThan(0);
    expect(useToasts.getState().toasts[0].type).toBe("info"); // 6→8 stays in "Player" band — no title change
    expect(useLevelProgress.getState().acknowledged.SP_A).toBe(8);
  });
});
