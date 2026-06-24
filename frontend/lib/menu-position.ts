/**
 * Position a popup menu at the cursor, nudged so it stays fully on-screen.
 * Pure so it can be unit-tested without a DOM.
 */
export function clampMenuPosition(
  x: number,
  y: number,
  menuW: number,
  menuH: number,
  viewportW: number,
  viewportH: number,
): { x: number; y: number } {
  const cx = Math.max(0, Math.min(x, viewportW - menuW));
  const cy = Math.max(0, Math.min(y, viewportH - menuH));
  return { x: cx, y: cy };
}
