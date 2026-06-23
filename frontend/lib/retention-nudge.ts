import type { GameId } from "./game-registry";
import type { StreakView } from "./daily-challenge";
import type { LiveRanks } from "./player-ranks";
import type { Countdown } from "./season-countdown";

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
