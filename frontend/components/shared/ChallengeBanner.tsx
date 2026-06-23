"use client";
import { useEffect } from "react";
import { type GameId, GAMES } from "@/lib/game-registry";
import { shortAddress } from "@/lib/stacks-address";
import { formatScoreValue } from "@/lib/score-format";
import { shouldMarkMet } from "@/lib/challenge-progress";
import type { Challenge } from "@/lib/challenge-link";
import type { ChallengeStatus } from "@/state/challenge";

export function ChallengeBanner({
  challenge, status, gameId, score, sessionBest, onMet,
}: {
  challenge: Challenge | null;
  status: ChallengeStatus | null;
  gameId: GameId;
  score: number;
  sessionBest: number;
  onMet: () => void;
}) {
  useEffect(() => {
    if (shouldMarkMet(status, challenge, gameId, score, sessionBest)) onMet();
  }, [status, challenge, gameId, score, sessionBest, onMet]);

  if (!challenge || challenge.gameId !== gameId) return null;
  if (status !== "accepted" && status !== "met") return null;

  const who = challenge.by ? shortAddress(challenge.by) : "a friend";
  const target = formatScoreValue(gameId, challenge.target);

  return (
    <div
      className="challenge-banner"
      style={{
        padding: "4px 6px", borderBottom: "1px solid #d0d0c8",
        background: status === "met" ? "#e8f5e8" : "#fffbe6",
        color: "#444", fontSize: 10,
        fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
        fontWeight: "bold",
      }}
    >
      {status === "met"
        ? `✅ Challenge crushed! You beat ${target} in ${GAMES[gameId].label}.`
        : `🎯 Beat ${who}'s ${target} — your run ${formatScoreValue(gameId, score)} · session best ${formatScoreValue(gameId, sessionBest)}`}
    </div>
  );
}
