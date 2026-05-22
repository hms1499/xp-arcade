"use client";
import { useWindows, isWindowActive } from "@/state/window-manager";
import { GameShellWindow } from "@/components/shared/GameShellWindow";
import { SharedMintDialog } from "@/components/shared/SharedMintDialog";
import { TetrisCanvas } from "./TetrisCanvas";
import { useGameSession } from "@/hooks/useGameSession";

export function TetrisWindow() {
  const w = useWindows((s) =>
    s.windows.find((win) => win.type === "game-tetris")
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
    resetKey,
    handleGameOver,
    handlePlayAgain,
  } = useGameSession("tetris");

  if (!w) return null;

  return (
    <GameShellWindow gameId="tetris" score={score}>
      {showMint ? (
        <SharedMintDialog
          gameId="tetris"
          score={finalScore}
          isTopScore={isTopScore}
          onClose={() => close(w.id)}
          onPlayAgain={handlePlayAgain}
        />
      ) : (
        <TetrisCanvas
          key={resetKey}
          onGameOver={handleGameOver}
          onScoreChange={setScore}
          windowActive={isWindowActive(w, maxZ)}
        />
      )}
    </GameShellWindow>
  );
}
