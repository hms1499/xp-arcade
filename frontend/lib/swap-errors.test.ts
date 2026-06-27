import { describe, it, expect } from "vitest";
import { classifySwapError, mapSwapError } from "./swap-errors";

describe("swap-errors", () => {
  it("classifies cancellation", () => {
    expect(classifySwapError(new Error("User canceled the request"))).toBe("cancelled");
    expect(mapSwapError(new Error("rejected by user"))).toBe("");
  });

  it("classifies no-route / liquidity", () => {
    expect(classifySwapError(new Error("No route found"))).toBe("no-route");
    expect(mapSwapError(new Error("insufficient liquidity"))).toMatch(/liquidity/i);
  });

  it("classifies slippage / post-condition failures", () => {
    expect(classifySwapError(new Error("PostCondition failed"))).toBe("slippage");
    expect(mapSwapError(new Error("price moved"))).toMatch(/slippage|price/i);
  });

  it("classifies quote/network errors", () => {
    expect(classifySwapError(new Error("quote request timeout"))).toBe("quote");
    expect(mapSwapError(new Error("fetch failed"))).toMatch(/price|connection/i);
  });

  it("falls back to unknown", () => {
    expect(classifySwapError(null)).toBe("unknown");
    expect(mapSwapError({})).toMatch(/failed/i);
  });
});
