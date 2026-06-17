/** Homage to Microsoft Solitaire's original end-game time bonus (700000/time). */
export const SOLITAIRE_BONUS_K = 720_000;

/** Win time (seconds) -> on-chain score. Bounded to [0, 9999], integer. */
export function solitaireScore(winSeconds: number): number {
  const seconds = Math.max(1, Math.floor(winSeconds));
  return Math.min(9999, Math.max(0, Math.round(SOLITAIRE_BONUS_K / seconds)));
}

/** Inverse of solitaireScore: stored score -> displayed win time (seconds). */
export function solitaireSeconds(score: number): number {
  const s = Math.max(1, Math.floor(score));
  return Math.round(SOLITAIRE_BONUS_K / s);
}
