import { describe, it, expect } from "vitest";
import {
  todayKey,
  dailyGame,
  DAILY_TARGETS,
  dailyChallenge,
  isYesterday,
  applyCompletion,
  type DailyChallengeState,
  viewStreak,
  meetsDailyTarget,
  loadDailyState,
  saveDailyState,
  dailyTargetLabel,
  DAILY_STORAGE_KEY,
} from "./daily-challenge";
import { GAME_IDS } from "./game-registry";

describe("dailyTargetLabel", () => {
  it("frames time-based games as a finish-time ceiling, not a score to reach", () => {
    // solitaire 4000 = 720000/4000 = 180s; meeting it means WINNING in ≤180s.
    expect(dailyTargetLabel("solitaire", 4000)).toBe("Win in ≤ 180s");
    // minesweeper 9819 = 9999 - 180 = 180s.
    expect(dailyTargetLabel("minesweeper", 9819)).toBe("Clear in ≤ 180s");
  });

  it("frames points games as a score to reach", () => {
    expect(dailyTargetLabel("snake", 150)).toBe("Reach 150");
  });
});

describe("todayKey", () => {
  it("formats a date as local YYYY-MM-DD with zero padding", () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe("2026-01-05"); // Jan 5
    expect(todayKey(new Date(2026, 11, 31))).toBe("2026-12-31"); // Dec 31
  });
});

describe("dailyGame", () => {
  it("is deterministic for a given day key", () => {
    expect(dailyGame("2026-06-15")).toBe(dailyGame("2026-06-15"));
  });

  it("always returns a registered game id", () => {
    expect(GAME_IDS).toContain(dailyGame("2026-06-15"));
  });

  it("rotates across every game over a year of days", () => {
    const seen = new Set<string>();
    const start = new Date(2026, 0, 1);
    for (let i = 0; i < 365; i++) {
      const d = new Date(start.getTime() + i * 86_400_000);
      seen.add(dailyGame(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`));
    }
    for (const id of GAME_IDS) expect(seen.has(id)).toBe(true);
  });
});

describe("DAILY_TARGETS / dailyChallenge", () => {
  it("has a target for every registered game", () => {
    for (const id of GAME_IDS) {
      expect(typeof DAILY_TARGETS[id]).toBe("number");
      expect(DAILY_TARGETS[id]).toBeGreaterThan(0);
    }
  });

  it("minesweeper target encodes a 180s clear", () => {
    expect(DAILY_TARGETS.minesweeper).toBe(9819); // 9999 - 180
  });

  it("combines today's game and its target", () => {
    const c = dailyChallenge("2026-06-15");
    expect(c.gameId).toBe(dailyGame("2026-06-15"));
    expect(c.target).toBe(DAILY_TARGETS[c.gameId]);
  });
});

describe("isYesterday", () => {
  it("true when prev is the calendar day before today", () => {
    expect(isYesterday("2026-06-14", "2026-06-15")).toBe(true);
    expect(isYesterday("2026-02-28", "2026-03-01")).toBe(true); // month boundary
    expect(isYesterday("2025-12-31", "2026-01-01")).toBe(true); // year boundary
  });

  it("false for same day, gaps, or future", () => {
    expect(isYesterday("2026-06-15", "2026-06-15")).toBe(false);
    expect(isYesterday("2026-06-13", "2026-06-15")).toBe(false);
    expect(isYesterday("2026-06-16", "2026-06-15")).toBe(false);
  });

  it("holds across DST transitions (23h / 25h local days)", () => {
    // US spring-forward (23h day) and fall-back (25h day) in 2026.
    // A ms-difference check would wrongly return false on these boundaries.
    expect(isYesterday("2026-03-08", "2026-03-09")).toBe(true); // spring forward
    expect(isYesterday("2026-11-01", "2026-11-02")).toBe(true); // fall back
  });
});

const EMPTY: DailyChallengeState = {
  lastCompletedDate: null,
  currentStreak: 0,
  bestStreak: 0,
};

describe("applyCompletion", () => {
  it("starts a streak at 1 on first ever completion", () => {
    const s = applyCompletion(EMPTY, "2026-06-15");
    expect(s).toEqual({ lastCompletedDate: "2026-06-15", currentStreak: 1, bestStreak: 1 });
  });

  it("increments on a consecutive day", () => {
    const day1 = applyCompletion(EMPTY, "2026-06-14");
    const day2 = applyCompletion(day1, "2026-06-15");
    expect(day2.currentStreak).toBe(2);
    expect(day2.bestStreak).toBe(2);
  });

  it("resets to 1 after a gap but keeps bestStreak", () => {
    let s = applyCompletion(EMPTY, "2026-06-10");
    s = applyCompletion(s, "2026-06-11"); // streak 2, best 2
    s = applyCompletion(s, "2026-06-15"); // gap -> reset to 1
    expect(s.currentStreak).toBe(1);
    expect(s.bestStreak).toBe(2);
  });

  it("is idempotent for the same day", () => {
    const once = applyCompletion(EMPTY, "2026-06-15");
    const twice = applyCompletion(once, "2026-06-15");
    expect(twice).toEqual(once);
  });
});

describe("viewStreak", () => {
  it("shows the live streak when last completion is today", () => {
    const s = applyCompletion(EMPTY, "2026-06-15");
    expect(viewStreak(s, "2026-06-15")).toEqual({
      currentStreak: 1,
      bestStreak: 1,
      completedToday: true,
    });
  });

  it("keeps the streak alive when last completion was yesterday", () => {
    const s = { lastCompletedDate: "2026-06-14", currentStreak: 3, bestStreak: 5 };
    expect(viewStreak(s, "2026-06-15")).toEqual({
      currentStreak: 3,
      bestStreak: 5,
      completedToday: false,
    });
  });

  it("decays a stale streak to 0 but preserves bestStreak", () => {
    const s = { lastCompletedDate: "2026-06-10", currentStreak: 3, bestStreak: 5 };
    expect(viewStreak(s, "2026-06-15")).toEqual({
      currentStreak: 0,
      bestStreak: 5,
      completedToday: false,
    });
  });
});

describe("meetsDailyTarget", () => {
  it("true only for today's game at or above its target", () => {
    const day = "2026-06-15";
    const { gameId, target } = dailyChallenge(day);
    const other = GAME_IDS.find((g) => g !== gameId)!;
    expect(meetsDailyTarget(gameId, target, day)).toBe(true);
    expect(meetsDailyTarget(gameId, target - 1, day)).toBe(false);
    expect(meetsDailyTarget(other, 999_999, day)).toBe(false); // wrong game
  });
});

describe("load/save daily state", () => {
  it("round-trips through localStorage", () => {
    localStorage.removeItem(DAILY_STORAGE_KEY);
    expect(loadDailyState()).toEqual({
      lastCompletedDate: null,
      currentStreak: 0,
      bestStreak: 0,
    });
    saveDailyState({ lastCompletedDate: "2026-06-15", currentStreak: 2, bestStreak: 4 });
    expect(loadDailyState()).toEqual({
      lastCompletedDate: "2026-06-15",
      currentStreak: 2,
      bestStreak: 4,
    });
  });

  it("returns the safe default on malformed storage", () => {
    localStorage.setItem(DAILY_STORAGE_KEY, "not json");
    expect(loadDailyState()).toEqual({
      lastCompletedDate: null,
      currentStreak: 0,
      bestStreak: 0,
    });
  });
});
