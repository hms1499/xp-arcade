import { describe, it, expect } from "vitest";
import {
  expectedPrimaryContractId,
  GAMES,
  parseRegistryNetwork,
  validateGameDef,
  validateGameRegistry,
  type GameId,
} from "./game-registry";

describe("game-registry", () => {
  it("has all registered game entries", () => {
    const ids: GameId[] = ["snake", "tetris", "pacman", "breakout"];
    for (const id of ids) {
      expect(GAMES[id]).toBeDefined();
      expect(GAMES[id].id).toBe(id);
      expect(GAMES[id].contractAddress).toBeTruthy();
      expect(GAMES[id].contractName).toBeTruthy();
      expect(typeof GAMES[id].mintFeeUstx).toBe("bigint");
    }
  });

  it("snake mint fee is 10_000 ustx (0.01 STX)", () => {
    expect(GAMES.snake.mintFeeUstx).toBe(BigInt(10_000));
  });

  it("non-snake mint fee is 20_000 ustx (0.02 STX)", () => {
    expect(GAMES.tetris.mintFeeUstx).toBe(BigInt(20_000));
    expect(GAMES.pacman.mintFeeUstx).toBe(BigInt(20_000));
    expect(GAMES.breakout.mintFeeUstx).toBe(BigInt(20_000));
  });

  it("nftAssetName matches original contract token name for all games", () => {
    expect(GAMES.snake.nftAssetName).toBe("snake-score");
    expect(GAMES.tetris.nftAssetName).toBe("tetris-score");
    expect(GAMES.pacman.nftAssetName).toBe("pacman-score");
    expect(GAMES.breakout.nftAssetName).toBe("breakout-score");
  });

  it("rejects invalid registry entries", () => {
    expect(() =>
      validateGameDef({
        ...GAMES.snake,
        contractAddress: "",
      }),
    ).toThrow(/contract address/);
    expect(() =>
      validateGameDef({
        ...GAMES.snake,
        mintFeeUstx: BigInt(0),
      }),
    ).toThrow(/mint fee/);
  });

  it("rejects key/id mismatches", () => {
    expect(() =>
      validateGameRegistry({
        ...GAMES,
        snake: { ...GAMES.snake, id: "tetris" },
      }),
    ).toThrow(/key mismatch/);
  });

  it("exposes the expected primary Snake contract id", () => {
    expect(expectedPrimaryContractId()).toBe(
      "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.snake-score-v2",
    );
  });
});

describe("parseRegistryNetwork", () => {
  it("defaults to mainnet when unset", () => {
    expect(parseRegistryNetwork(undefined)).toBe("mainnet");
    expect(parseRegistryNetwork("")).toBe("mainnet");
  });

  it("accepts mainnet and testnet", () => {
    expect(parseRegistryNetwork("mainnet")).toBe("mainnet");
    expect(parseRegistryNetwork("testnet")).toBe("testnet");
  });

  it("rejects invalid values", () => {
    expect(() => parseRegistryNetwork("devnet")).toThrow(/NEXT_PUBLIC_NETWORK/);
  });
});
