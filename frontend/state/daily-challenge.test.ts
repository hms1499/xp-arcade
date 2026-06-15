// frontend/state/daily-challenge.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useDailyChallenge } from "./daily-challenge";
import {
  DAILY_STORAGE_KEY,
  dailyChallenge,
  todayKey,
} from "@/lib/daily-challenge";
import { GAME_IDS } from "@/lib/game-registry";

beforeEach(() => {
  localStorage.removeItem(DAILY_STORAGE_KEY);
  useDailyChallenge.setState({
    lastCompletedDate: null,
    currentStreak: 0,
    bestStreak: 0,
  });
});

describe("useDailyChallenge store", () => {
  it("completes today's challenge when the target game hits the target", () => {
    const today = todayKey();
    const { gameId, target } = dailyChallenge(today);
    useDailyChallenge.getState().recordPlay(gameId, target);
    const s = useDailyChallenge.getState();
    expect(s.lastCompletedDate).toBe(today);
    expect(s.currentStreak).toBe(1);
    expect(s.bestStreak).toBe(1);
  });

  it("ignores a non-target game and a below-target score", () => {
    const today = todayKey();
    const { gameId, target } = dailyChallenge(today);
    const other = GAME_IDS.find((g) => g !== gameId)!;
    useDailyChallenge.getState().recordPlay(other, 999_999);
    useDailyChallenge.getState().recordPlay(gameId, target - 1);
    expect(useDailyChallenge.getState().lastCompletedDate).toBeNull();
  });

  it("does not double-count a second completion the same day", () => {
    const today = todayKey();
    const { gameId, target } = dailyChallenge(today);
    useDailyChallenge.getState().recordPlay(gameId, target);
    useDailyChallenge.getState().recordPlay(gameId, target + 50);
    expect(useDailyChallenge.getState().currentStreak).toBe(1);
  });

  it("persists completions and reloads them via hydrate", () => {
    const today = todayKey();
    const { gameId, target } = dailyChallenge(today);
    useDailyChallenge.getState().recordPlay(gameId, target);
    // wipe in-memory, then hydrate from localStorage
    useDailyChallenge.setState({ lastCompletedDate: null, currentStreak: 0, bestStreak: 0 });
    useDailyChallenge.getState().hydrate();
    expect(useDailyChallenge.getState().lastCompletedDate).toBe(today);
  });
});
