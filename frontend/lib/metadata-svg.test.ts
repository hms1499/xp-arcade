import { describe, it, expect } from "vitest";
import { scoreSvg } from "./metadata-svg";

describe("metadata svg", () => {
  it("score svg includes score and player name", () => {
    const svg = scoreSvg({ tokenId: 1, score: 42, playerName: "alice", rarity: "Common" });
    expect(svg).toContain("42");
    expect(svg).toContain("alice");
    expect(svg).toMatch(/<svg/);
  });
});
