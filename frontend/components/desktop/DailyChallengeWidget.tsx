"use client";
import { useEffect } from "react";
import { useWindows } from "@/state/window-manager";
import { useDailyChallenge } from "@/state/daily-challenge";
import { GAMES } from "@/lib/game-registry";
import { dailyChallenge, todayKey, viewStreak } from "@/lib/daily-challenge";
import { formatScoreValue } from "@/lib/score-format";

export function DailyChallengeWidget() {
  const open = useWindows((s) => s.open);
  const daily = useDailyChallenge();
  const hydrate = useDailyChallenge((s) => s.hydrate);

  // Load persisted streak after mount (avoids SSR hydration mismatch).
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const day = todayKey();
  const { gameId, target } = dailyChallenge(day);
  const game = GAMES[gameId];
  const { currentStreak, bestStreak, completedToday } = viewStreak(daily, day);

  const targetLabel =
    gameId === "minesweeper"
      ? `Clear in ≤ ${formatScoreValue(gameId, target)}`
      : `Reach ${formatScoreValue(gameId, target)}`;

  return (
    <section
      style={{
        background: "#c0c0c0",
        border: "2px solid",
        borderColor: "#fff #7b7b7b #7b7b7b #fff",
        padding: 8,
        width: 300,
        fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
        fontSize: 11,
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: 4 }}>
        ⭐ Today&apos;s Challenge
      </div>
      <div style={{ marginBottom: 2 }}>
        {game.emoji} {game.label}
      </div>
      <div style={{ color: "#000080", marginBottom: 4 }}>{targetLabel}</div>
      <div style={{ marginBottom: 6 }}>
        {completedToday ? (
          <span style={{ color: "#007700", fontWeight: "bold" }}>✓ Completed today</span>
        ) : (
          <span style={{ color: "#777" }}>⬜ Not done yet</span>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span>🔥 Streak: <b>{currentStreak}</b></span>
        <span style={{ color: "#777" }}>Best: {bestStreak}</span>
      </div>
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => open(`game-${gameId}`)}
        style={{ width: "100%", height: 22 }}
      >
        Play {game.label}
      </button>
    </section>
  );
}
