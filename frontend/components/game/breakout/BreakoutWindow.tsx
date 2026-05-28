"use client";
import { useWindows, isWindowActive } from "@/state/window-manager";
import { GameShellWindow } from "@/components/shared/GameShellWindow";
import { SharedMintDialog } from "@/components/shared/SharedMintDialog";
import { useGameSession } from "@/hooks/useGameSession";
import { BreakoutCanvas } from "./BreakoutCanvas";

export function BreakoutWindow() {
  const w = useWindows((s) =>
    s.windows.find((win) => win.type === "game-breakout")
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
  } = useGameSession("breakout");

  if (!w) return null;

  return (
    <GameShellWindow gameId="breakout" score={score}>
      {showMint ? (
        <SharedMintDialog
          gameId="breakout"
          score={finalScore}
          isTopScore={isTopScore}
          riskReport={riskReport}
          onClose={() => close(w.id)}
          onPlayAgain={handlePlayAgain}
        />
      ) : (
        <BreakoutCanvas
          key={resetKey}
          onGameOver={handleGameOver}
          onScoreChange={setScore}
          windowActive={isWindowActive(w, maxZ)}
        />
      )}
    </GameShellWindow>
  );
}
