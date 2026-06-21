import { describe, it, expect } from "vitest";
import { GAME_IDS, type GameId } from "./game-registry";
import type { TopEntry } from "./contract-calls";
import {
  rankPoints,
  computeArcadeChampions,
  detectNewChampion,
  type RowsByGame,
  type ChampionEntry,
} from "./arcade-champion";

/** Players given highest-first; assigns descending scores so findPlayerRank
 *  yields rank = array position (1-based). */
function board(...players: string[]): TopEntry[] {
  return players.map((player, i) => ({ player, score: 1000 - i }));
}

/** Build a full RowsByGame, empty where unspecified. */
function rowsOf(partial: Partial<Record<GameId, TopEntry[]>>): RowsByGame {
  return GAME_IDS.reduce((acc, id) => {
    acc[id] = partial[id] ?? [];
    return acc;
  }, {} as RowsByGame);
}

describe("rankPoints", () => {
  it("awards 11 - rank inside the top 10, else 0", () => {
    expect(rankPoints(1)).toBe(10);
    expect(rankPoints(10)).toBe(1);
    expect(rankPoints(0)).toBe(0);
    expect(rankPoints(11)).toBe(0);
  });
});

describe("computeArcadeChampions", () => {
  it("sums rank points across games and sorts by total", () => {
    const rows = rowsOf({
      snake: board("A", "B"),   // A #1, B #2
      tetris: board("B", "C"),  // B #1, C #2
      pacman: board("B"),       // B #1
    });
    const champs = computeArcadeChampions(rows);
    expect(champs[0]).toMatchObject({ player: "B", points: 29, firsts: 2, gamesRanked: 3 });
    expect(champs.map((c) => c.player)).toEqual(["B", "A", "C"]);
  });

  it("excludes players not ranked in any game and handles an empty snapshot", () => {
    expect(computeArcadeChampions(rowsOf({}))).toEqual([]);
  });

  it("includes a player ranked in only one game", () => {
    const champs = computeArcadeChampions(rowsOf({ snake: board("solo") }));
    expect(champs).toHaveLength(1);
    expect(champs[0]).toMatchObject({ player: "solo", points: 10, gamesRanked: 1 });
  });

  it("tie-breaks equal points by more #1 finishes", () => {
    // P: snake #1 (10) + tetris #3 (8) = 18, firsts 1
    // Q: pacman #2 (9) + breakout #2 (9) = 18, firsts 0
    const rows = rowsOf({
      snake: board("P", "g"),            // P #1 -> 10
      tetris: board("h", "i", "P"),      // P #3 -> 8
      pacman: board("j", "Q"),           // Q #2 -> 9
      breakout: board("k", "Q"),         // Q #2 -> 9
    });
    const top2 = computeArcadeChampions(rows).slice(0, 2).map((c) => c.player);
    expect(top2).toEqual(["P", "Q"]); // equal 18 pts; P wins on firsts (1 > 0)
  });

  it("tie-breaks equal points and equal firsts by the better single rank", () => {
    const rows = rowsOf({
      snake: board("e", "P"),                 // P #2 -> 9
      tetris: board("f1", "f2", "f3", "P"),   // P #4 -> 7   (P: 16, firsts 0, bestRank 2)
      pacman: board("g1", "g2", "Q"),         // Q #3 -> 8
      breakout: board("h1", "h2", "Q"),       // Q #3 -> 8   (Q: 16, firsts 0, bestRank 3)
    });
    const champs = computeArcadeChampions(rows);
    const top2 = champs.slice(0, 2).map((c) => c.player);
    expect(top2).toEqual(["P", "Q"]); // 16 == 16, 0 == 0 firsts; P wins (bestRank 2 < 3)
  });
});

function champ(player: string): ChampionEntry {
  return { player, points: 10, ranks: {} as never, firsts: 1, bestRank: 1, gamesRanked: 1 };
}

describe("detectNewChampion", () => {
  it("returns null on first-ever sight (no stored champion)", () => {
    expect(detectNewChampion(null, [champ("A")])).toBeNull();
  });

  it("returns null when the leader is unchanged", () => {
    expect(detectNewChampion("A", [champ("A"), champ("B")])).toBeNull();
  });

  it("returns null when there is no leader", () => {
    expect(detectNewChampion("A", [])).toBeNull();
  });

  it("reports the new leader and who was dethroned on a throne change", () => {
    expect(detectNewChampion("A", [champ("B"), champ("A")])).toEqual({
      player: "B",
      dethroned: "A",
    });
  });
});
