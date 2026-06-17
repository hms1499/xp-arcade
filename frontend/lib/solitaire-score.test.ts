import { describe, it, expect } from "vitest";
import { SOLITAIRE_BONUS_K, solitaireScore, solitaireSeconds } from "./solitaire-score";

describe("solitaire-score", () => {
  it("uses the 720000 bonus constant", () => {
    expect(SOLITAIRE_BONUS_K).toBe(720_000);
  });

  it("maps win time to a bounded integer score", () => {
    expect(solitaireScore(120)).toBe(6000);
    expect(solitaireScore(180)).toBe(4000);
    expect(solitaireScore(300)).toBe(2400);
  });

  it("clamps very fast wins to the 9999 cap", () => {
    expect(solitaireScore(10)).toBe(9999);
    expect(solitaireScore(0)).toBe(9999); // guarded against divide-by-zero
  });

  it("never returns a negative or non-integer score", () => {
    const s = solitaireScore(99999);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
  });

  it("solitaireSeconds inverts the score back to win time", () => {
    expect(solitaireSeconds(6000)).toBe(120);
    expect(solitaireSeconds(4000)).toBe(180);
  });
});
