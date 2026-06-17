import { describe, it, expect, vi } from "vitest";

// The window pulls in many stores; this test only asserts the module loads and
// the scoring wiring constant is correct. Full play-through is engine-tested.
import { solitaireScore } from "@/lib/solitaire-score";

describe("SolitaireWindow wiring", () => {
  it("a 2-minute win computes to a 6000 score", () => {
    expect(solitaireScore(120)).toBe(6000);
  });

  it("module imports without throwing", async () => {
    vi.stubGlobal("matchMedia", undefined);
    const mod = await import("./SolitaireWindow");
    expect(typeof mod.SolitaireWindow).toBe("function");
  });
});
