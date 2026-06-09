import { describe, expect, it } from "vitest";
import { AVG_STACKS_BLOCK_SECONDS, blocksToEta } from "./season-blocks";

describe("blocksToEta", () => {
  const now = new Date("2026-06-08T00:00:00Z");

  it("projects remaining blocks at the average cadence", () => {
    const eta = blocksToEta(1000, 900, now);
    expect(eta.getTime()).toBe(
      now.getTime() + 100 * AVG_STACKS_BLOCK_SECONDS * 1000,
    );
  });

  it("clamps to now when the target block is already reached", () => {
    expect(blocksToEta(900, 1000, now).getTime()).toBe(now.getTime());
    expect(blocksToEta(900, 900, now).getTime()).toBe(now.getTime());
  });
});
