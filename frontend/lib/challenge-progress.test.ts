import { describe, expect, it } from "vitest";
import { shouldMarkMet } from "./challenge-progress";
import type { Challenge } from "./challenge-link";

const C: Challenge = { gameId: "snake", target: 150 };

describe("shouldMarkMet", () => {
  it("true when accepted, same game, run score reaches target", () => {
    expect(shouldMarkMet("accepted", C, "snake", 150, 0)).toBe(true);
  });
  it("true when session best reaches target", () => {
    expect(shouldMarkMet("accepted", C, "snake", 10, 200)).toBe(true);
  });
  it("false below target", () => {
    expect(shouldMarkMet("accepted", C, "snake", 149, 149)).toBe(false);
  });
  it("false for a different game", () => {
    expect(shouldMarkMet("accepted", C, "tetris", 999, 999)).toBe(false);
  });
  it("false unless status is accepted", () => {
    expect(shouldMarkMet("pending", C, "snake", 999, 999)).toBe(false);
    expect(shouldMarkMet("met", C, "snake", 999, 999)).toBe(false);
    expect(shouldMarkMet(null, C, "snake", 999, 999)).toBe(false);
  });
  it("false when no active challenge", () => {
    expect(shouldMarkMet("accepted", null, "snake", 999, 999)).toBe(false);
  });
});
