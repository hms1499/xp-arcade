import { describe, expect, it } from "vitest";
import { conversionPct, summarizeEvent } from "./metrics-summary";

describe("conversionPct", () => {
  it("returns 0 when denominator is 0", () => {
    expect(conversionPct(5, 0)).toBe(0);
  });
  it("rounds to one decimal", () => {
    expect(conversionPct(1, 3)).toBe(33.3);
    expect(conversionPct(31, 40)).toBe(77.5);
  });
});

describe("summarizeEvent", () => {
  const now = new Date("2026-07-08T12:00:00Z");

  it("sums daily totals across the range", () => {
    const counts = {
      "ev:game_over:2026-07-08": 10,
      "ev:game_over:2026-07-07": 4,
      "ev:game_over:total": 999,
    };
    const s = summarizeEvent("game_over", 2, counts, now);
    expect(s.byDay).toEqual({ "2026-07-08": 10, "2026-07-07": 4 });
    expect(s.total).toBe(999); // prefers the all-time total key when present
  });

  it("falls back to summed days when no total key", () => {
    const counts = { "ev:game_over:2026-07-08": 10, "ev:game_over:2026-07-07": 4 };
    const s = summarizeEvent("game_over", 2, counts, now);
    expect(s.total).toBe(14);
  });

  it("collects per-game counts within the range", () => {
    const counts = {
      "ev:mint_confirmed:snake:2026-07-08": 3,
      "ev:mint_confirmed:snake:2026-07-07": 2,
      "ev:mint_confirmed:tetris:2026-07-08": 1,
    };
    const s = summarizeEvent("mint_confirmed", 2, counts, now);
    expect(s.byGame).toEqual({ snake: 5, tetris: 1 });
  });

  it("treats missing keys as 0", () => {
    const s = summarizeEvent("mint_failed", 2, {}, now);
    expect(s.total).toBe(0);
    expect(s.byDay).toEqual({ "2026-07-08": 0, "2026-07-07": 0 });
    expect(s.byGame).toEqual({});
  });
});
