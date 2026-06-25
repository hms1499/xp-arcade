export type MilestoneTier = "leaderboard" | "personal-best" | "none";

export type GameOverMilestone = {
  tier: MilestoneTier;
  celebrate: boolean;
  sound: boolean;
  confetti: boolean;
};

/**
 * Decides the game-over celebration tier from data already computed by
 * useGameSession (`isTopScore`) and recordScore (`isNewRecord`). Top-10 wins
 * over a plain personal best; a personal best that misses top-10 is celebrated
 * silently (no sound, no confetti).
 */
export function gameOverMilestone({
  isTopScore,
  isNewRecord,
}: {
  isTopScore: boolean;
  isNewRecord: boolean;
}): GameOverMilestone {
  if (isTopScore) {
    return { tier: "leaderboard", celebrate: true, sound: true, confetti: true };
  }
  if (isNewRecord) {
    return {
      tier: "personal-best",
      celebrate: true,
      sound: false,
      confetti: false,
    };
  }
  return { tier: "none", celebrate: false, sound: false, confetti: false };
}
