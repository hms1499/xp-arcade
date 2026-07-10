import { describe, it, expect } from "vitest";
import { computeAlerts, type ChainSnapshot, type Thresholds } from "./economic-alerts";
import { formatDiscordMessage } from "./economic-alerts";

const THRESHOLDS: Thresholds = { seasonEndWarnBlocks: 1000, claimWarnBurnBlocks: 432 };

function snapshot(overrides: Partial<ChainSnapshot> = {}): ChainSnapshot {
  return { stacksTip: 100_000, burnTip: 50_000, games: [], ...overrides };
}

function game(overrides: Partial<ChainSnapshot["games"][number]> = {}) {
  return {
    game: "snake",
    currentSeason: 2,
    seasonEndBlock: 0,
    closedSeasons: [],
    ...overrides,
  };
}

describe("computeAlerts — season_ending_soon (#1)", () => {
  it("fires when end-block is ahead within the warn window", () => {
    const snap = snapshot({ stacksTip: 100_000, games: [game({ seasonEndBlock: 100_500 })] });
    const alerts = computeAlerts(snap, THRESHOLDS);
    expect(alerts).toEqual([
      expect.objectContaining({ code: "season_ending_soon", severity: "warning", game: "snake" }),
    ]);
  });

  it("is silent when end-block is unset (0)", () => {
    const snap = snapshot({ games: [game({ seasonEndBlock: 0 })] });
    expect(computeAlerts(snap, THRESHOLDS)).toEqual([]);
  });

  it("is silent when the deadline already passed (dropped season_overdue rule)", () => {
    const snap = snapshot({ stacksTip: 100_000, games: [game({ seasonEndBlock: 99_000 })] });
    expect(computeAlerts(snap, THRESHOLDS)).toEqual([]);
  });

  it("is silent when the deadline is further than the warn window", () => {
    const snap = snapshot({ stacksTip: 100_000, games: [game({ seasonEndBlock: 200_000 })] });
    expect(computeAlerts(snap, THRESHOLDS)).toEqual([]);
  });
});

describe("computeAlerts — finalize_overdue (#2)", () => {
  const base = () =>
    game({
      currentSeason: 2,
      closedSeasons: [
        { season: 1, total: 1_000_000, paid: 200_000, finalized: false, claimDeadline: 40_000 },
      ],
    });

  it("fires (critical) when past claim-deadline, not finalized, money remains", () => {
    const snap = snapshot({ burnTip: 50_000, games: [base()] });
    const alerts = computeAlerts(snap, THRESHOLDS);
    expect(alerts).toEqual([
      expect.objectContaining({ code: "finalize_overdue", severity: "critical", game: "snake" }),
    ]);
  });

  it("is silent when already finalized", () => {
    const g = base();
    g.closedSeasons[0].finalized = true;
    expect(computeAlerts(snapshot({ burnTip: 50_000, games: [g] }), THRESHOLDS)).toEqual([]);
  });

  it("is silent when nothing left to claim (total === paid)", () => {
    const g = base();
    g.closedSeasons[0].paid = 1_000_000;
    expect(computeAlerts(snapshot({ burnTip: 50_000, games: [g] }), THRESHOLDS)).toEqual([]);
  });

  it("is silent when still inside the claim window", () => {
    const snap = snapshot({ burnTip: 39_000, games: [base()] });
    // burnTip < claimDeadline → not overdue; may be claim_closing_soon depending on window
    expect(snap.burnTip).toBeLessThan(40_000);
    const alerts = computeAlerts(snap, THRESHOLDS);
    expect(alerts.some((a) => a.code === "finalize_overdue")).toBe(false);
  });
});

describe("computeAlerts — claim_closing_soon (#3)", () => {
  const closing = () =>
    game({
      currentSeason: 2,
      closedSeasons: [
        { season: 1, total: 1_000_000, paid: 0, finalized: false, claimDeadline: 40_000 },
      ],
    });

  it("fires (warning) when window closes within threshold and money remains", () => {
    const snap = snapshot({ burnTip: 39_800, games: [closing()] }); // 200 blocks left ≤ 432
    const alerts = computeAlerts(snap, THRESHOLDS);
    expect(alerts).toEqual([
      expect.objectContaining({ code: "claim_closing_soon", severity: "warning", game: "snake" }),
    ]);
  });

  it("is silent when the window is not close yet", () => {
    const snap = snapshot({ burnTip: 30_000, games: [closing()] }); // 10_000 left > 432
    expect(computeAlerts(snap, THRESHOLDS)).toEqual([]);
  });

  it("is silent when no money remains", () => {
    const g = closing();
    g.closedSeasons[0].paid = 1_000_000;
    expect(computeAlerts(snapshot({ burnTip: 39_800, games: [g] }), THRESHOLDS)).toEqual([]);
  });
});

describe("computeAlerts — aggregation", () => {
  it("returns [] for an empty snapshot", () => {
    expect(computeAlerts(snapshot(), THRESHOLDS)).toEqual([]);
  });

  it("collects alerts across multiple games and closed seasons", () => {
    const snap = snapshot({
      stacksTip: 100_000,
      burnTip: 50_000,
      games: [
        game({ game: "snake", seasonEndBlock: 100_500 }), // ending soon
        game({
          game: "tetris",
          closedSeasons: [
            { season: 1, total: 500_000, paid: 0, finalized: false, claimDeadline: 40_000 }, // finalize_overdue
          ],
        }),
      ],
    });
    const codes = computeAlerts(snap, THRESHOLDS).map((a) => a.code).sort();
    expect(codes).toEqual(["finalize_overdue", "season_ending_soon"]);
  });
});

describe("formatDiscordMessage", () => {
  const alerts = [
    { severity: "warning" as const, code: "season_ending_soon", game: "snake", message: "snake: season deadline in ~500 stacks blocks (end-block 100500)." },
    { severity: "critical" as const, code: "finalize_overdue", game: "tetris", message: "tetris: season 1 claim window closed with 500000 uSTX unclaimed — call finalize-season(tetris, 1)." },
  ];

  it("puts critical alerts before warnings", () => {
    const { content } = formatDiscordMessage(alerts);
    expect(content.indexOf("finalize_overdue")).toBeLessThan(content.indexOf("season_ending_soon"));
  });

  it("mentions counts of each severity", () => {
    const { content } = formatDiscordMessage(alerts);
    expect(content).toContain("1 critical");
    expect(content).toContain("1 warning");
  });

  it("contains no principals or txids", () => {
    const { content } = formatDiscordMessage(alerts);
    expect(content).not.toMatch(/S[PT][0-9A-Z]{6,}/); // no SP…/ST… principals
    expect(content).not.toMatch(/0x[0-9a-fA-F]{8,}/); // no txids
  });

  it("handles an empty list without throwing", () => {
    expect(() => formatDiscordMessage([])).not.toThrow();
  });
});
