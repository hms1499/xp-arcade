import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DesktopChampionPanel } from "./DesktopChampionPanel";
import type { ChampionEntry } from "@/lib/arcade-champion";
import type { GameId } from "@/lib/game-registry";

function entry(player: string, points: number): ChampionEntry {
  return {
    player,
    points,
    ranks: {} as Record<GameId, number | null>,
    firsts: 1,
    bestRank: 1,
    gamesRanked: 1,
  };
}

describe("DesktopChampionPanel", () => {
  it("shows the reigning champion and points", () => {
    const html = renderToStaticMarkup(
      <DesktopChampionPanel entries={[entry("SP_AAAAAAAA_BBBB", 29)]} isNew={false} onOpen={() => {}} />,
    );
    expect(html).toContain("Arcade Champion");
    expect(html).toContain("29");
  });

  it("renders an awaiting state with no entries", () => {
    const html = renderToStaticMarkup(
      <DesktopChampionPanel entries={[]} isNew={false} onOpen={() => {}} />,
    );
    expect(html).toContain("Awaiting");
  });

  it("shows a NEW! pip on a throne change", () => {
    const html = renderToStaticMarkup(
      <DesktopChampionPanel entries={[entry("SP_AAAAAAAA_BBBB", 29)]} isNew onOpen={() => {}} />,
    );
    expect(html).toContain("NEW!");
  });
});
