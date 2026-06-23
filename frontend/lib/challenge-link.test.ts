import { describe, expect, it } from "vitest";
import { buildChallengeUrl, MAX_CHALLENGE_SCORE, parseChallengeParams } from "./challenge-link";

const ADDR = "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";

function sp(q: Record<string, string>): URLSearchParams {
  return new URLSearchParams(q);
}

describe("buildChallengeUrl", () => {
  it("encodes game and score", () => {
    const url = new URL(buildChallengeUrl({ gameId: "snake", score: 150 }));
    expect(url.searchParams.get("challenge")).toBe("snake");
    expect(url.searchParams.get("score")).toBe("150");
    expect(url.searchParams.get("by")).toBeNull();
  });

  it("includes a valid by address", () => {
    const url = new URL(buildChallengeUrl({ gameId: "tetris", score: 80, by: ADDR }));
    expect(url.searchParams.get("by")).toBe(ADDR);
  });

  it("omits a malformed by address", () => {
    const url = new URL(buildChallengeUrl({ gameId: "snake", score: 10, by: "not-an-addr" }));
    expect(url.searchParams.get("by")).toBeNull();
  });

  it("caps at 9999", () => {
    expect(MAX_CHALLENGE_SCORE).toBe(9999);
  });
});

describe("parseChallengeParams", () => {
  it("parses a valid challenge with by", () => {
    expect(parseChallengeParams(sp({ challenge: "snake", score: "150", by: ADDR })))
      .toEqual({ gameId: "snake", target: 150, by: ADDR });
  });

  it("drops a malformed by but keeps the challenge", () => {
    expect(parseChallengeParams(sp({ challenge: "snake", score: "150", by: "xx" })))
      .toEqual({ gameId: "snake", target: 150, by: undefined });
  });

  it("rejects an unknown game", () => {
    expect(parseChallengeParams(sp({ challenge: "pong", score: "150" }))).toBeNull();
  });

  it("rejects non-numeric / out-of-range scores", () => {
    expect(parseChallengeParams(sp({ challenge: "snake", score: "abc" }))).toBeNull();
    expect(parseChallengeParams(sp({ challenge: "snake", score: "0" }))).toBeNull();
    expect(parseChallengeParams(sp({ challenge: "snake", score: "-5" }))).toBeNull();
    expect(parseChallengeParams(sp({ challenge: "snake", score: "10000" }))).toBeNull();
  });

  it("rejects when game or score is missing", () => {
    expect(parseChallengeParams(sp({ score: "150" }))).toBeNull();
    expect(parseChallengeParams(sp({ challenge: "snake" }))).toBeNull();
  });
});
