import { describe, it, expect } from "vitest";
import {
  STX_GAS_BUFFER_USTX,
  toBaseUnits,
  fromBaseUnits,
  slippageBpsToTolerance,
  maxStxInput,
} from "./swap-math";

describe("swap-math", () => {
  it("converts human amounts to integer base units", () => {
    expect(toBaseUnits(1.5, 6)).toBe(1_500_000);      // STX
    expect(toBaseUnits(0.001, 8)).toBe(100_000);      // sBTC
    expect(toBaseUnits(0, 6)).toBe(0);
  });

  it("rounds to the nearest base unit (no float dust)", () => {
    expect(toBaseUnits(0.1, 8)).toBe(10_000_000);
    expect(Number.isInteger(toBaseUnits(1.23456789, 8))).toBe(true);
  });

  it("converts base units back to human numbers", () => {
    expect(fromBaseUnits(1_500_000, 6)).toBe(1.5);
    expect(fromBaseUnits(100_000, 8)).toBe(0.001);
  });

  it("converts slippage bps to a fraction", () => {
    expect(slippageBpsToTolerance(10)).toBeCloseTo(0.001);
    expect(slippageBpsToTolerance(50)).toBeCloseTo(0.005);
    expect(slippageBpsToTolerance(100)).toBeCloseTo(0.01);
  });

  it("reserves a 0.5 STX gas buffer for max input", () => {
    expect(STX_GAS_BUFFER_USTX).toBe(500_000);
    expect(maxStxInput(2_000_000)).toBe(1_500_000);
    expect(maxStxInput(500_000)).toBe(0);
    expect(maxStxInput(100_000)).toBe(0); // never negative
  });
});
