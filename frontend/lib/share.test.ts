import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchJson } from "./http";
import {
  scoreShareUrl,
  xIntentUrl,
  shareTitle,
  shareDescription,
  resolveMintedTokenId,
  seasonShareUrl,
  xSeasonIntentUrl,
} from "./share";

vi.mock("./http", () => ({ fetchJson: vi.fn() }));
const mockFetchJson = vi.mocked(fetchJson);

describe("scoreShareUrl", () => {
  it("links to the share page when a token id exists", () => {
    expect(scoreShareUrl(42)).toBe("http://localhost:3000/share/score/42");
  });
  it("falls back to the app root without a token id", () => {
    expect(scoreShareUrl(null)).toBe("http://localhost:3000");
  });
});

describe("xIntentUrl", () => {
  it("builds an X intent with encoded text and link", () => {
    const u = new URL(xIntentUrl("snake", 1234, 42));
    expect(u.origin + u.pathname).toBe("https://x.com/intent/post");
    expect(u.searchParams.get("text")).toBe(
      "I scored 1234 in Snake on XP Arcade 🕹️",
    );
    expect(u.searchParams.get("url")).toBe(
      "http://localhost:3000/share/score/42",
    );
  });
});

describe("share copy", () => {
  const lookup = {
    tokenId: 42, gameId: "tetris" as const, gameName: "Tetris",
    score: 500, playerName: "Satoshi", rarity: "Epic", season: 3,
  };
  it("builds the OG title", () => {
    expect(shareTitle(lookup)).toBe("Tetris — 500 points · XP Arcade");
  });
  it("builds the OG description", () => {
    expect(shareDescription(lookup)).toBe(
      "Epic score NFT minted on Stacks · Season 3 · Play and climb the on-chain leaderboard.",
    );
  });
});

describe("resolveMintedTokenId", () => {
  beforeEach(() => mockFetchJson.mockReset());

  it("extracts the token id from the xp-score mint event", async () => {
    mockFetchJson.mockResolvedValueOnce({
      events: [
        { event_type: "stx_asset", asset: { asset_event_type: "transfer" } },
        {
          event_type: "non_fungible_token_asset",
          asset: {
            asset_event_type: "mint",
            asset_id:
              "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4::xp-score",
            value: { repr: "u42" },
          },
        },
      ],
    });
    expect(await resolveMintedTokenId("0xabc", "snake")).toBe(42);
  });

  it("returns null when there is no mint event", async () => {
    mockFetchJson.mockResolvedValueOnce({ events: [] });
    expect(await resolveMintedTokenId("0xabc", "snake")).toBeNull();
  });

  it("returns null when the API call fails", async () => {
    mockFetchJson.mockRejectedValueOnce(new Error("boom"));
    expect(await resolveMintedTokenId("0xabc", "snake")).toBeNull();
  });
});

describe("seasonShareUrl", () => {
  it("links to the season share page using the game slug", () => {
    expect(seasonShareUrl("snake", 1)).toBe(
      "http://localhost:3000/share/season/snake/1",
    );
  });
});

describe("xSeasonIntentUrl", () => {
  it("builds an X intent for a season leaderboard", () => {
    const u = new URL(xSeasonIntentUrl("pacman", 2));
    expect(u.origin + u.pathname).toBe("https://x.com/intent/post");
    expect(u.searchParams.get("text")).toBe(
      "👾 Pac-Man Season 2 Hall of Fame on XP Arcade 🕹️",
    );
    expect(u.searchParams.get("url")).toBe(
      "http://localhost:3000/share/season/pacman/2",
    );
  });
});
