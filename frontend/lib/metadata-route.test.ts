import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchCallReadOnlyFunction } from "@stacks/transactions";
import { scoreMetadataResponseV3 } from "./metadata-route";
import { _resetRateLimitForTests } from "./rate-limit";

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

describe("scoreMetadataResponseV3", () => {
  beforeEach(() => {
    _resetRateLimitForTests();
    fetchReadOnly.mockReset();
  });

  it("resolves the game name from the token's on-chain game-id (v3)", async () => {
    fetchReadOnly.mockResolvedValueOnce(readOnlyResult({
      score: "500",
      "player-name": "Satoshi",
      rarity: "Epic",
      season: "3",
      "game-id": "2",
    }));

    const res = await scoreMetadataResponseV3(
      new Request("http://x/api/metadata/score/5"),
      Promise.resolve({ id: "5" }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toContain("Tetris");
    expect(body.attributes).toContainEqual({ trait_type: "Game", value: "Tetris" });
  });

  it("returns 404 for a token whose game-id is not registered", async () => {
    fetchReadOnly.mockResolvedValueOnce(readOnlyResult({
      score: "10",
      "player-name": "x",
      rarity: "Common",
      season: "1",
      "game-id": "99",
    }));

    const res = await scoreMetadataResponseV3(
      new Request("http://x/api/metadata/score/7"),
      Promise.resolve({ id: "7" }),
    );

    expect(res.status).toBe(404);
  });
});
