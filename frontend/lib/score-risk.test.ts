import { describe, expect, it } from "vitest";
import { assessScoreRisk, scoreRiskColor, scoreRiskLabel } from "./score-risk";

describe("assessScoreRisk", () => {
  it("marks ordinary sessions as low risk", () => {
    const report = assessScoreRisk({
      gameId: "snake",
      score: 20,
      durationMs: 90_000,
    });

    expect(report.level).toBe("low");
    expect(report.reasons).toEqual([]);
    expect(report.durationSeconds).toBe(90);
  });

  it("marks unusually high score-only rows for admin review", () => {
    const report = assessScoreRisk({
      gameId: "tetris",
      score: 600,
      durationMs: null,
    });

    expect(report.level).toBe("medium");
    expect(report.reasons[0]).toMatch(/unusually high/);
    expect(report.durationSeconds).toBeNull();
  });

  it("marks extreme score-only rows as high risk", () => {
    const report = assessScoreRisk({
      gameId: "pacman",
      score: 1_500,
      durationMs: null,
    });

    expect(report.level).toBe("high");
    expect(report.reasons[0]).toMatch(/above the normal/);
  });

  it("marks high scores reached too quickly as high risk", () => {
    const report = assessScoreRisk({
      gameId: "snake",
      score: 50,
      durationMs: 5_000,
    });

    expect(report.level).toBe("high");
    expect(report.reasons.join(" ")).toMatch(/too fast/);
    expect(report.durationSeconds).toBe(5);
  });

  it("marks excessive score rate as review even when duration is not tiny", () => {
    const report = assessScoreRisk({
      gameId: "tetris",
      score: 400,
      durationMs: 30_000,
    });

    expect(report.level).toBe("medium");
    expect(report.reasons.join(" ")).toMatch(/Score rate/);
  });
});

describe("score risk presentation helpers", () => {
  it("maps risk levels to labels and colors", () => {
    expect(scoreRiskLabel({ level: "low", reasons: [], durationSeconds: null })).toBe("Normal");
    expect(scoreRiskLabel({ level: "medium", reasons: [], durationSeconds: null })).toBe("Review");
    expect(scoreRiskLabel({ level: "high", reasons: [], durationSeconds: null })).toBe("High risk");
    expect(scoreRiskColor("low")).toBe("#007700");
    expect(scoreRiskColor("medium")).toBe("#8a5a00");
    expect(scoreRiskColor("high")).toBe("#aa0000");
  });
});
