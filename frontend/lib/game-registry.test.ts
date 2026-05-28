import { describe, it, expect } from "vitest";
import {
  expectedPrimaryContractId,
  GAMES,
  parseRegistryNetwork,
  validateGameDef,
  validateGameRegistry,
  onchainIdFor,
  gameIdFromOnchain,
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

  it("uses the shared v3 NFT asset name for all games", () => {
    expect(GAMES.snake.nftAssetName).toBe("xp-score");
    expect(GAMES.tetris.nftAssetName).toBe("xp-score");
    expect(GAMES.pacman.nftAssetName).toBe("xp-score");
    expect(GAMES.breakout.nftAssetName).toBe("xp-score");
  });

  it("maps every game to the single shared v3 contract", () => {
    for (const id of ["snake", "tetris", "pacman", "breakout"] as GameId[]) {
      expect(GAMES[id].contractName).toBe("xp-arcade-v3");
      expect(GAMES[id].contractAddress).toBe("SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV");
    }
  });

  it("assigns unique positive onchainIds", () => {
    expect(GAMES.snake.onchainId).toBe(1);
    expect(GAMES.tetris.onchainId).toBe(2);
    expect(GAMES.pacman.onchainId).toBe(3);
    expect(GAMES.breakout.onchainId).toBe(4);
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

  it("exposes the shared v3 contract id as primary", () => {
    expect(expectedPrimaryContractId()).toBe(
      "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v3",
    );
  });
});

describe("onchain id mapping", () => {
  it("round-trips game id <-> onchain id", () => {
    for (const id of ["snake", "tetris", "pacman", "breakout"] as GameId[]) {
      expect(gameIdFromOnchain(onchainIdFor(id))).toBe(id);
    }
  });

  it("throws on an unknown onchain id", () => {
    expect(() => gameIdFromOnchain(99)).toThrow(/onchain id/);
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
