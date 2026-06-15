import { describe, it, expect } from "vitest";
import { todayKey } from "./daily-challenge";
import { dailyGame } from "./daily-challenge";
import { GAME_IDS } from "./game-registry";
import { DAILY_TARGETS, dailyChallenge } from "./daily-challenge";
import { isYesterday } from "./daily-challenge";

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
});
