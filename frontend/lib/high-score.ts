import type { GameId } from "./game-registry";

const LEGACY_KEY = "xp-arcade:best-score";
function keyFor(gameId: GameId): string {
  return `xp-arcade:best-score:${gameId}`;
}

function readKey(key: string): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(key);
  const n = Number(raw);
  return raw !== null && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Personal best for a game (localStorage). 0 if none / SSR / corrupt. Snake
 * falls back to the pre-multigame global key so returning players keep it. */
export function getBestScore(gameId: GameId): number {
  const scoped = readKey(keyFor(gameId));
  if (scoped > 0) return scoped;
  if (gameId === "snake") return readKey(LEGACY_KEY);
  return 0;
}

/** Records a finished game's score, persisting only if it beats the stored
 * best for that game. */
export function recordScore(
  gameId: GameId,
  score: number,
): { best: number; isNewRecord: boolean } {
  const prev = getBestScore(gameId);
  if (score > prev) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(keyFor(gameId), String(score));
    }
    return { best: score, isNewRecord: true };
  }
  return { best: prev, isNewRecord: false };
}
