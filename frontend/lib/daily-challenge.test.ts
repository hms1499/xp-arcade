import { describe, it, expect } from "vitest";
import { todayKey } from "./daily-challenge";

describe("todayKey", () => {
  it("formats a date as local YYYY-MM-DD with zero padding", () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe("2026-01-05"); // Jan 5
    expect(todayKey(new Date(2026, 11, 31))).toBe("2026-12-31"); // Dec 31
  });
});
