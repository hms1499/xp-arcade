import { describe, expect, it } from "vitest";
import { buildChallengeUrl, MAX_CHALLENGE_SCORE } from "./challenge-link";

const ADDR = "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";

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
