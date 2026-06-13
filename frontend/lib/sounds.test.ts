import { describe, it, expect } from "vitest";
import { playEat, playBootChimeOnce } from "@/lib/sounds";

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
