import { GAME_IDS, type GameId } from "./game-registry";

/** Local-date day key, e.g. "2026-06-15". Local (not UTC) so a player's day
 *  follows their own midnight (friendlier streaks, Wordle-style). */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
