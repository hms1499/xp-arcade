import { beforeEach, describe, expect, it } from "vitest";
import {
  LAST_SEEN_RANKS_KEY,
  loadLastSeenRanks,
  saveLastSeenRanks,
} from "./last-seen-ranks";
import type { LiveRanks } from "./player-ranks";

const RANKS: LiveRanks = {
  snake: 3, tetris: null, pacman: null,
  breakout: null, minesweeper: null, solitaire: null,
};

describe("last-seen-ranks", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when nothing stored", () => {
    expect(loadLastSeenRanks("SP123")).toBeNull();
  });

  it("round-trips ranks for the same address", () => {
    saveLastSeenRanks("SP123", RANKS);
    expect(loadLastSeenRanks("SP123")).toEqual(RANKS);
  });

  it("isolates by address (wallet switch → null)", () => {
    saveLastSeenRanks("SP123", RANKS);
    expect(loadLastSeenRanks("SP999")).toBeNull();
  });

  it("returns null on corrupt JSON", () => {
    localStorage.setItem(LAST_SEEN_RANKS_KEY, "{not json");
    expect(loadLastSeenRanks("SP123")).toBeNull();
  });
});
