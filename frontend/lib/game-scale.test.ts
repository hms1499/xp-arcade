import { describe, it, expect } from "vitest";
import { computeGameScale, MAX_GAME_SCALE } from "./game-scale";

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

  // There is no floor: the field must always fit inside whatever the window
  // affords, even at the real Snake-at-minimum-window numbers, where the old
  // 0.25 floor was reachable and would have clamped the scale upward past
  // what the viewport could show (clipping top and bottom with no scrollbar).
  it("keeps the field inside the viewport even when the true fit is below the old floor", () => {
    const availW = 300;
    const availH = 95;
    const natural = { naturalW: 640, naturalH: 496 };
    const k = computeGameScale({ availW, availH, ...natural });
    expect(natural.naturalW * k).toBeLessThanOrEqual(availW);
    expect(natural.naturalH * k).toBeLessThanOrEqual(availH);
    expect(k).toBeLessThan(0.25);
  });
});
