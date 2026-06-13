import { describe, it, expect } from "vitest";
import { playEat } from "@/lib/sounds";

describe("sounds — AudioContext safety", () => {
  it("invoking a sound never throws when AudioContext is unavailable", () => {
    // jsdom has no AudioContext; getCtx() must swallow construction failure.
    expect(() => playEat()).not.toThrow();
  });
});
