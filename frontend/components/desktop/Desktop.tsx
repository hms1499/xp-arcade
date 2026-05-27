"use client";
import { useEffect, useRef } from "react";
import { DesktopIcon } from "./DesktopIcon";
import { Taskbar } from "./Taskbar";
import { DesktopWallpaper } from "./DesktopWallpaper";
import { useWindows } from "@/state/window-manager";
import { GAMES, type GameId } from "@/lib/game-registry";
import { unlockAudio } from "@/lib/sounds";
import { useLeaderboardShowcase } from "@/hooks/useLeaderboardShowcase";
import { DesktopLeaderboardShowcase } from "./DesktopLeaderboardShowcase";
import {
  findTopTenChange,
  shortPlayer,
  type LeaderboardChange,
} from "@/lib/leaderboard-showcase";
import type { TopEntry } from "@/lib/contract-calls";
import { useToasts } from "@/state/toasts";

const GAME_IDS = Object.keys(GAMES) as GameId[];

function changeBody(change: LeaderboardChange): string {
  if (change.kind === "new-leader") {
    const moved = change.previousRank ? `from #${change.previousRank}` : "from outside top-10";
    return `${shortPlayer(change.player)} moved ${moved} to #1 with ${change.score}.`;
  }
  if (change.kind === "new-entry") {
    return `${shortPlayer(change.player)} entered at #${change.rank} with ${change.score}.`;
  }
  return `${shortPlayer(change.player)} improved from ${change.previousScore} to ${change.score} at #${change.rank}.`;
}

export function Desktop({ children }: { children: React.ReactNode }) {
  const open = useWindows((s) => s.open);
  const leaderboard = useLeaderboardShowcase();
  const previousRowsRef = useRef<Record<GameId, TopEntry[]> | null>(null);

  useEffect(() => {
    if (!leaderboard.lastUpdated) return;
    const previousRows = previousRowsRef.current;
    if (!previousRows) {
      previousRowsRef.current = leaderboard.rowsByGame;
      return;
    }

    for (const gameId of GAME_IDS) {
      const change = findTopTenChange(previousRows[gameId], leaderboard.rowsByGame[gameId]);
      if (!change) continue;
      const game = GAMES[gameId];
      useToasts.getState().push({
        title:
          change.kind === "new-leader"
            ? `New ${game.label} leader`
            : `${game.label} top-10 update`,
        body: changeBody(change),
        type: change.kind === "new-leader" ? "success" : "info",
      });
    }

    previousRowsRef.current = leaderboard.rowsByGame;
  }, [leaderboard.lastUpdated, leaderboard.rowsByGame]);

  return (
    <div
      className="fixed inset-0"
      onMouseDown={unlockAudio}
      onTouchStart={unlockAudio}
      style={{ background: "#00030c" }}
    >
      <DesktopWallpaper />
      <div
        className="desktop-icon-grid absolute top-4 left-4 grid grid-cols-1 gap-4"
        style={{ zIndex: 1 }}
      >
        {Object.values(GAMES).map((game) => (
          <DesktopIcon
            key={game.id}
            label={`${game.label}.exe`}
            emoji={game.emoji}
            onOpen={() => open(`game-${game.id}`)}
          />
        ))}
        <DesktopIcon
          label="High Scores"
          emoji="🏆"
          onOpen={() => open("highscore")}
        />
        <DesktopIcon
          label="Hall of Fame"
          emoji="🎖️"
          onOpen={() => open("hall-of-fame")}
        />
        <DesktopIcon
          label="My NFTs"
          emoji="💾"
          onOpen={() => open("mynfts")}
        />
      </div>
      <DesktopLeaderboardShowcase
        summaries={leaderboard.summaries}
        seasonsByGame={leaderboard.seasonsByGame}
        lastUpdated={leaderboard.lastUpdated}
        error={leaderboard.error}
      />
      {children}
      <Taskbar leaderboardSummaries={leaderboard.summaries} />
    </div>
  );
}
