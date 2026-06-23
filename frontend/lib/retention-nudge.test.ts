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

import { seasonClosingCandidate } from "./retention-nudge";
import type { Countdown } from "./season-countdown";

const urgent = (endsAt: Date): Countdown => ({
  state: "live", endsAt, days: 0, hours: 5, minutes: 0, seconds: 0,
});
const notUrgent = (endsAt: Date): Countdown => ({
  state: "live", endsAt, days: 3, hours: 0, minutes: 0, seconds: 0,
});

describe("seasonClosingCandidate", () => {
  it("fires for an urgent countdown on a ranked game", () => {
    const n = seasonClosingCandidate(baseSignals({
      address: "SP1",
      ranks: { snake: 2, tetris: null, pacman: null, breakout: null, minesweeper: null, solitaire: null },
      countdowns: { snake: urgent(new Date(Date.now() + 5 * 3600_000)) },
    }));
    expect(n?.kind).toBe("season-closing");
    expect(n?.cta.target).toEqual({ window: "highscore", gameId: "snake" });
  });

  it("does not fire when the countdown is not urgent", () => {
    expect(seasonClosingCandidate(baseSignals({
      address: "SP1",
      ranks: { snake: 2, tetris: null, pacman: null, breakout: null, minesweeper: null, solitaire: null },
      countdowns: { snake: notUrgent(new Date(Date.now() + 3 * 86400_000)) },
    }))).toBeNull();
  });

  it("picks the soonest-ending urgent game when several qualify", () => {
    const soon = new Date(Date.now() + 1 * 3600_000);
    const later = new Date(Date.now() + 6 * 3600_000);
    const n = seasonClosingCandidate(baseSignals({
      address: "SP1",
      ranks: { snake: 2, tetris: 5, pacman: null, breakout: null, minesweeper: null, solitaire: null },
      countdowns: { snake: urgent(later), tetris: urgent(soon) },
    }));
    expect(n?.cta.target).toEqual({ window: "highscore", gameId: "tetris" });
  });
});

import { rankDropCandidate } from "./retention-nudge";
import type { LiveRanks } from "./player-ranks";

const r = (over: Partial<LiveRanks>): LiveRanks => ({
  snake: null, tetris: null, pacman: null,
  breakout: null, minesweeper: null, solitaire: null, ...over,
});

describe("rankDropCandidate", () => {
  it("fires when a held top-10 rank fell off the board", () => {
    const n = rankDropCandidate(baseSignals({
      address: "SP1",
      lastSeenRanks: r({ snake: 3 }),
      ranks: r({ snake: null }),
    }));
    expect(n?.kind).toBe("rank-drop");
    expect(n?.cta.target).toEqual({ window: "highscore", gameId: "snake" });
  });

  it("fires when a held rank dropped places (3 → 5)", () => {
    const n = rankDropCandidate(baseSignals({
      address: "SP1",
      lastSeenRanks: r({ snake: 3 }),
      ranks: r({ snake: 5 }),
    }));
    expect(n?.kind).toBe("rank-drop");
  });

  it("does not fire when rank improved (3 → 2)", () => {
    expect(rankDropCandidate(baseSignals({
      address: "SP1",
      lastSeenRanks: r({ snake: 3 }),
      ranks: r({ snake: 2 }),
    }))).toBeNull();
  });

  it("does not fire without an address", () => {
    expect(rankDropCandidate(baseSignals({
      address: null,
      lastSeenRanks: r({ snake: 3 }),
      ranks: r({ snake: 9 }),
    }))).toBeNull();
  });

  it("does not fire without a prior snapshot", () => {
    expect(rankDropCandidate(baseSignals({
      address: "SP1",
      lastSeenRanks: null,
      ranks: r({ snake: 9 }),
    }))).toBeNull();
  });

  it("picks the most painful loss (best previously-held rank)", () => {
    const n = rankDropCandidate(baseSignals({
      address: "SP1",
      lastSeenRanks: r({ snake: 6, tetris: 2 }),
      ranks: r({ snake: null, tetris: null }),
    }));
    expect(n?.cta.target).toEqual({ window: "highscore", gameId: "tetris" });
  });
});
