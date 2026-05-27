import type { GameId } from "./game-registry";

export type ScoreRiskLevel = "low" | "medium" | "high";

export type ScoreRiskInput = {
  gameId: GameId;
  score: number;
  durationMs: number | null;
};

export type ScoreRiskReport = {
  level: ScoreRiskLevel;
  reasons: string[];
  durationSeconds: number | null;
};

type RiskProfile = {
  practicalHigh: number;
  extreme: number;
  maxPerMinute: number;
  fastScore: number;
  minDurationMs: number;
};

const PROFILES: Record<GameId, RiskProfile> = {
  snake: {
    practicalHigh: 400,
    extreme: 1_000,
    maxPerMinute: 90,
    fastScore: 40,
    minDurationMs: 15_000,
  },
  tetris: {
    practicalHigh: 500,
    extreme: 1_200,
    maxPerMinute: 300,
    fastScore: 120,
    minDurationMs: 20_000,
  },
  pacman: {
    practicalHigh: 500,
    extreme: 1_200,
    maxPerMinute: 260,
    fastScore: 120,
    minDurationMs: 20_000,
  },
};

export function assessScoreRisk(input: ScoreRiskInput): ScoreRiskReport {
  const profile = PROFILES[input.gameId];
  const score = Math.max(0, Math.floor(input.score));
  const reasons: string[] = [];
  let level: ScoreRiskLevel = "low";

  if (score >= profile.extreme) {
    level = "high";
    reasons.push(`Score ${score} is above the normal ${input.gameId} range.`);
  } else if (score >= profile.practicalHigh) {
    level = "medium";
    reasons.push(`Score ${score} is unusually high for ${input.gameId}.`);
  }

  const durationSeconds =
    input.durationMs == null ? null : Math.max(0, Math.round(input.durationMs / 1000));

  if (input.durationMs != null && score > 0) {
    if (input.durationMs < profile.minDurationMs && score >= profile.fastScore) {
      level = "high";
      reasons.push(
        `Score ${score} was reached in ${durationSeconds}s, which is too fast for normal play.`,
      );
    }

    const minutes = Math.max(input.durationMs / 60_000, 1 / 60);
    const scorePerMinute = score / minutes;
    if (scorePerMinute > profile.maxPerMinute) {
      level = level === "high" ? "high" : "medium";
      reasons.push(
        `Score rate ${Math.round(scorePerMinute)}/min is above the expected ${input.gameId} pace.`,
      );
    }
  }

  return {
    level,
    reasons,
    durationSeconds,
  };
}

export function scoreRiskLabel(report: ScoreRiskReport): string {
  if (report.level === "high") return "High risk";
  if (report.level === "medium") return "Review";
  return "Normal";
}

export function scoreRiskColor(level: ScoreRiskLevel): string {
  if (level === "high") return "#aa0000";
  if (level === "medium") return "#8a5a00";
  return "#007700";
}
