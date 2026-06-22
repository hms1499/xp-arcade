import { describe, it, expect } from "vitest";
import {
  formatStx,
  insufficientStxWarning,
  networkMismatchWarning,
} from "./wallet-safety";

const MAINNET = "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";
const TESTNET = "ST2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";

describe("formatStx", () => {
  it("renders uSTX as STX with two decimals", () => {
    expect(formatStx(500_000)).toBe("0.50");
    expect(formatStx(1_230_000)).toBe("1.23");
    expect(formatStx(0)).toBe("0.00");
  });
});

describe("networkMismatchWarning", () => {
  it("warns when the wallet network differs from the app network", () => {
    const msg = networkMismatchWarning(TESTNET, "mainnet");
    expect(msg).toMatch(/testnet/i);
    expect(msg).toMatch(/mainnet/i);
    expect(msg).toMatch(/switch/i);
  });

  it("is silent when the wallet matches the app network", () => {
    expect(networkMismatchWarning(MAINNET, "mainnet")).toBeNull();
  });

  it("is silent when the address network can't be determined", () => {
    expect(networkMismatchWarning("garbage", "mainnet")).toBeNull();
    expect(networkMismatchWarning(null, "mainnet")).toBeNull();
  });
});

describe("insufficientStxWarning", () => {
  it("warns, with both amounts, when the balance is below what's required", () => {
    const msg = insufficientStxWarning(120_000, 500_000);
    expect(msg).toMatch(/0\.50/);
    expect(msg).toMatch(/0\.12/);
    expect(msg).toMatch(/not enough/i);
  });

  it("is silent when the balance exactly covers the requirement", () => {
    expect(insufficientStxWarning(500_000, 500_000)).toBeNull();
  });

  it("is silent when the balance is more than enough", () => {
    expect(insufficientStxWarning(600_000, 500_000)).toBeNull();
  });

  it("is silent when the balance is unknown (null)", () => {
    expect(insufficientStxWarning(null, 500_000)).toBeNull();
  });
});
