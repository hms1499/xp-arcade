/**
 * Whether the idle screensaver should be visible. Pure so it can be unit-tested.
 * Suppressed over an open game (don't interrupt play) and under reduced-motion.
 */
export function shouldShowScreensaver(opts: {
  idle: boolean;
  gameOpen: boolean;
  reducedMotion: boolean;
}): boolean {
  return opts.idle && !opts.gameOpen && !opts.reducedMotion;
}
