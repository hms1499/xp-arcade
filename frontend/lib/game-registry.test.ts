import { describe, it, expect } from "vitest";
import { GAMES, type GameId } from "./game-registry";

describe("game-registry", () => {
  it("has snake, tetris, pacman entries", () => {
    const ids: GameId[] = ["snake", "tetris", "pacman"];
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

  it("tetris and pacman mint fee is 20_000 ustx (0.02 STX)", () => {
    expect(GAMES.tetris.mintFeeUstx).toBe(BigInt(20_000));
    expect(GAMES.pacman.mintFeeUstx).toBe(BigInt(20_000));
  });
});
