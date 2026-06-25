import type { PlayerStats } from "./player-stats";

export type LevelInfo = {
  level: number;          // 1+
  title: string;          // "Pro"
  xp: number;             // base + play + streak bonus
  xpIntoLevel: number;    // xp - cumXP(level)
  xpForNextLevel: number; // cumXP(level+1) - cumXP(level), always > 0
  progress: number;       // 0..1
};

/** How total profile XP splits across its three sources (own profile only). */
export type XpBreakdown = { base: number; play: number; streak: number };

export const XP_BASE = 100;
/** XP granted per best-streak day from the daily challenge. */
export const STREAK_XP = 50;

/**
 * Title bands in ascending level order. `levelTitle` and `nextTitleUnlock` both
 * derive from this single source so they can never drift. The level 1/5/10/20/30
 * bands are the original names and must not be renamed; 15 (Ace) and 25 (Master)
 * are intermediate unlocks added for denser progression.
 */
export const TITLE_BANDS: { level: number; title: string }[] = [
  { level: 1, title: "Rookie" },
  { level: 5, title: "Player" },
  { level: 10, title: "Pro" },
  { level: 15, title: "Ace" },
  { level: 20, title: "Veteran" },
  { level: 25, title: "Master" },
  { level: 30, title: "Arcade Legend" },
];

export function cumulativeXpToReach(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return XP_BASE * (l - 1) ** 2;
}

export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  return Math.floor(Math.sqrt(xp / XP_BASE)) + 1;
}

export function levelTitle(level: number): string {
  let title = TITLE_BANDS[0].title;
  for (const band of TITLE_BANDS) {
    if (level >= band.level) title = band.title;
  }
  return title;
}

/** The next title the player will unlock, or null if already at the top band. */
export function nextTitleUnlock(
  level: number,
): { title: string; atLevel: number } | null {
  for (const band of TITLE_BANDS) {
    if (band.level > level) return { title: band.title, atLevel: band.level };
  }
  return null;
}

export function computeLevel(
  stats: PlayerStats,
  opts?: { playXp?: number; bestStreak?: number },
): LevelInfo {
  const base = Math.max(0, stats.totalScore);
  const play = Math.max(0, opts?.playXp ?? 0);
  const streak = Math.max(0, opts?.bestStreak ?? 0) * STREAK_XP;
  const xp = base + play + streak;
  const level = levelForXp(xp);
  const reached = cumulativeXpToReach(level);
  const xpForNextLevel = cumulativeXpToReach(level + 1) - reached;
  const xpIntoLevel = xp - reached;
  return {
    level,
    title: levelTitle(level),
    xp,
    xpIntoLevel,
    xpForNextLevel,
    progress: xpIntoLevel / xpForNextLevel,
  };
}

/**
 * Resolve the level info for a profile view. The connected user's own profile
 * folds in local play XP + daily-streak bonus and returns a breakdown; every
 * other player shows base (on-chain) XP only, with a null breakdown.
 */
export function resolveProfileLevel(args: {
  stats: PlayerStats;
  isOwnProfile: boolean;
  playXp: number;
  bestStreak: number;
}): { info: LevelInfo; breakdown: XpBreakdown | null } {
  const { stats, isOwnProfile, playXp, bestStreak } = args;
  if (!isOwnProfile) {
    return { info: computeLevel(stats), breakdown: null };
  }
  const info = computeLevel(stats, { playXp, bestStreak });
  const breakdown: XpBreakdown = {
    base: Math.max(0, stats.totalScore),
    play: Math.max(0, playXp),
    streak: Math.max(0, bestStreak) * STREAK_XP,
  };
  return { info, breakdown };
}
