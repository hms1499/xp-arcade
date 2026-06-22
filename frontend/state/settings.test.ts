import { describe, it, expect, beforeEach } from "vitest";
import { useSettings } from "@/state/settings";

describe("useSettings store", () => {
  beforeEach(() => {
    localStorage.clear();
    useSettings.setState({ soundMuted: false, reducedMotion: false });
  });

  it("defaults to sound on and reduced-motion off", () => {
    expect(useSettings.getState().soundMuted).toBe(false);
    expect(useSettings.getState().reducedMotion).toBe(false);
  });

  it("toggleSound flips the flag and persists it", () => {
    useSettings.getState().toggleSound();
    expect(useSettings.getState().soundMuted).toBe(true);
    expect(localStorage.getItem("xp-arcade:settings")).toContain(
      '"soundMuted":true',
    );
  });

  it("toggleReducedMotion flips the flag and persists it", () => {
    useSettings.getState().toggleReducedMotion();
    expect(useSettings.getState().reducedMotion).toBe(true);
    expect(localStorage.getItem("xp-arcade:settings")).toContain(
      '"reducedMotion":true',
    );
  });

  it("hydrate reads persisted values back", () => {
    localStorage.setItem(
      "xp-arcade:settings",
      JSON.stringify({ soundMuted: true, reducedMotion: true }),
    );
    useSettings.getState().hydrate();
    expect(useSettings.getState().soundMuted).toBe(true);
    expect(useSettings.getState().reducedMotion).toBe(true);
  });
});
