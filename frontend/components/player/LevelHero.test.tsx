import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LevelHero } from "./LevelHero";
import type { LevelInfo } from "@/lib/level";

const info: LevelInfo = {
  level: 12,
  title: "Pro",
  xp: 12000,
  xpIntoLevel: 1200,
  xpForNextLevel: 2300,
  progress: 1200 / 2300,
};

describe("LevelHero", () => {
  it("renders the level, title, XP and an accessible progressbar", () => {
    const html = renderToStaticMarkup(<LevelHero info={info} />);
    expect(html).toContain("Lv 12");
    expect(html).toContain("Pro");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemax="2300"');
  });

  it("shows the next title unlock for a mid-tier level", () => {
    const html = renderToStaticMarkup(<LevelHero info={info} />);
    expect(html).toContain("Next: Ace @ Lv 15");
  });

  it("renders the XP breakdown only when provided", () => {
    const withBreakdown = renderToStaticMarkup(
      <LevelHero info={info} breakdown={{ base: 10000, play: 1500, streak: 500 }} />,
    );
    expect(withBreakdown).toContain("On-chain");
    expect(withBreakdown).toContain("Play");
    expect(withBreakdown).toContain("Streak");
    expect(renderToStaticMarkup(<LevelHero info={info} />)).not.toContain(
      "On-chain",
    );
  });

  it("shows a max-title note at the top band", () => {
    const top: LevelInfo = { ...info, level: 30, title: "Arcade Legend" };
    const html = renderToStaticMarkup(<LevelHero info={top} />);
    expect(html).toContain("Max title");
  });
});
