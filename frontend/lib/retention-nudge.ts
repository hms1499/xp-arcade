import type { GameId } from "./game-registry";
import { GAMES, GAME_IDS } from "./game-registry";
import type { StreakView } from "./daily-challenge";
import type { LiveRanks } from "./player-ranks";
import type { Countdown } from "./season-countdown";
import { isCountdownUrgent, formatCountdown } from "./season-countdown";

export type NudgeKind = "rank-drop" | "season-closing" | "streak-risk";

export type NudgeTarget =
  | { window: "highscore"; gameId: GameId }
  | { window: "game"; gameId: GameId };

export type Nudge = {
  kind: NudgeKind;
  icon: string;
  title: string;
  body: string;
  cta: { label: string; target: NudgeTarget };
};

export type NudgeSignals = {
  address: string | null;
  streak: StreakView;
  dailyGame: GameId;
  ranks: LiveRanks | null;
  lastSeenRanks: LiveRanks | null;
  countdowns: Partial<Record<GameId, Countdown>>;
  shownToday: Partial<Record<NudgeKind, boolean>>;
};

export const NUDGE_SHOWN_KEY = "xp-arcade:nudge";

export function loadNudgeShown(): Partial<Record<NudgeKind, string>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(NUDGE_SHOWN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<NudgeKind, string>>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function markNudgeShown(kind: NudgeKind, day: string): void {
  if (typeof window === "undefined") return;
  try {
    const next = { ...loadNudgeShown(), [kind]: day };
    window.localStorage.setItem(NUDGE_SHOWN_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked → no-op */
  }
}

export function shownTodayMap(
  stored: Partial<Record<NudgeKind, string>>,
  today: string,
): Partial<Record<NudgeKind, boolean>> {
  const out: Partial<Record<NudgeKind, boolean>> = {};
  for (const [kind, day] of Object.entries(stored)) {
    if (day === today) out[kind as NudgeKind] = true;
  }
  return out;
}

export function streakRiskCandidate(signals: NudgeSignals): Nudge | null {
  const { streak, dailyGame } = signals;
  if (streak.currentStreak <= 0 || streak.completedToday) return null;
  const game = GAMES[dailyGame].label;
  return {
    kind: "streak-risk",
    icon: "🔥",
    title: "Keep your streak",
    body: `${streak.currentStreak}-day streak — play today's ${game} challenge to keep it.`,
    cta: { label: "Play now", target: { window: "game", gameId: dailyGame } },
  };
}

export function seasonClosingCandidate(signals: NudgeSignals): Nudge | null {
  const { ranks, countdowns } = signals;
  if (!ranks) return null;
  let best: { gameId: GameId; c: Countdown; endsMs: number } | null = null;
  for (const id of GAME_IDS) {
    if (ranks[id] == null) continue;          // only games the player is on
    const c = countdowns[id];
    if (!c || !isCountdownUrgent(c)) continue;
    const endsMs = "endsAt" in c ? c.endsAt.getTime() : Number.POSITIVE_INFINITY;
    if (!best || endsMs < best.endsMs) best = { gameId: id, c, endsMs };
  }
  if (!best) return null;
  const game = GAMES[best.gameId].label;
  const when = formatCountdown(best.c);
  return {
    kind: "season-closing",
    icon: "⏳",
    title: "Season ending soon",
    body: `${game} season closes ${when || "soon"}. Lock in your rank.`,
    cta: { label: "View standings", target: { window: "highscore", gameId: best.gameId } },
  };
}
