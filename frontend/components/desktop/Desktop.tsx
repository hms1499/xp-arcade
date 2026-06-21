"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { DesktopIcon } from "./DesktopIcon";
import { Taskbar } from "./Taskbar";
import { DesktopWallpaper } from "./DesktopWallpaper";
import { useWindows } from "@/state/window-manager";
import { GAMES, type GameId } from "@/lib/game-registry";
import { unlockAudio, playBootChimeOnce } from "@/lib/sounds";
import { useLeaderboardShowcase } from "@/hooks/useLeaderboardShowcase";
import { DesktopLeaderboardShowcase } from "./DesktopLeaderboardShowcase";
import {
  findTopTenChange,
  shortPlayer,
  type LeaderboardChange,
} from "@/lib/leaderboard-showcase";
import { formatScoreValue } from "@/lib/score-format";
import type { TopEntry } from "@/lib/contract-calls";
import { computeArcadeChampions } from "@/lib/arcade-champion";
import { useToasts } from "@/state/toasts";
import { WelcomeDialog } from "@/components/dialogs/WelcomeDialog";
import { useWelcome } from "@/state/welcome";
import { hasSeenWelcome, markWelcomeSeen } from "@/lib/welcome";

const GAME_IDS = Object.keys(GAMES) as GameId[];

function changeBody(change: LeaderboardChange, gameId: GameId): string {
  const fmt = (n: number) => formatScoreValue(gameId, n);
  if (change.kind === "new-leader") {
    const moved = change.previousRank ? `from #${change.previousRank}` : "from outside top-10";
    return `${shortPlayer(change.player)} moved ${moved} to #1 with ${fmt(change.score)}.`;
  }
  if (change.kind === "new-entry") {
    return `${shortPlayer(change.player)} entered at #${change.rank} with ${fmt(change.score)}.`;
  }
  return `${shortPlayer(change.player)} improved from ${fmt(change.previousScore)} to ${fmt(change.score)} at #${change.rank}.`;
}

export function Desktop({ children }: { children: React.ReactNode }) {
  const open = useWindows((s) => s.open);

  const handleFirstInteraction = () => {
    unlockAudio();        // resume the AudioContext (no-op once running)
    playBootChimeOnce();  // play the chime at most once this session
  };
  const leaderboard = useLeaderboardShowcase();
  const welcomeOpen = useWelcome((s) => s.isOpen);
  const openWelcome = useWelcome((s) => s.open);
  const closeWelcome = useWelcome((s) => s.close);

  useEffect(() => {
    if (!hasSeenWelcome()) openWelcome();
  }, [openWelcome]);

  const dismissWelcome = () => {
    markWelcomeSeen();
    closeWelcome();
  };

  const previousRowsRef = useRef<Record<GameId, TopEntry[]> | null>(null);
  const [lastGame, setLastGame] = useState<GameId | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem("xp-arcade:last-game");
    return stored && stored in GAMES ? (stored as GameId) : null;
  });

  useEffect(() => {
    const onChange = (event: Event) => {
      const gameId = (event as CustomEvent<string>).detail;
      if (gameId in GAMES) setLastGame(gameId as GameId);
    };
    window.addEventListener("xp-arcade:last-game-change", onChange);
    return () => window.removeEventListener("xp-arcade:last-game-change", onChange);
  }, []);

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
        body: changeBody(change, gameId),
        type: change.kind === "new-leader" ? "success" : "info",
      });
    }

    previousRowsRef.current = leaderboard.rowsByGame;
  }, [leaderboard.lastUpdated, leaderboard.rowsByGame]);

  const champions = useMemo(
    () => computeArcadeChampions(leaderboard.rowsByGame),
    [leaderboard.rowsByGame],
  );
  const prevChampRef = useRef<string | null>(null);
  const [championIsNew, setChampionIsNew] = useState(false);
  useEffect(() => {
    const leader = champions[0]?.player ?? null;
    if (leader && prevChampRef.current && leader !== prevChampRef.current) {
      setChampionIsNew(true);
      const t = setTimeout(() => setChampionIsNew(false), 8000);
      prevChampRef.current = leader;
      return () => clearTimeout(t);
    }
    if (leader) prevChampRef.current = leader;
  }, [champions]);

  return (
    <div
      className="fixed inset-0"
      onMouseDown={handleFirstInteraction}
      onTouchStart={handleFirstInteraction}
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
            badge={
              game.id === (lastGame ?? "snake")
                ? lastGame
                  ? "RESUME"
                  : "START"
                : undefined
            }
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
          label="Arcade Champion"
          emoji="👑"
          onOpen={() => open("arcade-champion")}
        />
        <DesktopIcon
          label="My NFTs"
          emoji="💾"
          onOpen={() => open("mynfts")}
        />
        <DesktopIcon
          label="Internet"
          emoji="🌐"
          onOpen={() => open("browser")}
        />
      </div>
      <QuickPlay
        gameId={lastGame ?? "snake"}
        hasHistory={lastGame !== null}
        cutoff={leaderboard.summaries[lastGame ?? "snake"].cutoff?.score ?? null}
        onOpen={() => open(`game-${lastGame ?? "snake"}`)}
      />
      <DesktopLeaderboardShowcase
        summaries={leaderboard.summaries}
        seasonsByGame={leaderboard.seasonsByGame}
        poolsByGame={leaderboard.poolsByGame}
        lastUpdated={leaderboard.lastUpdated}
        error={leaderboard.error}
        championEntries={champions}
        championIsNew={championIsNew}
      />
      {children}
      {welcomeOpen && (
        <WelcomeDialog
          onPlay={() => {
            dismissWelcome();
            open(`game-${lastGame ?? "snake"}`);
          }}
          onClose={dismissWelcome}
        />
      )}
      <Taskbar leaderboardSummaries={leaderboard.summaries} />
    </div>
  );
}

function QuickPlay({
  gameId,
  hasHistory,
  cutoff,
  onOpen,
}: {
  gameId: GameId;
  hasHistory: boolean;
  cutoff: number | null;
  onOpen: () => void;
}) {
  const game = GAMES[gameId];

  return (
    <section
      className="desktop-quick-play"
      style={{
        position: "absolute",
        top: 16,
        left: 112,
        zIndex: 1,
        width: 250,
        background: "#c0c0c0",
        border: "2px solid",
        borderColor: "#ffffff #808080 #808080 #ffffff",
        boxShadow: "2px 2px 0 #000000",
        fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
      }}
    >
      <div
        style={{
          background: "linear-gradient(90deg, #000080, #1084d0)",
          color: "#ffffff",
          fontWeight: "bold",
          padding: "3px 6px",
        }}
      >
        {hasHistory ? "Continue Playing" : "Quick Start"}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "44px 1fr",
          gap: 8,
          alignItems: "center",
          padding: 8,
        }}
      >
        <span style={{ fontSize: 34, textAlign: "center" }}>{game.emoji}</span>
        <span style={{ display: "grid", gap: 5 }}>
          <b style={{ fontSize: 12 }}>{game.label}</b>
          <span style={{ color: "#555", lineHeight: 1.3 }}>
            {cutoff === null
              ? "Top-10 is open. Any minted score can enter."
              : `Beat ${formatScoreValue(gameId, cutoff)}${
                  gameId === "minesweeper" || gameId === "solitaire" ? "" : " points"
                } to pass the current #10.`}
          </span>
          <button
            type="button"
            className="default"
            onClick={onOpen}
            style={{ justifySelf: "start", fontWeight: "bold" }}
          >
            {hasHistory ? `Play ${game.label}` : "Play Now"}
          </button>
        </span>
      </div>
    </section>
  );
}
