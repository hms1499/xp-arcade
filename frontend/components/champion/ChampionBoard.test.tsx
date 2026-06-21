import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChampionBoard } from "./ChampionBoard";
import type { ChampionEntry } from "@/lib/arcade-champion";
import type { GameId } from "@/lib/game-registry";

function entry(player: string, points: number, ranks: Partial<Record<GameId, number>>): ChampionEntry {
  const full = {
    snake: null, tetris: null, pacman: null,
    breakout: null, minesweeper: null, solitaire: null,
  } as Record<GameId, number | null>;
  for (const k of Object.keys(ranks) as GameId[]) full[k] = ranks[k]!;
  const ranked = Object.values(full).filter((r) => r != null) as number[];
  return {
    player,
    points,
    ranks: full,
    firsts: ranked.filter((r) => r === 1).length,
    bestRank: ranked.length ? Math.min(...ranked) : 11,
    gamesRanked: ranked.length,
  };
}

const champs: ChampionEntry[] = [
  entry("SP1111111111111111111111111111111111AAAA", 29, { snake: 1, tetris: 1, pacman: 1 }),
  entry("SP2222222222222222222222222222222222BBBB", 18, { snake: 2, breakout: 1 }),
  entry("SP3333333333333333333333333333333333CCCC", 9, { tetris: 2 }),
];

describe("ChampionBoard", () => {
  it("renders the marquee, season, and the leader's points", () => {
    const html = renderToStaticMarkup(
      <ChampionBoard champions={champs} season={3} address={null} newChampion={null} lastUpdated={new Date()} />,
    );
    expect(html).toContain("ARCADE CHAMPION");
    expect(html).toContain("Season 3");
    expect(html).toContain("29");
  });

  it("shows an empty state when there are no champions", () => {
    const html = renderToStaticMarkup(
      <ChampionBoard champions={[]} season={null} address={null} newChampion={null} lastUpdated={null} />,
    );
    expect(html).toContain("No ranked players yet");
  });

  it("renders the NEW CHAMPION banner on a throne change", () => {
    const html = renderToStaticMarkup(
      <ChampionBoard
        champions={champs}
        season={3}
        address={null}
        newChampion={{ player: champs[0].player, dethroned: champs[1].player }}
        lastUpdated={new Date()}
      />,
    );
    expect(html).toContain("NEW CHAMPION");
  });

  it("marks the connected wallet's row as YOU", () => {
    const html = renderToStaticMarkup(
      <ChampionBoard champions={champs} season={3} address={champs[1].player} newChampion={null} lastUpdated={new Date()} />,
    );
    expect(html).toContain("YOU");
  });
});
