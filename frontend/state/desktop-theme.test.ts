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
      "classic-teal",
      "arcade-grid",
    ]);
  });

  it("validates theme ids", () => {
    expect(isDesktopThemeId("night-city")).toBe(true);
    expect(isDesktopThemeId("classic-teal")).toBe(true);
    expect(isDesktopThemeId("arcade-grid")).toBe(true);
    expect(isDesktopThemeId("unknown")).toBe(false);
  });

  it("updates the active theme", () => {
    const next: DesktopThemeId = "classic-teal";
    useDesktopTheme.getState().setTheme(next);
    expect(useDesktopTheme.getState().theme).toBe(next);
  });
});
