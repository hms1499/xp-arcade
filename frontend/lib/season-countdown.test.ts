import { describe, expect, it } from "vitest";
import { deriveCountdown, isCountdownUrgent } from "./season-countdown";
import type { Countdown } from "./season-countdown";

const now = Date.parse("2026-06-08T00:00:00Z");

describe("deriveCountdown", () => {
  it("loading source -> loading", () => {
    expect(deriveCountdown({ kind: "loading" }, now).state).toBe("loading");
  });

  it("none source -> unset", () => {
    expect(deriveCountdown({ kind: "none" }, now).state).toBe("unset");
  });

  it("reached block -> reached and carries endBlock", () => {
    const c = deriveCountdown(
      {
        kind: "block",
        reached: true,
        endsAt: new Date(now),
        endBlock: 8470355,
      },
      now,
    );
    expect(c.state).toBe("reached");
    if (c.state === "reached") expect(c.endBlock).toBe(8470355);
  });

  it("future block -> live with remaining time", () => {
    const c = deriveCountdown(
      {
        kind: "block",
        reached: false,
        endsAt: new Date(now + 3_600_000),
        endBlock: 8470355,
      },
      now,
    );
    expect(c.state).toBe("live");
    if (c.state === "live") expect(c.hours).toBe(1);
  });

  it("past ISO -> iso-expired (not permissionless)", () => {
    const c = deriveCountdown(
      { kind: "iso", endsAt: new Date(now - 1000) },
      now,
    );
    expect(c.state).toBe("iso-expired");
  });

  it("future ISO -> live", () => {
    const c = deriveCountdown(
      { kind: "iso", endsAt: new Date(now + 86_400_000) },
      now,
    );
    expect(c.state).toBe("live");
    if (c.state === "live") expect(c.days).toBe(1);
  });
});

describe("isCountdownUrgent", () => {
  it("is false for a multi-day live countdown", () => {
    expect(
      isCountdownUrgent({
        state: "live",
        endsAt: new Date(),
        days: 3,
        hours: 0,
        minutes: 0,
        seconds: 0,
      }),
    ).toBe(false);
  });

  it("is true for a same-day live countdown", () => {
    expect(
      isCountdownUrgent({
        state: "live",
        endsAt: new Date(),
        days: 0,
        hours: 5,
        minutes: 0,
        seconds: 0,
      }),
    ).toBe(true);
  });

  it("is true when the deadline is reached", () => {
    expect(
      isCountdownUrgent({ state: "reached", endsAt: new Date(), endBlock: 100 }),
    ).toBe(true);
  });

  it("is true when the iso deadline expired", () => {
    expect(isCountdownUrgent({ state: "iso-expired", endsAt: new Date() })).toBe(true);
  });

  it("is false while loading or unset", () => {
    expect(isCountdownUrgent({ state: "loading" })).toBe(false);
    expect(isCountdownUrgent({ state: "unset" })).toBe(false);
  });
});
