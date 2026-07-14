"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { formatScoreValue } from "@/lib/score-format";
import { ChallengeBanner } from "@/components/shared/ChallengeBanner";
import { useChallenge } from "@/state/challenge";
import { useToasts } from "@/state/toasts";
import { playSuccess } from "@/lib/sounds";
import { computeGameScale } from "@/lib/game-scale";

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
  const challenge = useChallenge((s) => s.active);
  const challengeStatus = useChallenge((s) => s.status);
  const markMet = useChallenge((s) => s.markMet);
  const pushToast = useToasts((s) => s.push);

  const handleChallengeMet = useCallback(() => {
    markMet();
    playSuccess();
    pushToast({
      title: "Challenge crushed!",
      body: `You beat the target in ${game.label}.`,
      type: "success",
    });
  }, [markMet, pushToast, game]);
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
              .then((value) => value?.score ?? null)
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

  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const viewport = viewportRef.current;
    const stage = stageRef.current;
    if (!viewport || !stage) return;

    // The viewport is the space the window's geometry leaves for the field.
    const viewportObserver = new ResizeObserver(() => {
      setAvail({ w: viewport.clientWidth, h: viewport.clientHeight });
    });
    // offsetWidth/offsetHeight ignore the stage's own transform, so this stays
    // the game's natural size no matter what scale is applied.
    const stageObserver = new ResizeObserver(() => {
      setNatural({ w: stage.offsetWidth, h: stage.offsetHeight });
    });

    viewportObserver.observe(viewport);
    stageObserver.observe(stage);
    setAvail({ w: viewport.clientWidth, h: viewport.clientHeight });
    setNatural({ w: stage.offsetWidth, h: stage.offsetHeight });

    return () => {
      viewportObserver.disconnect();
      stageObserver.disconnect();
    };
  }, []);

  const scale = computeGameScale({
    availW: avail.w,
    availH: avail.h,
    naturalW: natural.w,
    naturalH: natural.h,
  });

  if (!w) return null;

  const goal = leaderboardGoal({
    rows: goalState.rows,
    playerBest: goalState.playerBest,
    gameId,
  });

  return (
    <Window id={w.id} title={`${game.emoji} ${game.label}`}>
      <div
        className="game-shell-content"
        style={{ display: "flex", flexDirection: "column", height: "100%" }}
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
                Session: <b>{formatScoreValue(gameId, sessionStats.bestScore)}</b> best · {sessionStats.runs} run
                {sessionStats.runs === 1 ? "" : "s"}
              </span>
            )}
            <span>
              Score: <b>{formatScoreValue(gameId, score)}</b>
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
                Your best <b>{formatScoreValue(gameId, goalState.playerBest)}</b>
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
        <ChallengeBanner
          challenge={challenge}
          status={challengeStatus}
          gameId={gameId}
          score={score}
          sessionBest={sessionStats.bestScore}
          onMet={handleChallengeMet}
        />
        <div
          ref={viewportRef}
          className="game-shell-stage"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            ref={stageRef}
            className="game-shell-stage-inner p-2"
            style={{
              flex: "none",
              transform: `scale(${scale})`,
              transformOrigin: "center",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </Window>
  );
}
