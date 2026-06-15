import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DailyChallengeWidget } from "./DailyChallengeWidget";
import { useDailyChallenge } from "@/state/daily-challenge";
import { dailyChallenge, todayKey, saveDailyState, DAILY_STORAGE_KEY } from "@/lib/daily-challenge";
import { GAMES } from "@/lib/game-registry";

// Enable React act() so createRoot + act() flush effects synchronously
// (required for useSyncExternalStore to use client snapshot, not getInitialState).
// @ts-expect-error -- non-standard React internal flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.removeItem(DAILY_STORAGE_KEY);
  useDailyChallenge.setState({ lastCompletedDate: null, currentStreak: 0, bestStreak: 0 });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

describe("DailyChallengeWidget", () => {
  it("shows today's game label and a not-done status", () => {
    act(() => { root.render(<DailyChallengeWidget />); });
    const html = container.innerHTML;
    const { gameId } = dailyChallenge(todayKey());
    expect(html).toContain(GAMES[gameId].label);
    expect(html.toLowerCase()).toContain("today");
    expect(html.toLowerCase()).toContain("play");
  });

  it("shows a completed state and the streak once done today", () => {
    const today = todayKey();
    // Persist state to localStorage so hydrate() loads it correctly.
    const completedState = { lastCompletedDate: today, currentStreak: 3, bestStreak: 5 };
    saveDailyState(completedState);
    useDailyChallenge.setState(completedState);
    act(() => { root.render(<DailyChallengeWidget />); });
    const html = container.innerHTML;
    expect(html).toMatch(/✓|Completed|completed/);
    expect(html).toContain("3"); // current streak
  });
});
