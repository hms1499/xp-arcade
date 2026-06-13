import { describe, it, expect, beforeEach } from "vitest";
import {
  WELCOME_STORAGE_KEY,
  hasSeenWelcome,
  markWelcomeSeen,
} from "@/lib/welcome";

describe("welcome gate", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("exposes the storage key", () => {
    expect(WELCOME_STORAGE_KEY).toBe("xp-arcade:welcomed");
  });

  it("hasSeenWelcome is false when the flag is unset", () => {
    expect(hasSeenWelcome()).toBe(false);
  });

  it("markWelcomeSeen writes '1' under the key", () => {
    markWelcomeSeen();
    expect(window.localStorage.getItem(WELCOME_STORAGE_KEY)).toBe("1");
  });

  it("hasSeenWelcome is true after markWelcomeSeen", () => {
    markWelcomeSeen();
    expect(hasSeenWelcome()).toBe(true);
  });
});
