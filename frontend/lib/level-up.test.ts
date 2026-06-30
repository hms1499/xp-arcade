import { describe, it, expect } from "vitest";
import { decideLevelUpToast, levelUpStep } from "./level-up";

describe("decideLevelUpToast", () => {
  it("returns null when level did not increase", () => {
    expect(decideLevelUpToast({ prevLevel: 7, nextLevel: 7 })).toBeNull();
    expect(decideLevelUpToast({ prevLevel: 7, nextLevel: 6 })).toBeNull();
  });

  it("returns an info toast for a same-title level increase", () => {
    // Lv6 and Lv7 are both 'Player' (band starts at 5, next at 10).
    const toast = decideLevelUpToast({ prevLevel: 6, nextLevel: 7 });
    expect(toast).not.toBeNull();
    expect(toast!.type).toBe("info");
    expect(toast!.title).toContain("7");
  });

  it("returns a success 'New title' toast when a title band is crossed", () => {
    // 9 is 'Player' (band starts at 5), 10 is 'Pro' (band starts at 10).
    const toast = decideLevelUpToast({ prevLevel: 9, nextLevel: 10 });
    expect(toast).not.toBeNull();
    expect(toast!.type).toBe("success");
    expect(toast!.title).toContain("Pro");
    expect(toast!.body).toContain("10");
  });
});

describe("levelUpStep", () => {
  it("baselines silently on first observation (no toast)", () => {
    const r = levelUpStep({ baselined: false, ack: 0, level: 6 });
    expect(r).toEqual({ ack: 6, baselined: true, toast: null });
  });

  it("baseline never lowers ack", () => {
    const r = levelUpStep({ baselined: false, ack: 9, level: 6 });
    expect(r).toEqual({ ack: 9, baselined: true, toast: null });
  });

  it("toasts and raises ack on a live increase after baseline", () => {
    const r = levelUpStep({ baselined: true, ack: 6, level: 8 });
    expect(r.ack).toBe(8);
    expect(r.toast).not.toBeNull();
    expect(r.toast!.title).toContain("8");
  });

  it("is a no-op when baselined and level did not rise", () => {
    const r = levelUpStep({ baselined: true, ack: 8, level: 8 });
    expect(r).toEqual({ ack: 8, baselined: true, toast: null });
  });
});
