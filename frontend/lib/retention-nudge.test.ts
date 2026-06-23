import { beforeEach, describe, expect, it } from "vitest";
import {
  NUDGE_SHOWN_KEY,
  loadNudgeShown,
  markNudgeShown,
  shownTodayMap,
} from "./retention-nudge";

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
