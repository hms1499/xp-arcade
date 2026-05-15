import { describe, it, expect } from "vitest";
import { isStacksAddress, shortAddress } from "./stacks-address";

describe("isStacksAddress", () => {
  it("accepts a mainnet address", () => {
    expect(
      isStacksAddress("SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV")
    ).toBe(true);
  });

  it("accepts a testnet address", () => {
    expect(
      isStacksAddress("ST2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV")
    ).toBe(true);
  });

  it("rejects empty / short / garbage strings", () => {
    expect(isStacksAddress("")).toBe(false);
    expect(isStacksAddress("SP123")).toBe(false);
    expect(isStacksAddress("0xabc123")).toBe(false);
  });

  it("rejects contract identifiers (address.contract)", () => {
    expect(
      isStacksAddress("SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.snake-score")
    ).toBe(false);
  });
});

describe("shortAddress", () => {
  it("truncates a long address", () => {
    expect(shortAddress("SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV")).toBe(
      "SP2CM…13SV"
    );
  });

  it("returns short strings unchanged", () => {
    expect(shortAddress("SP1")).toBe("SP1");
  });
});
