import { describe, it, expect } from "vitest";
import { todayKey } from "./daily-challenge";
import { dailyGame } from "./daily-challenge";
import { GAME_IDS } from "./game-registry";

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
