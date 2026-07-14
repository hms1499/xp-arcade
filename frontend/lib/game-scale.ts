/**
 * The ceiling is the only clamp, and it is a design bound, not a guard: it
 * stops a maximized window on a large display from blowing the field up into
 * abstract art. There is deliberately NO floor. A floor would clamp the scale
 * ABOVE what the window's available space affords whenever the window is
 * small enough -- and that can only ever push the field past the viewport
 * that clips it, hiding part of the game. The field must always fit, even if
 * that means a very small game at the smallest window; the user opted into
 * that by dragging the window there.
 */
export const MAX_GAME_SCALE = 3;

export type GameScaleInput = {
  availW: number;
  availH: number;
  naturalW: number;
  naturalH: number;
};

/**
 * Uniform scale that fits a game's natural pixel size into the space its window
 * currently affords. Takes the smaller ratio so the field never distorts; the
 * leftover space on the long axis becomes letterbox.
 *
 * Returns 1 when either size is unmeasured or degenerate (first paint, or a
 * transient zero-size box mid-layout), so games open at exactly the size they
 * have today.
 */
export function computeGameScale({
  availW,
  availH,
  naturalW,
  naturalH,
}: GameScaleInput): number {
  if (naturalW <= 0 || naturalH <= 0) return 1;
  if (availW <= 0 || availH <= 0) return 1;
  const fit = Math.min(availW / naturalW, availH / naturalH);
  return Math.min(MAX_GAME_SCALE, fit);
}
