import { GAME_IDS } from "./game-registry";
import type { PlayerStats } from "./player-stats";

export type Achievement = {
  id: string;
  label: string;
  icon: string;
  description: string;
  target: number;
  progress: (s: PlayerStats) => number; // raw, uncapped current value
};

export type EvaluatedAchievement = Achievement & {
  earned: boolean;
  current: number; // min(progress, target) — capped for display
};

const gamesMinted = (s: PlayerStats): number =>
  GAME_IDS.reduce((n, id) => n + (s.byGame[id].totalMints > 0 ? 1 : 0), 0);

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first-mint",
    label: "First Mint",
    icon: "🥚",
    description: "Mint your first score NFT",
    target: 1,
    progress: (s) => s.totalMints,
  },
  {
    id: "getting-started",
    label: "Getting Started",
    icon: "🎮",
    description: "Mint 10 score NFTs",
    target: 10,
    progress: (s) => s.totalMints,
  },
  {
    id: "dedicated",
    label: "Dedicated",
    icon: "🏅",
    description: "Mint 50 score NFTs",
    target: 50,
    progress: (s) => s.totalMints,
  },
  {
    id: "centurion",
    label: "Centurion",
    icon: "💯",
    description: "Mint 100 score NFTs",
    target: 100,
    progress: (s) => s.totalMints,
  },
  {
    id: "arcade-complete",
    label: "Arcade Complete",
    icon: "🕹️",
    description: "Mint a score in every game",
    target: GAME_IDS.length,
    progress: gamesMinted,
  },
  {
    id: "seasoned",
    label: "Seasoned",
    icon: "📅",
    description: "Play across 3 seasons",
    target: 3,
    progress: (s) => s.seasonsPlayed,
  },
  {
    id: "veteran",
    label: "Veteran",
    icon: "👑",
    description: "Play across 5 seasons",
    target: 5,
    progress: (s) => s.seasonsPlayed,
  },
  {
    id: "streak-7",
    label: "Week Warrior",
    icon: "🔥",
    description: "Reach a 7-day challenge streak",
    target: 7,
    progress: () => 0,
  },
  {
    id: "streak-30",
    label: "Monthly Master",
    icon: "📆",
    description: "Reach a 30-day challenge streak",
    target: 30,
    progress: () => 0,
  },
  {
    id: "streak-100",
    label: "Century Streak",
    icon: "💎",
    description: "Reach a 100-day challenge streak",
    target: 100,
    progress: () => 0,
  },
];

const STREAK_IDS = new Set(["streak-7", "streak-30", "streak-100"]);

export function evaluateAchievements(
  s: PlayerStats,
  extra?: { bestStreak?: number },
): EvaluatedAchievement[] {
  const bestStreak = extra?.bestStreak ?? 0;
  return ACHIEVEMENTS.map((a) => {
    const raw = STREAK_IDS.has(a.id) ? bestStreak : a.progress(s);
    return { ...a, earned: raw >= a.target, current: Math.min(raw, a.target) };
  });
}

export function earnedCount(list: EvaluatedAchievement[]): number {
  return list.filter((a) => a.earned).length;
}
