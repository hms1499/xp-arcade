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
};

export type DailyChallenge = { gameId: GameId; target: number };

export function dailyChallenge(dayKey: string): DailyChallenge {
  const gameId = dailyGame(dayKey);
  return { gameId, target: DAILY_TARGETS[gameId] };
}

/** Parse a "YYYY-MM-DD" key to a local-midnight epoch (ms). */
function dayKeyToMs(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

const ONE_DAY_MS = 86_400_000;

/** True when `prev` is exactly the calendar day before `today`. */
export function isYesterday(prev: string, today: string): boolean {
  return dayKeyToMs(today) - dayKeyToMs(prev) === ONE_DAY_MS;
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
