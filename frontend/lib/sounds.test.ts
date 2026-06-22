import { describe, it, expect, afterEach } from "vitest";
import {
  playEat,
  playBootChimeOnce,
  setSoundMuted,
  isSoundMuted,
} from "@/lib/sounds";

describe("sound mute", () => {
  afterEach(() => setSoundMuted(false));

  it("is off by default", () => {
    expect(isSoundMuted()).toBe(false);
  });

  it("setSoundMuted toggles the muted flag", () => {
    setSoundMuted(true);
    expect(isSoundMuted()).toBe(true);
    setSoundMuted(false);
    expect(isSoundMuted()).toBe(false);
  });

  it("playing a sound while muted never throws", () => {
    setSoundMuted(true);
    expect(() => playEat()).not.toThrow();
  });
});

describe("sounds — AudioContext safety", () => {
  it("invoking a sound never throws when AudioContext is unavailable", () => {
    // jsdom has no AudioContext; getCtx() must swallow construction failure.
    expect(() => playEat()).not.toThrow();
  });
});

describe("playBootChimeOnce — once per session", () => {
  it("plays on the first call and no-ops afterward", () => {
    expect(playBootChimeOnce()).toBe(true);
    expect(playBootChimeOnce()).toBe(false);
    expect(playBootChimeOnce()).toBe(false);
  });
});
