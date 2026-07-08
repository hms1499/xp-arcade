import { describe, expect, it } from "vitest";
import {
  EVENT_TTL_SECONDS,
  utcDay,
  dailyKey,
  dailyGameKey,
  totalKey,
  keysForRange,
} from "./metrics-keys";

describe("metrics-keys", () => {
  it("ttl is 90 days in seconds", () => {
    expect(EVENT_TTL_SECONDS).toBe(90 * 24 * 60 * 60);
  });

  it("utcDay formats a UTC date", () => {
    expect(utcDay(new Date("2026-07-08T23:30:00Z"))).toBe("2026-07-08");
    expect(utcDay(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });

  it("builds flat keys", () => {
    expect(dailyKey("mint_confirmed", "2026-07-08")).toBe(
      "ev:mint_confirmed:2026-07-08",
    );
    expect(dailyGameKey("mint_confirmed", "snake", "2026-07-08")).toBe(
      "ev:mint_confirmed:snake:2026-07-08",
    );
    expect(totalKey("mint_confirmed")).toBe("ev:mint_confirmed:total");
  });

  it("keysForRange returns N daily keys, most recent first", () => {
    const keys = keysForRange("game_over", 3, new Date("2026-07-08T12:00:00Z"));
    expect(keys).toEqual([
      "ev:game_over:2026-07-08",
      "ev:game_over:2026-07-07",
      "ev:game_over:2026-07-06",
    ]);
  });
});
