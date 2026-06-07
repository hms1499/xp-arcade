import { describe, expect, it } from "vitest";
import { parseContractId, parseNetworkName } from "./stacks";
import { GAMES } from "./game-registry";

describe("parseNetworkName", () => {
  it("defaults to mainnet when unset", () => {
    expect(parseNetworkName(undefined)).toBe("mainnet");
    expect(parseNetworkName("")).toBe("mainnet");
  });

  it("accepts mainnet and testnet", () => {
    expect(parseNetworkName("mainnet")).toBe("mainnet");
    expect(parseNetworkName("testnet")).toBe("testnet");
  });

  it("rejects invalid values", () => {
    expect(() => parseNetworkName("devnet")).toThrow(/NEXT_PUBLIC_NETWORK/);
  });
});

describe("parseContractId", () => {
  it("parses ADDRESS.contract-name", () => {
    expect(parseContractId("SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4")).toEqual({
      contractAddress: "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV",
      contractName: "xp-arcade-v4",
    });
  });

  it("defaults to the shared v3 registry contract when unset", () => {
    expect(parseContractId(undefined)).toEqual({
      contractAddress: GAMES.snake.contractAddress,
      contractName: GAMES.snake.contractName,
    });
  });

  it("rejects a contract id that does not match registry config", () => {
    expect(() =>
      parseContractId("SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.snake-score-v2"),
    ).toThrow(/must match configured/);
  });

  it("rejects malformed ids", () => {
    expect(() => parseContractId(".")).toThrow(/ADDRESS\.contract-name/);
    expect(() => parseContractId("xp-arcade-v3")).toThrow(/ADDRESS\.contract-name/);
    expect(() => parseContractId("bad.xp-arcade-v3")).toThrow(/Invalid contract address/);
  });
});
