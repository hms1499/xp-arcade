"use client";
import { useEffect, useRef } from "react";
import { GAMES, type GameId } from "@/lib/game-registry";
import { formatScore } from "@/lib/score-format";
import { playSuccess } from "@/lib/sounds";
import { gameOverMilestone } from "@/lib/game-over-milestone";
import type { LeaderboardGoal } from "@/lib/leaderboard-showcase";

const TONE_COLOR: Record<LeaderboardGoal["tone"], string> = {
  success: "#007700",
  warning: "#8a5a00",
  info: "#555555",
};

const CONFETTI = [
  { left: "8%", color: "#ff5050", delay: "0s" },
  { left: "20%", color: "#ffd700", delay: "0.10s" },
  { left: "33%", color: "#33cc66", delay: "0.05s" },
  { left: "46%", color: "#1084d0", delay: "0.15s" },
  { left: "59%", color: "#ff8c00", delay: "0.02s" },
  { left: "72%", color: "#cc66ff", delay: "0.12s" },
  { left: "85%", color: "#ffd700", delay: "0.08s" },
  { left: "92%", color: "#33cc66", delay: "0.18s" },
];

export function GameOverSummary({
  gameId,
  score,
  isTopScore,
  isNewRecord,
  best,
  goal,
}: {
  gameId: GameId;
  score: number;
  isTopScore: boolean;
  isNewRecord: boolean;
  best: number;
  goal: LeaderboardGoal | null;
}) {
  const game = GAMES[gameId];
  const milestone = gameOverMilestone({ isTopScore, isNewRecord });
  const dinged = useRef(false);

  useEffect(() => {
    if (milestone.sound && !dinged.current) {
      dinged.current = true;
      playSuccess();
    }
  }, [milestone.sound]);

  const rankText = goal
    ? goal.rank
      ? `Will rank #${goal.rank} on the board`
      : goal.secondary
    : "Checking the board…";
  const rankColor = goal ? TONE_COLOR[goal.tone] : "#555555";

  return (
    <div className="mb-2" style={{ position: "relative" }}>
      {milestone.confetti && (
        <div className="gameover-confetti" aria-hidden="true">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              style={{ left: c.left, background: c.color, animationDelay: c.delay }}
            />
          ))}
        </div>
      )}

      {milestone.tier === "leaderboard" && (
        <div
          className="gameover-banner mb-2 text-center"
          style={{
            background: "linear-gradient(90deg,#fff4b0,#ffd86b,#fff4b0)",
            border: "1px solid #c79a2e",
            color: "#7a5c00",
            fontWeight: "bold",
            padding: "4px 6px",
            fontSize: 12,
            letterSpacing: 0.5,
          }}
        >
          🏆 NEW HIGH SCORE — top-10 on this season&apos;s leaderboard!
        </div>
      )}

      <div className="text-xs" style={{ color: "#555555" }}>
        GAME OVER
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 24, fontWeight: "bold", lineHeight: 1.1 }}>
          {formatScore(gameId, score)}
        </span>
        <span aria-hidden="true" style={{ fontSize: 20 }}>
          {game.emoji}
        </span>
      </div>

      <div
        style={{
          marginTop: 2,
          fontWeight: goal?.tone === "success" ? "bold" : "normal",
          color: rankColor,
        }}
      >
        ▸ {rankText}
      </div>

      {isNewRecord ? (
        <div
          className={milestone.tier === "personal-best" ? "gameover-banner" : undefined}
          style={{ marginTop: 2, color: "#007700", fontWeight: "bold", fontSize: 12 }}
        >
          New personal best
        </div>
      ) : (
        <div className="text-xs" style={{ marginTop: 2, color: "#888888" }}>
          Personal best: <b>{formatScore(gameId, best)}</b>
        </div>
      )}
    </div>
  );
}
