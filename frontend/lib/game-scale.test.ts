import { describe, it, expect } from "vitest";
import { computeGameScale, MIN_GAME_SCALE, MAX_GAME_SCALE } from "./game-scale";

const NATURAL = { naturalW: 640, naturalH: 480 };

describe("computeGameScale", () => {
  it("returns 1 when the viewport exactly fits the natural size", () => {
    expect(computeGameScale({ availW: 640, availH: 480, ...NATURAL })).toBe(1);
  });

  it("scales by the limiting axis when width is the constraint", () => {
    // 320/640 = 0.5 vs 480/480 = 1 -> width wins, aspect ratio preserved.
    expect(computeGameScale({ availW: 320, availH: 480, ...NATURAL })).toBe(0.5);
  });

  it("scales by the limiting axis when height is the constraint", () => {
    // 1280/640 = 2 vs 240/480 = 0.5 -> height wins.
    expect(computeGameScale({ availW: 1280, availH: 240, ...NATURAL })).toBe(0.5);
  });

  it("clamps at MAX_GAME_SCALE on a very large viewport", () => {
    expect(computeGameScale({ availW: 6400, availH: 4800, ...NATURAL })).toBe(MAX_GAME_SCALE);
  });

  it("returns 1 while the natural size is still unmeasured", () => {
    expect(computeGameScale({ availW: 800, availH: 600, naturalW: 0, naturalH: 0 })).toBe(1);
  });

  it("returns 1 for a degenerate viewport mid-layout instead of collapsing", () => {
    expect(computeGameScale({ availW: 0, availH: 0, ...NATURAL })).toBe(1);
  });

  // The floor exists only as a guard. If it ever binds, the scaled field would be
  // wider than the viewport that clips it, and part of the game would be
  // invisible. The smallest window the manager allows is 300x200; assert the
  // field still fits inside it, for a game larger than any we ship.
  it("keeps the field inside the viewport at the smallest allowed window", () => {
    const availW = 300;
    const availH = 200;
    const big = { naturalW: 900, naturalH: 700 };
    const k = computeGameScale({ availW, availH, ...big });
    expect(k).toBeGreaterThan(MIN_GAME_SCALE);
    expect(big.naturalW * k).toBeLessThanOrEqual(availW);
    expect(big.naturalH * k).toBeLessThanOrEqual(availH);
  });
});
