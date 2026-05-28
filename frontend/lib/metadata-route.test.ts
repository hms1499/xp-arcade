import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchCallReadOnlyFunction } from "@stacks/transactions";
import { scoreMetadataResponse, scoreMetadataResponseV3 } from "./metadata-route";
import { _resetRateLimitForTests } from "./rate-limit";
import { GAMES } from "./game-registry";

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

function req(ip = "203.0.113.10") {
  return new Request("https://xp.test/api/metadata/score/1", {
    headers: { "x-forwarded-for": ip },
  });
}

function params(id: string) {
  return Promise.resolve({ id });
}

function call(id: string, ip?: string) {
  return scoreMetadataResponse(req(ip), params(id), {
    game: GAMES.snake,
    gameName: "Snake",
    descriptionGameName: "snake",
    rateLimitPrefix: "metadata-test",
  });
}

describe("scoreMetadataResponse", () => {
  beforeEach(() => {
    _resetRateLimitForTests();
    fetchReadOnly.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects invalid token ids before reading chain state", async () => {
    const res = await call("abc");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid id" });
    expect(fetchReadOnly).not.toHaveBeenCalled();
  });

  it("returns 404 with short cache when token metadata is missing", async () => {
    fetchReadOnly.mockResolvedValueOnce(readOnlyResult(null));

    const res = await call("404");

    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(await res.json()).toEqual({ error: "not found" });
  });

  it("returns SIP metadata with immutable cache for an existing score NFT", async () => {
    fetchReadOnly.mockResolvedValueOnce(readOnlyResult({
      score: "321",
      "player-name": "Ada",
      rarity: "Rare",
      season: "2",
    }));

    const res = await call("7");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, s-maxage=31536000, immutable",
    );
    expect(body.name).toBe("Snake Score #7");
    expect(body.description).toBe("On-chain proof of a snake game score: 321.");
    expect(body.image).toMatch(/^data:image\/svg\+xml;utf8,/);
    expect(body.attributes).toEqual([
      { trait_type: "Rarity", value: "Rare" },
      { trait_type: "Season", value: "2" },
      { trait_type: "Score", value: "321" },
    ]);
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

  it("rate limits by client IP", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T00:00:00Z"));
    fetchReadOnly.mockResolvedValue(readOnlyResult({
      score: "1",
      "player-name": "Ada",
      rarity: "Common",
      season: "1",
    }));

    for (let i = 0; i < 60; i += 1) {
      const res = await call(String(i + 1), "198.51.100.9");
      expect(res.status).toBe(200);
    }

    const limited = await call("61", "198.51.100.9");

    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(await limited.json()).toEqual({ error: "rate limited" });
  });
});
