import type { PlayerStats } from "./player-stats";

export type LevelInfo = {
  level: number;          // 1+
  title: string;          // "Pro"
  xp: number;             // = stats.totalScore
  xpIntoLevel: number;    // xp - cumXP(level)
  xpForNextLevel: number; // cumXP(level+1) - cumXP(level), always > 0
  progress: number;       // 0..1
};

export const XP_BASE = 100;

export function cumulativeXpToReach(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return XP_BASE * (l - 1) ** 2;
}

export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  return Math.floor(Math.sqrt(xp / XP_BASE)) + 1;
}

export function levelTitle(level: number): string {
  if (level >= 30) return "Arcade Legend";
  if (level >= 20) return "Veteran";
  if (level >= 10) return "Pro";
  if (level >= 5) return "Player";
  return "Rookie";
}

export function computeLevel(stats: PlayerStats): LevelInfo {
  const xp = Math.max(0, stats.totalScore);
  const level = levelForXp(xp);
  const base = cumulativeXpToReach(level);
  const xpForNextLevel = cumulativeXpToReach(level + 1) - base; // = XP_BASE*(2*level-1) > 0
  const xpIntoLevel = xp - base;
  return {
    level,
    title: levelTitle(level),
    xp,
    xpIntoLevel,
    xpForNextLevel,
    progress: xpIntoLevel / xpForNextLevel,
  };
}
