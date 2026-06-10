import { describe, expect, it } from "vitest";
import { deriveCountdown } from "./season-countdown";

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
