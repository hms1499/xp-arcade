import { beforeEach, describe, expect, it } from "vitest";
import { markSeasonEnded, wasSeasonEnded } from "./ended-seasons";

describe("ended-seasons", () => {
  beforeEach(() => localStorage.clear());

  it("returns false for a pair that was never marked", () => {
    expect(wasSeasonEnded("snake", 8470355)).toBe(false);
  });

  it("remembers a marked game and end-block pair", () => {
    markSeasonEnded("snake", 8470355);
    expect(wasSeasonEnded("snake", 8470355)).toBe(true);
  });

  it("isolates entries by game and end block", () => {
    markSeasonEnded("snake", 8470355);
    expect(wasSeasonEnded("tetris", 8470355)).toBe(false);
    expect(wasSeasonEnded("snake", 9999999)).toBe(false);
  });

  it("tolerates corrupt storage", () => {
    localStorage.setItem("xp-arcade:ended-seasons", "not-json");
    expect(wasSeasonEnded("snake", 8470355)).toBe(false);
    expect(() => markSeasonEnded("snake", 8470355)).not.toThrow();
    expect(wasSeasonEnded("snake", 8470355)).toBe(true);
  });
});
