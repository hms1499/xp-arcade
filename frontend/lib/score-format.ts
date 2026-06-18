import type { GameId } from "./game-registry";
import { solitaireSeconds } from "./solitaire-score";

/** seconds encoded inside a Minesweeper score (score = 9999 - seconds). */
export function minesweeperSeconds(score: number): number {
  return Math.min(9999, Math.max(0, 9999 - Math.floor(score)));
}

/** Win-time (seconds) encoded in a time-based game's score. Minesweeper is a
 *  linear inversion (9999 - seconds); solitaire is non-linear (720000 / seconds),
 *  so a score delta is NOT a seconds delta — callers needing a seconds gap must
 *  derive it from this, not from raw score arithmetic. Points games have no time
 *  meaning, so the score is returned unchanged (callers guard on game type). */
export function secondsForScore(gameId: GameId, score: number): number {
  if (gameId === "minesweeper") return minesweeperSeconds(score);
  if (gameId === "solitaire") return solitaireSeconds(score);
  return score;
}

/** Full prose label for a score, e.g. "Cleared in 47s" or "400". */
export function formatScore(gameId: GameId, score: number): string {
  if (gameId === "minesweeper") return `Cleared in ${minesweeperSeconds(score)}s`;
  if (gameId === "solitaire") return `Won in ${solitaireSeconds(score)}s`;
  return String(score);
}

/** Compact value for tiles/leaderboards, e.g. "47s" or "400". */
export function formatScoreValue(gameId: GameId, score: number): string {
  if (gameId === "minesweeper") return `${minesweeperSeconds(score)}s`;
  if (gameId === "solitaire") return `${solitaireSeconds(score)}s`;
  return String(score);
}
