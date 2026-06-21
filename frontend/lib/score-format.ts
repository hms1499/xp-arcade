import type { GameId } from "./game-registry";

/** Full prose label for a score, e.g. "400".
 *
 * Every game — including the time-based ones (minesweeper/solitaire) — shows the
 * raw on-chain number. Those games store an encoded score where a higher number
 * is a faster/better result, so the raw value already reads as "higher = better",
 * exactly like the points games. `gameId` is kept in the signature so callers
 * stay uniform and per-game formatting can return later if needed. */
export function formatScore(gameId: GameId, score: number): string {
  void gameId;
  return String(score);
}

/** Compact value for tiles/leaderboards, e.g. "400". Same raw number as
 *  formatScore. */
export function formatScoreValue(gameId: GameId, score: number): string {
  void gameId;
  return String(score);
}
