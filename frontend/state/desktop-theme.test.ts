import { beforeEach, describe, expect, it } from "vitest";
import {
  DESKTOP_THEMES,
  isDesktopThemeId,
  useDesktopTheme,
  type DesktopThemeId,
} from "./desktop-theme";

beforeEach(() => {
  useDesktopTheme.setState({ theme: "night-city" });
  localStorage.clear();
});

describe("desktop theme store", () => {
  it("exposes the MVP theme options", () => {
    expect(DESKTOP_THEMES.map((theme) => theme.id)).toEqual([
      "night-city",
      "snake-terminal",
      "tetris-rain",
      "pacman-maze",
    ]);
  });

  it("validates theme ids", () => {
    expect(isDesktopThemeId("night-city")).toBe(true);
    expect(isDesktopThemeId("snake-terminal")).toBe(true);
    expect(isDesktopThemeId("tetris-rain")).toBe(true);
    expect(isDesktopThemeId("pacman-maze")).toBe(true);
    expect(isDesktopThemeId("classic-teal")).toBe(false);
    expect(isDesktopThemeId("unknown")).toBe(false);
  });

  it("updates the active theme", () => {
    const next: DesktopThemeId = "snake-terminal";
    useDesktopTheme.getState().setTheme(next);
    expect(useDesktopTheme.getState().theme).toBe(next);
  });
});
