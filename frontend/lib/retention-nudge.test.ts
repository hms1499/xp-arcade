import { beforeEach, describe, expect, it } from "vitest";
import {
  NUDGE_SHOWN_KEY,
  loadNudgeShown,
  markNudgeShown,
  shownTodayMap,
  streakRiskCandidate,
} from "./retention-nudge";
import type { NudgeSignals } from "./retention-nudge";

describe("nudge dedup persistence", () => {
  beforeEach(() => localStorage.clear());

  it("loads empty when nothing stored", () => {
    expect(loadNudgeShown()).toEqual({});
  });

  it("records and reloads a kind's shown date", () => {
    markNudgeShown("streak-risk", "2026-06-23");
    expect(loadNudgeShown()["streak-risk"]).toBe("2026-06-23");
  });

  it("shownTodayMap marks only kinds shown on `today`", () => {
    const stored = { "streak-risk": "2026-06-23", "rank-drop": "2026-06-22" };
    expect(shownTodayMap(stored, "2026-06-23")).toEqual({ "streak-risk": true });
  });

  it("returns empty on corrupt JSON", () => {
    localStorage.setItem(NUDGE_SHOWN_KEY, "{nope");
    expect(loadNudgeShown()).toEqual({});
  });
});

function baseSignals(over: Partial<NudgeSignals> = {}): NudgeSignals {
  return {
    address: null,
    streak: { currentStreak: 0, bestStreak: 0, completedToday: false },
    dailyGame: "snake",
    ranks: null,
    lastSeenRanks: null,
    countdowns: {},
    shownToday: {},
    ...over,
  };
}

describe("streakRiskCandidate", () => {
  it("fires when streak alive and not completed today", () => {
    const n = streakRiskCandidate(baseSignals({
      streak: { currentStreak: 4, bestStreak: 9, completedToday: false },
      dailyGame: "tetris",
    }));
    expect(n?.kind).toBe("streak-risk");
    expect(n?.cta.target).toEqual({ window: "game", gameId: "tetris" });
    expect(n?.body).toContain("4");
  });

  it("does not fire when already completed today", () => {
    expect(streakRiskCandidate(baseSignals({
      streak: { currentStreak: 4, bestStreak: 9, completedToday: true },
    }))).toBeNull();
  });

  it("does not fire when streak is zero", () => {
    expect(streakRiskCandidate(baseSignals({
      streak: { currentStreak: 0, bestStreak: 9, completedToday: false },
    }))).toBeNull();
  });
});
