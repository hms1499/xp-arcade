const BEST_SCORE_KEY = "xp-arcade:best-score";

/** Personal best score persisted in localStorage. 0 if none / SSR / corrupt. */
export function getBestScore(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(BEST_SCORE_KEY);
  const n = Number(raw);
  return raw !== null && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Records a finished game's score. Persists it only if it beats the stored
 * best. Returns the (possibly unchanged) best and whether this run set a
 * new record.
 */
export function recordScore(score: number): {
  best: number;
  isNewRecord: boolean;
} {
  const prev = getBestScore();
  if (score > prev) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(BEST_SCORE_KEY, String(score));
    }
    return { best: score, isNewRecord: true };
  }
  return { best: prev, isNewRecord: false };
}
