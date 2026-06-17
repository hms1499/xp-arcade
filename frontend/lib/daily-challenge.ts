// WARNING: GAME_IDS order is part of the daily schedule — reordering or inserting
// a game shifts which game is spotlighted on every past/future day.
import { GAME_IDS, type GameId } from "./game-registry";

/** Local-date day key, e.g. "2026-06-15". Local (not UTC) so a player's day
 *  follows their own midnight (friendlier streaks, Wordle-style). */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** DJB2 string hash → unsigned 32-bit int. Dependency-free, deterministic. */
function hashDayKey(key: string): number {
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** The single spotlighted game for a day. Same key → same game for everyone. */
export function dailyGame(dayKey: string): GameId {
  return GAME_IDS[hashDayKey(dayKey) % GAME_IDS.length];
}

/** Raw on-chain score targets per game. Tuned below score-risk practicalHigh,
 *  above casual. One table → easy to retune. Minesweeper = 9999 - 180s. */
export const DAILY_TARGETS: Record<GameId, number> = {
  snake: 150,
  tetris: 180,
  pacman: 180,
  breakout: 200,
  minesweeper: 9819,
  solitaire: 4000,
};

export type DailyChallenge = { gameId: GameId; target: number };

export function dailyChallenge(dayKey: string): DailyChallenge {
  const gameId = dailyGame(dayKey);
  return { gameId, target: DAILY_TARGETS[gameId] };
}

/** True when `prev` is exactly the calendar day before `today`. Uses calendar
 *  arithmetic (add one day, compare keys) rather than a millisecond difference,
 *  so it is correct across DST transitions where a local day is 23h or 25h. */
export function isYesterday(prev: string, today: string): boolean {
  const [py, pm, pd] = prev.split("-").map(Number);
  // JS Date normalizes month/year rollovers (e.g. Dec 31 + 1 → Jan 1).
  const dayAfterPrev = new Date(py, pm - 1, pd + 1);
  return todayKey(dayAfterPrev) === today;
}

export type DailyChallengeState = {
  lastCompletedDate: string | null; // YYYY-MM-DD of last completed day
  currentStreak: number;
  bestStreak: number;
};

/** Record a completion for `today`. Idempotent for a repeated same-day call. */
export function applyCompletion(
  state: DailyChallengeState,
  today: string,
): DailyChallengeState {
  if (state.lastCompletedDate === today) return state;
  const continues =
    state.lastCompletedDate != null && isYesterday(state.lastCompletedDate, today);
  const currentStreak = continues ? state.currentStreak + 1 : 1;
  return {
    lastCompletedDate: today,
    currentStreak,
    bestStreak: Math.max(state.bestStreak, currentStreak),
  };
}

export type StreakView = {
  currentStreak: number;
  bestStreak: number;
  completedToday: boolean;
};

/** Derived view for rendering: a streak older than yesterday reads as broken. */
export function viewStreak(state: DailyChallengeState, today: string): StreakView {
  const completedToday = state.lastCompletedDate === today;
  const alive =
    completedToday ||
    (state.lastCompletedDate != null && isYesterday(state.lastCompletedDate, today));
  return {
    currentStreak: alive ? state.currentStreak : 0,
    bestStreak: state.bestStreak,
    completedToday,
  };
}

/** Did this game-over result satisfy today's challenge? */
export function meetsDailyTarget(gameId: GameId, score: number, dayKey: string): boolean {
  const c = dailyChallenge(dayKey);
  return gameId === c.gameId && score >= c.target;
}

export const DAILY_STORAGE_KEY = "xp-arcade:daily";

const DEFAULT_STATE: DailyChallengeState = {
  lastCompletedDate: null,
  currentStreak: 0,
  bestStreak: 0,
};

export function loadDailyState(): DailyChallengeState {
  if (typeof window === "undefined") return { ...DEFAULT_STATE };
  try {
    const raw = window.localStorage.getItem(DAILY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<DailyChallengeState>;
    return {
      lastCompletedDate:
        typeof parsed.lastCompletedDate === "string" ? parsed.lastCompletedDate : null,
      currentStreak: Number.isFinite(parsed.currentStreak) ? Number(parsed.currentStreak) : 0,
      bestStreak: Number.isFinite(parsed.bestStreak) ? Number(parsed.bestStreak) : 0,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveDailyState(state: DailyChallengeState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage blocked → no-op */
  }
}
