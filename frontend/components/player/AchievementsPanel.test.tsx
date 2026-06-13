import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AchievementsPanel } from "./AchievementsPanel";
import { computePlayerStats } from "@/lib/player-stats";
import { ACHIEVEMENTS } from "@/lib/achievements";
import type { ScoreNft } from "@/lib/holdings";

function nft(over: Partial<ScoreNft> = {}): ScoreNft {
  return { id: 1, gameId: "snake", image: "", name: "Snake", season: 1, ...over };
}

describe("AchievementsPanel", () => {
  it("shows earned/total in the header", () => {
    const stats = computePlayerStats([nft()]); // first-mint earned → 1/7
    const html = renderToStaticMarkup(<AchievementsPanel stats={stats} />);
    expect(html).toContain(`Achievements (1/${ACHIEVEMENTS.length})`);
  });

  it("marks one earned and the rest locked", () => {
    const stats = computePlayerStats([nft()]);
    const html = renderToStaticMarkup(<AchievementsPanel stats={stats} />);
    const earned = html.match(/data-earned="true"/g) ?? [];
    const locked = html.match(/data-earned="false"/g) ?? [];
    expect(earned.length).toBe(1);
    expect(locked.length).toBe(ACHIEVEMENTS.length - 1);
  });
});
