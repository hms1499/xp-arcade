import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameOverSummary } from "./GameOverSummary";
import type { LeaderboardGoal } from "@/lib/leaderboard-showcase";

const goalRanked: LeaderboardGoal = {
  tone: "success",
  primary: "Mint to publish this score around rank #4.",
  secondary: "This score is leaderboard-ready.",
  rank: 4,
  topTenReady: true,
};

const goalShort: LeaderboardGoal = {
  tone: "warning",
  primary: "Mint as a collectible score NFT.",
  secondary: "Needs 120 to beat #10 (8,540).",
  topTenReady: false,
};

describe("GameOverSummary", () => {
  it("Tier A (top-10) shows the high-score banner, confetti, and rank", () => {
    const html = renderToStaticMarkup(
      <GameOverSummary
        gameId="snake"
        score={8420}
        isTopScore
        isNewRecord
        best={8420}
        goal={goalRanked}
      />,
    );
    expect(html).toContain("NEW HIGH SCORE");
    expect(html).toContain("gameover-confetti");
    expect(html).toContain("Will rank #4");
  });

  it("Tier B (personal best, not top-10) is silent: no banner, no confetti", () => {
    const html = renderToStaticMarkup(
      <GameOverSummary
        gameId="snake"
        score={500}
        isTopScore={false}
        isNewRecord
        best={500}
        goal={goalShort}
      />,
    );
    expect(html).toContain("New personal best");
    expect(html).not.toContain("NEW HIGH SCORE");
    expect(html).not.toContain("gameover-confetti");
    expect(html).toContain("Needs 120 to beat #10");
  });

  it("Tier C (normal) shows the prior personal best and no celebration", () => {
    const html = renderToStaticMarkup(
      <GameOverSummary
        gameId="snake"
        score={120}
        isTopScore={false}
        isNewRecord={false}
        best={9000}
        goal={goalShort}
      />,
    );
    expect(html).toContain("Personal best:");
    expect(html).not.toContain("NEW HIGH SCORE");
    expect(html).not.toContain("New personal best");
  });

  it("shows a loading placeholder while goal is null", () => {
    const html = renderToStaticMarkup(
      <GameOverSummary
        gameId="snake"
        score={120}
        isTopScore={false}
        isNewRecord={false}
        best={9000}
        goal={null}
      />,
    );
    expect(html).toContain("Checking the board");
  });
});
