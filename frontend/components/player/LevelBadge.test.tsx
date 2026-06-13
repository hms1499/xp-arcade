import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LevelBadge } from "./LevelBadge";
import type { LevelInfo } from "@/lib/level";

const info: LevelInfo = {
  level: 10,
  title: "Pro",
  xp: 9340,
  xpIntoLevel: 1240,
  xpForNextLevel: 1900,
  progress: 1240 / 1900,
};

describe("LevelBadge", () => {
  it("renders level number and title", () => {
    const html = renderToStaticMarkup(<LevelBadge info={info} />);
    expect(html).toContain("Lv 10");
    expect(html).toContain("Pro");
  });

  it("exposes XP as an accessible progressbar", () => {
    const html = renderToStaticMarkup(<LevelBadge info={info} />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="1240"');
    expect(html).toContain('aria-valuemax="1900"');
  });
});
