import { describe, it, expect } from "vitest";
import { shouldShowScreensaver } from "./screensaver";

describe("shouldShowScreensaver", () => {
  it("shows when idle, no game open, and motion allowed", () => {
    expect(shouldShowScreensaver({ idle: true, gameOpen: false, reducedMotion: false })).toBe(true);
  });
  it("never shows when not idle", () => {
    expect(shouldShowScreensaver({ idle: false, gameOpen: false, reducedMotion: false })).toBe(false);
  });
  it("never shows over an open game", () => {
    expect(shouldShowScreensaver({ idle: true, gameOpen: true, reducedMotion: false })).toBe(false);
  });
  it("never shows when the user prefers reduced motion", () => {
    expect(shouldShowScreensaver({ idle: true, gameOpen: false, reducedMotion: true })).toBe(false);
  });
});
