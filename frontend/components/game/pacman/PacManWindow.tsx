"use client";
import { useWindows, isWindowActive } from "@/state/window-manager";
import { GameShellWindow } from "@/components/shared/GameShellWindow";
import { SharedMintDialog } from "@/components/shared/SharedMintDialog";
import { PacManCanvas } from "./PacManCanvas";
import { useGameSession } from "@/hooks/useGameSession";

export function PacManWindow() {
  const w = useWindows((s) =>
    s.windows.find((win) => win.type === "game-pacman")
  );
  const maxZ = useWindows((s) =>
    Math.max(
      ...s.windows.filter((win) => !win.minimized).map((win) => win.z),
      0,
    )
  );
  const close = useWindows((s) => s.close);
  const {
    score,
    setScore,
    finalScore,
    showMint,
    isTopScore,
    riskReport,
    resetKey,
    handleGameOver,
    handlePlayAgain,
  } = useGameSession("pacman");

  if (!w) return null;

  return (
    <GameShellWindow gameId="pacman" score={score} unscaled={showMint}>
      {showMint ? (
        <SharedMintDialog
          gameId="pacman"
          score={finalScore}
          isTopScore={isTopScore}
          riskReport={riskReport}
          onClose={() => close(w.id)}
          onPlayAgain={handlePlayAgain}
        />
      ) : (
        <PacManCanvas
          key={resetKey}
          onGameOver={handleGameOver}
          onScoreChange={setScore}
          windowActive={isWindowActive(w, maxZ)}
        />
      )}
    </GameShellWindow>
  );
}
