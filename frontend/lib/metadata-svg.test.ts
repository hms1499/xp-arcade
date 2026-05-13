import { describe, it, expect } from "vitest";
import { scoreSvg, trophySvg } from "./metadata-svg";

describe("metadata svg", () => {
  it("score svg includes score and player name", () => {
    const svg = scoreSvg({ tokenId: 1, score: 42, playerName: "alice" });
    expect(svg).toContain("42");
    expect(svg).toContain("alice");
    expect(svg).toMatch(/<svg/);
  });

  it("trophy svg matches rank tier", () => {
    expect(trophySvg({ trophyId: 1, rank: 1, season: 1 })).toContain("Gold");
    expect(trophySvg({ trophyId: 2, rank: 2, season: 1 })).toContain("Silver");
    expect(trophySvg({ trophyId: 3, rank: 3, season: 1 })).toContain("Bronze");
    expect(trophySvg({ trophyId: 4, rank: 7, season: 1 })).toContain("Top 10");
  });
});
