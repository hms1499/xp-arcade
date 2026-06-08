"use client";
import { useEffect, useState } from "react";
import { type GameId, GAMES } from "@/lib/game-registry";
import { useWindows } from "@/state/window-manager";
import { useSessionStats } from "@/state/session-stats";
import { Window } from "@/components/windows/Window";
import { useWallet } from "@/state/wallet";
import {
  getBestScoreForGame,
  getCurrentSeasonForGame,
  getPrizePoolBalanceForGame,
  getTopTenForGame,
  type TopEntry,
} from "@/lib/contract-calls";
import { leaderboardGoal } from "@/lib/leaderboard-showcase";

type GoalState = {
  rows: TopEntry[];
  season: number | null;
  poolUstx: number | null;
  playerBest: number | null;
  loading: boolean;
};

export function GameShellWindow({
  gameId,
  score,
  children,
}: {
  gameId: GameId;
  score: number;
  children: React.ReactNode;
}) {
  const game = GAMES[gameId];
  const w = useWindows((s) =>
    s.windows.find((win) => win.type === `game-${gameId}`)
  );
  const openWindow = useWindows((s) => s.open);
  const sessionStats = useSessionStats((s) => s.byGame[gameId]);
  const address = useWallet((s) => s.address);
  const [goalState, setGoalState] = useState<GoalState>({
    rows: [],
    season: null,
    poolUstx: null,
    playerBest: null,
    loading: true,
  });

  useEffect(() => {
    localStorage.setItem("xp-arcade:last-game", gameId);
    window.dispatchEvent(
      new CustomEvent("xp-arcade:last-game-change", { detail: gameId }),
    );
  }, [gameId]);

  useEffect(() => {
    if (!w) return;
    let cancelled = false;

    async function loadGoal() {
      const [rows, season, poolUstx, best] = await Promise.all([
        getTopTenForGame(gameId).catch(() => [] as TopEntry[]),
        getCurrentSeasonForGame(gameId).catch(() => null),
        getPrizePoolBalanceForGame(gameId).catch(() => null),
        address
          ? getBestScoreForGame(gameId, address)
              .then((value) => value?.score ?? 0)
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      if (!cancelled) {
        setGoalState({
          rows,
          season,
          poolUstx,
          playerBest: best,
          loading: false,
        });
      }
    }

    void loadGoal();
    const intervalId = window.setInterval(() => {
      void loadGoal();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [w, gameId, address]);

  if (!w) return null;

  const goal = leaderboardGoal({
    rows: goalState.rows,
    playerBest: goalState.playerBest,
  });

  return (
    <Window id={w.id} title={`${game.emoji} ${game.label}`}>
      <div
        className="game-shell-content"
        style={{ display: "flex", flexDirection: "column" }}
      >
        <div
          className="game-shell-toolbar"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "2px 6px",
            borderBottom: "1px solid #ccc",
            fontSize: 11,
            fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
          }}
        >
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                openWindow("highscore", { initialTab: gameId });
              }}
            >
              🏆 High Scores
            </button>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                openWindow("mynfts");
              }}
            >
              💾 My NFTs
            </button>
          </div>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {sessionStats.runs > 0 && (
              <span style={{ color: "#555" }}>
                Session: <b>{sessionStats.bestScore}</b> best · {sessionStats.runs} run
                {sessionStats.runs === 1 ? "" : "s"}
              </span>
            )}
            <span>
              Score: <b>{score}</b>
            </span>
          </span>
        </div>
        <div
          className="game-goal-row"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 6,
            alignItems: "center",
            padding: "4px 6px",
            borderBottom: "1px solid #d0d0c8",
            background: "#f5f5f0",
            color: "#444",
            fontSize: 10,
            fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px" }}>
            <span>
              Season <b>{goalState.season ?? "..."}</b>
            </span>
            <span style={{ color: "#006400" }}>
              Pool{" "}
              <b>
                {goalState.poolUstx === null
                  ? "..."
                  : `${(goalState.poolUstx / 1_000_000).toFixed(2)} STX`}
              </b>
            </span>
            <span
              style={{
                color:
                  goal.tone === "success"
                    ? "#007700"
                    : goal.tone === "warning"
                    ? "#8a5a00"
                    : "#000080",
                fontWeight: "bold",
              }}
            >
              {goalState.loading ? "Loading target..." : goal.primary}
            </span>
            {address && goalState.playerBest !== null && (
              <span>
                Your best <b>{goalState.playerBest}</b>
              </span>
            )}
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              openWindow("highscore", { initialTab: gameId });
            }}
            style={{ minWidth: 74, fontSize: 10, padding: "0 6px" }}
          >
            Details
          </button>
        </div>
        <div className="game-shell-stage p-2">{children}</div>
      </div>
    </Window>
  );
}
