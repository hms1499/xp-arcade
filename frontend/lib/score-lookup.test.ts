import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchCallReadOnlyFunction } from "@stacks/transactions";
import { fetchScoreLookup } from "./score-lookup";

vi.mock("@stacks/transactions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stacks/transactions")>();
  return {
    ...actual,
    fetchCallReadOnlyFunction: vi.fn(),
    cvToValue: vi.fn((value) => value),
  };
});

const fetchReadOnly = vi.mocked(fetchCallReadOnlyFunction);
type ReadOnlyResult = Awaited<ReturnType<typeof fetchCallReadOnlyFunction>>;

function readOnlyResult(value: unknown): ReadOnlyResult {
  return value as ReadOnlyResult;
}

describe("fetchScoreLookup", () => {
  beforeEach(() => {
    fetchReadOnly.mockReset();
  });

  it("maps on-chain score data to a typed lookup", async () => {
    fetchReadOnly.mockResolvedValueOnce(readOnlyResult({
      score: "500",
      "player-name": "Satoshi",
      rarity: "Epic",
      season: "3",
      "game-id": "2",
    }));

    const data = await fetchScoreLookup(5);

    expect(data).toEqual({
      tokenId: 5,
      gameId: "tetris",
      gameName: "Tetris",
      score: 500,
      playerName: "Satoshi",
      rarity: "Epic",
      season: 3,
    });
  });

  it("returns null when the token does not exist", async () => {
    fetchReadOnly.mockResolvedValueOnce(readOnlyResult(null));
    expect(await fetchScoreLookup(7)).toBeNull();
  });

  it("returns null when the game-id is not registered", async () => {
    fetchReadOnly.mockResolvedValueOnce(readOnlyResult({
      score: "10",
      "player-name": "x",
      rarity: "Common",
      season: "1",
      "game-id": "99",
    }));
    expect(await fetchScoreLookup(7)).toBeNull();
  });
});
