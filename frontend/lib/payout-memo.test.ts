import { describe, expect, it } from "vitest";
import { formatPayoutMemo, parsePayoutMemo } from "./payout-memo";

describe("formatPayoutMemo", () => {
  it("emits xpa-{game}-s{season}-r{rank}", () => {
    expect(formatPayoutMemo({ gameId: "snake", season: 3, rank: 1 })).toBe(
      "xpa-snake-s3-r1",
    );
    expect(formatPayoutMemo({ gameId: "pacman", season: 12, rank: 10 })).toBe(
      "xpa-pacman-s12-r10",
    );
    expect(formatPayoutMemo({ gameId: "breakout", season: 2, rank: 3 })).toBe(
      "xpa-breakout-s2-r3",
    );
  });

  it("fits within the 34-byte STX memo budget", () => {
    const longest = formatPayoutMemo({
      gameId: "breakout",
      season: 9999,
      rank: 10,
    });
    expect(longest.length).toBeLessThanOrEqual(34);
  });
});

describe("parsePayoutMemo", () => {
  it("roundtrips a formatted memo", () => {
    const memo = formatPayoutMemo({ gameId: "tetris", season: 7, rank: 2 });
    expect(parsePayoutMemo(memo)).toEqual({
      gameId: "tetris",
      season: 7,
      rank: 2,
    });
  });

  it("returns null for an unrelated memo", () => {
    expect(parsePayoutMemo("hello world")).toBeNull();
    expect(parsePayoutMemo("")).toBeNull();
    expect(parsePayoutMemo("xpa-foo-s1-r1")).toBeNull();
  });

  it("returns null for malformed numbers", () => {
    expect(parsePayoutMemo("xpa-snake-sX-r1")).toBeNull();
    expect(parsePayoutMemo("xpa-snake-s1-rZ")).toBeNull();
  });
});
