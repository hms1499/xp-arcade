import { describe, it, expect } from "vitest";
import { gameOverMilestone } from "./game-over-milestone";

describe("gameOverMilestone", () => {
  it("leaderboard tier celebrates with sound and confetti", () => {
    expect(gameOverMilestone({ isTopScore: true, isNewRecord: true })).toEqual({
      tier: "leaderboard",
      celebrate: true,
      sound: true,
      confetti: true,
    });
  });

  it("top-10 takes precedence even when not a personal best", () => {
    expect(
      gameOverMilestone({ isTopScore: true, isNewRecord: false }).tier,
    ).toBe("leaderboard");
  });

  it("personal best (not top-10) celebrates silently", () => {
    expect(
      gameOverMilestone({ isTopScore: false, isNewRecord: true }),
    ).toEqual({
      tier: "personal-best",
      celebrate: true,
      sound: false,
      confetti: false,
    });
  });

  it("normal run has no celebration", () => {
    expect(
      gameOverMilestone({ isTopScore: false, isNewRecord: false }),
    ).toEqual({
      tier: "none",
      celebrate: false,
      sound: false,
      confetti: false,
    });
  });
});
