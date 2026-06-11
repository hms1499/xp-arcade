"use client";

import { GAMES, type GameId } from "@/lib/game-registry";
import { shortPlayer, type LeaderboardSummary } from "@/lib/leaderboard-showcase";
import { formatScoreValue } from "@/lib/score-format";
import { useWindows } from "@/state/window-manager";

const GAME_IDS = Object.keys(GAMES) as GameId[];

export function LeaderboardTicker({
  summaries,
}: {
  summaries: Record<GameId, LeaderboardSummary>;
}) {
  const open = useWindows((s) => s.open);
  const items = GAME_IDS.map((gameId) => {
    const game = GAMES[gameId];
    const leader = summaries[gameId].leader;
    return leader
      ? `${game.emoji} ${game.label} #1 ${shortPlayer(leader.player)} ${formatScoreValue(gameId, leader.score)}`
      : `${game.emoji} ${game.label} awaiting scores`;
  });

  return (
    <button
      className="taskbar-leaderboard-ticker"
      onClick={() => open("highscore")}
      title="Open High Scores"
      style={{
        height: 22,
        minWidth: 180,
        maxWidth: 360,
        flex: "0 1 360px",
        overflow: "hidden",
        border: "2px inset #dfdfdf",
        background: "#101010",
        color: "#7fff7f",
        padding: "0 6px",
        fontFamily: "monospace",
        fontSize: 10,
        textAlign: "left",
        whiteSpace: "nowrap",
      }}
    >
      <span
        className="leaderboard-ticker"
        style={{
          display: "inline-block",
          paddingLeft: "100%",
          animation: "leaderboardTicker 22s linear infinite",
        }}
      >
        {items.join("  ·  ")}
      </span>
    </button>
  );
}
