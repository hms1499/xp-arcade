import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PrizePoolHero } from "./PrizePoolHero";
import type { Countdown } from "@/lib/season-countdown";

const liveFar: Countdown = {
  state: "live",
  endsAt: new Date(),
  days: 6,
  hours: 4,
  minutes: 12,
  seconds: 0,
};
const liveSoon: Countdown = {
  state: "live",
  endsAt: new Date(),
  days: 0,
  hours: 3,
  minutes: 0,
  seconds: 0,
};

describe("PrizePoolHero", () => {
  it("renders the total pool in STX and the game count", () => {
    const html = renderToStaticMarkup(
      <PrizePoolHero totalUstx={12_450_000} gameCount={5} countdown={liveFar} />,
    );
    expect(html).toContain("12.45 STX");
    expect(html).toContain("across 5 games");
  });

  it("shows the full sentence (no 'ends in') for a reached deadline", () => {
    const reached: Countdown = {
      state: "reached",
      endsAt: new Date(),
      endBlock: 100,
    };
    const html = renderToStaticMarkup(
      <PrizePoolHero totalUstx={1_000_000} gameCount={5} countdown={reached} />,
    );
    expect(html).toContain("anyone can close the season");
    expect(html).not.toContain("ends in");
  });

  it("shows Loading… when the total is null", () => {
    const html = renderToStaticMarkup(
      <PrizePoolHero totalUstx={null} gameCount={5} countdown={liveFar} />,
    );
    expect(html).toContain("Loading…");
  });

  it("renders the countdown text for a live deadline", () => {
    const html = renderToStaticMarkup(
      <PrizePoolHero totalUstx={1_000_000} gameCount={5} countdown={liveFar} />,
    );
    expect(html).toContain("ends in");
    expect(html).toContain("6d 04h 12m");
  });

  it("uses the urgent red color for a same-day deadline", () => {
    const html = renderToStaticMarkup(
      <PrizePoolHero totalUstx={1_000_000} gameCount={5} countdown={liveSoon} />,
    );
    expect(html).toContain("#cc0000");
  });

  it("does not use urgent red for a multi-day deadline", () => {
    const html = renderToStaticMarkup(
      <PrizePoolHero totalUstx={1_000_000} gameCount={5} countdown={liveFar} />,
    );
    expect(html).not.toContain("#cc0000");
  });
});
