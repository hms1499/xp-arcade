import { describe, it, expect } from "vitest";
import { swapStatusText } from "./swap-status";

const base = { amountValid: false, hasQuote: false, quoteStale: false, submitting: false };

describe("swapStatusText", () => {
  it("prioritizes submitting over everything", () => {
    expect(swapStatusText({ ...base, amountValid: true, hasQuote: true, submitting: true }))
      .toBe("Confirm in wallet…");
  });
  it("prompts to enter an amount when none is valid", () => {
    expect(swapStatusText({ ...base })).toBe("Enter an amount");
  });
  it("flags an expired quote", () => {
    expect(swapStatusText({ ...base, amountValid: true, hasQuote: true, quoteStale: true }))
      .toBe("Quote expired");
  });
  it("is Ready with a fresh quote", () => {
    expect(swapStatusText({ ...base, amountValid: true, hasQuote: true }))
      .toBe("Ready");
  });
  it("shows fetching while a valid amount has no quote yet", () => {
    expect(swapStatusText({ ...base, amountValid: true }))
      .toBe("Fetching quote…");
  });
});
