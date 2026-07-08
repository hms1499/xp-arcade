import { describe, expect, it } from "vitest";
import {
  sanitizeTelemetryPayload,
  isFunnelEvent,
  FUNNEL_EVENTS,
} from "./telemetry";

describe("sanitizeTelemetryPayload", () => {
  it("accepts an error event and redacts the message", () => {
    const p = sanitizeTelemetryPayload({
      event: "wallet_connect_error",
      message: "boom SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV",
    });
    expect(p?.event).toBe("wallet_connect_error");
    expect(p?.message).toContain("[address]");
    expect(p?.game).toBeUndefined();
  });

  it("accepts a funnel event with a valid game and drops the message", () => {
    const p = sanitizeTelemetryPayload({
      event: "mint_confirmed",
      game: "snake",
      message: "should be ignored",
    });
    expect(p?.event).toBe("mint_confirmed");
    expect(p?.game).toBe("snake");
    expect(p?.message).toBe("");
  });

  it("accepts a funnel event without a game", () => {
    const p = sanitizeTelemetryPayload({ event: "game_over" });
    expect(p?.event).toBe("game_over");
    expect(p?.game).toBeUndefined();
  });

  it("rejects an invalid game slug", () => {
    const p = sanitizeTelemetryPayload({ event: "mint_confirmed", game: "bricks" });
    expect(p?.game).toBeUndefined();
  });

  it("rejects an unknown event", () => {
    expect(sanitizeTelemetryPayload({ event: "nope" })).toBeNull();
  });

  it("catalogs the seven funnel events", () => {
    expect(FUNNEL_EVENTS).toHaveLength(7);
    expect(isFunnelEvent("mint_attempted")).toBe(true);
    expect(isFunnelEvent("wallet_connect_error")).toBe(false);
  });
});
