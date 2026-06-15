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
