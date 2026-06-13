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
];

export function evaluateAchievements(s: PlayerStats): EvaluatedAchievement[] {
  return ACHIEVEMENTS.map((a) => {
    const raw = a.progress(s);
    return { ...a, earned: raw >= a.target, current: Math.min(raw, a.target) };
  });
}

export function earnedCount(list: EvaluatedAchievement[]): number {
  return list.filter((a) => a.earned).length;
}
