import { describe, it, expect } from "vitest";
import {
  STX_TOKEN,
  SBTC_TOKEN,
  tokensForDirection,
  flipDirection,
} from "./swap-tokens";

describe("swap-tokens", () => {
  it("uses 6 decimals for STX and 8 for sBTC", () => {
    expect(STX_TOKEN.decimals).toBe(6);
    expect(SBTC_TOKEN.decimals).toBe(8);
    expect(STX_TOKEN.id).toBeTruthy();
    expect(SBTC_TOKEN.id).toBeTruthy();
  });

  it("maps stx-to-sbtc: sell STX (tokenX), buy sBTC (tokenY)", () => {
    const { tokenX, tokenY } = tokensForDirection("stx-to-sbtc");
    expect(tokenX.symbol).toBe("STX");
    expect(tokenY.symbol).toBe("sBTC");
  });

  it("maps sbtc-to-stx: sell sBTC (tokenX), buy STX (tokenY)", () => {
    const { tokenX, tokenY } = tokensForDirection("sbtc-to-stx");
    expect(tokenX.symbol).toBe("sBTC");
    expect(tokenY.symbol).toBe("STX");
  });

  it("flips direction", () => {
    expect(flipDirection("stx-to-sbtc")).toBe("sbtc-to-stx");
    expect(flipDirection("sbtc-to-stx")).toBe("stx-to-sbtc");
  });
});
