import type { GameId } from "./game-registry";

/** seconds encoded inside a Minesweeper score (score = 9999 - seconds). */
export function minesweeperSeconds(score: number): number {
  return Math.min(9999, Math.max(0, 9999 - Math.floor(score)));
}

/** Full prose label for a score, e.g. "Cleared in 47s" or "400". */
export function formatScore(gameId: GameId, score: number): string {
  if (gameId === "minesweeper") return `Cleared in ${minesweeperSeconds(score)}s`;
  return String(score);
}

/** Compact value for tiles/leaderboards, e.g. "47s" or "400". */
export function formatScoreValue(gameId: GameId, score: number): string {
  if (gameId === "minesweeper") return `${minesweeperSeconds(score)}s`;
  return String(score);
}
