import { describe, it, expect } from "vitest";
import { canOfferSeasonClose } from "./season-close";

const base = {
  countdownReached: true,
  alreadyEnded: false,
  poolUstx: 500_000 as number | null,
  topTenCount: 4,
};

describe("canOfferSeasonClose", () => {
  it("offers the close once the deadline block is reached and the season holds value", () => {
    expect(canOfferSeasonClose(base)).toBe(true);
  });

  it("does not offer a close before the deadline block", () => {
    expect(canOfferSeasonClose({ ...base, countdownReached: false })).toBe(false);
  });

  it("does not re-offer a close this browser already submitted", () => {
    expect(canOfferSeasonClose({ ...base, alreadyEnded: true })).toBe(false);
  });

  // The stillborn-season guard: end-season does not reset season-end-block, so a
  // freshly-opened season inherits the past deadline and reads as "reached".
  // Closing it would snapshot nothing and roll another stillborn season.
  it("does not offer a close for an empty season (no pool, no top-10)", () => {
    expect(canOfferSeasonClose({ ...base, poolUstx: 0, topTenCount: 0 })).toBe(false);
  });

  it("offers a close when the pool is empty but scores were posted", () => {
    expect(canOfferSeasonClose({ ...base, poolUstx: 0, topTenCount: 3 })).toBe(true);
  });

  it("offers a close when the pool holds fees but no score is ranked yet", () => {
    expect(canOfferSeasonClose({ ...base, poolUstx: 20_000, topTenCount: 0 })).toBe(true);
  });

  it("fails closed while the pool is unknown (read failed or still loading)", () => {
    expect(canOfferSeasonClose({ ...base, poolUstx: null, topTenCount: 0 })).toBe(false);
    expect(canOfferSeasonClose({ ...base, poolUstx: null, topTenCount: 5 })).toBe(false);
  });
});
