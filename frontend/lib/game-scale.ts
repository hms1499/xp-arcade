/**
 * The floor is a guard, not a design knob: a scale clamped ABOVE what the
 * window affords would push the field past the viewport that clips it, hiding
 * part of the game. It sits below anything reachable from the 300x200 window
 * minimum. The ceiling is the bound meant to be felt -- it stops a maximized
 * window on a large display from blowing the field up into abstract art.
 */
export const MIN_GAME_SCALE = 0.25;
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
  return Math.min(MAX_GAME_SCALE, Math.max(MIN_GAME_SCALE, fit));
}
