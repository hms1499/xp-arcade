import { describe, it, expect } from "vitest";
import { clampMenuPosition } from "./menu-position";

describe("clampMenuPosition", () => {
  it("returns the cursor point when the menu fits", () => {
    expect(clampMenuPosition(100, 100, 160, 200, 1024, 768)).toEqual({ x: 100, y: 100 });
  });

  it("shifts left when the menu would overflow the right edge", () => {
    // 900 + 160 = 1060 > 1024 -> x = 1024 - 160 = 864
    expect(clampMenuPosition(900, 100, 160, 200, 1024, 768)).toEqual({ x: 864, y: 100 });
  });

  it("shifts up when the menu would overflow the bottom edge", () => {
    // 700 + 200 = 900 > 768 -> y = 768 - 200 = 568
    expect(clampMenuPosition(100, 700, 160, 200, 1024, 768)).toEqual({ x: 100, y: 568 });
  });

  it("never returns negative coordinates", () => {
    expect(clampMenuPosition(5, 5, 160, 200, 100, 100)).toEqual({ x: 0, y: 0 });
  });
});
