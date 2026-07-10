export type Severity = "critical" | "warning";

export type Alert = {
  severity: Severity;
  code: string;
  game: string;
  message: string;
};

export type ClosedSeason = {
  season: number;
  total: number; // uSTX
  paid: number; // uSTX
  finalized: boolean;
  claimDeadline: number; // burn block height
};

export type GameState = {
  game: string; // slug, e.g. "snake"
  currentSeason: number;
  seasonEndBlock: number; // 0 = unset
  closedSeasons: ClosedSeason[];
};

export type ChainSnapshot = {
  stacksTip: number;
  burnTip: number;
  games: GameState[];
};

export type Thresholds = {
  seasonEndWarnBlocks: number;
  claimWarnBurnBlocks: number;
};

function seasonEndingSoon(
  g: GameState,
  stacksTip: number,
  thresholds: Thresholds,
): Alert | null {
  if (g.seasonEndBlock <= 0) return null;
  const remaining = g.seasonEndBlock - stacksTip;
  if (remaining <= 0 || remaining > thresholds.seasonEndWarnBlocks) return null;
  return {
    severity: "warning",
    code: "season_ending_soon",
    game: g.game,
    message: `${g.game}: season deadline in ~${remaining} stacks blocks (end-block ${g.seasonEndBlock}).`,
  };
}

function closedSeasonAlerts(
  g: GameState,
  burnTip: number,
  thresholds: Thresholds,
): Alert[] {
  const out: Alert[] = [];
  for (const s of g.closedSeasons) {
    const unclaimed = s.total - s.paid;
    if (s.finalized || unclaimed <= 0) continue;

    if (burnTip > s.claimDeadline) {
      out.push({
        severity: "critical",
        code: "finalize_overdue",
        game: g.game,
        message: `${g.game}: season ${s.season} claim window closed with ${unclaimed} uSTX unclaimed — call finalize-season(${g.game}, ${s.season}).`,
      });
      continue;
    }

    const remaining = s.claimDeadline - burnTip;
    if (remaining > 0 && remaining <= thresholds.claimWarnBurnBlocks) {
      out.push({
        severity: "warning",
        code: "claim_closing_soon",
        game: g.game,
        message: `${g.game}: season ${s.season} claim window closes in ~${remaining} burn blocks with ${unclaimed} uSTX still unclaimed.`,
      });
    }
  }
  return out;
}

export function computeAlerts(
  snapshot: ChainSnapshot,
  thresholds: Thresholds,
): Alert[] {
  const alerts: Alert[] = [];
  for (const g of snapshot.games) {
    const ending = seasonEndingSoon(g, snapshot.stacksTip, thresholds);
    if (ending) alerts.push(ending);
    alerts.push(...closedSeasonAlerts(g, snapshot.burnTip, thresholds));
  }
  return alerts;
}
