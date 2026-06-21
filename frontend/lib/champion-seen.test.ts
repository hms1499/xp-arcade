import { describe, it, expect, beforeEach } from "vitest";
import { loadSeenChampion, saveSeenChampion } from "./champion-seen";

describe("champion-seen persistence", () => {
  beforeEach(() => sessionStorage.clear());

  it("returns null before anything is stored", () => {
    expect(loadSeenChampion(3)).toBeNull();
  });

  it("round-trips a champion per season key", () => {
    saveSeenChampion(3, "SP_A");
    expect(loadSeenChampion(3)).toBe("SP_A");
  });

  it("isolates by season so a new season starts empty (no false positive)", () => {
    saveSeenChampion(3, "SP_A");
    expect(loadSeenChampion(4)).toBeNull();
  });

  it("uses an 'unknown' bucket when the season is null", () => {
    saveSeenChampion(null, "SP_Z");
    expect(loadSeenChampion(null)).toBe("SP_Z");
  });
});
