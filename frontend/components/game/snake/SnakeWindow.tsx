"use client";
import { useWindows, isWindowActive } from "@/state/window-manager";
import { GameShellWindow } from "@/components/shared/GameShellWindow";
import { SharedMintDialog } from "@/components/shared/SharedMintDialog";
import { GameCanvas } from "@/components/game/GameCanvas";
import { useGameSession } from "@/hooks/useGameSession";

export function SnakeWindow() {
  const w = useWindows((s) =>
    s.windows.find((win) => win.type === "game-snake")
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
    finalScore,
    showMint,
    isTopScore,
    resetKey,
    handleGameOver,
    handlePlayAgain,
  } = useGameSession("snake");

  if (!w) return null;

  return (
    <GameShellWindow gameId="snake" score={score}>
      {showMint ? (
        <SharedMintDialog
          gameId="snake"
          score={finalScore}
          onClose={() => close(w.id)}
          onPlayAgain={handlePlayAgain}
        />
      ) : (
        <GameCanvas
          key={resetKey}
          onGameOver={handleGameOver}
          isTopScore={isTopScore}
          windowActive={isWindowActive(w, maxZ)}
        />
      )}
    </GameShellWindow>
  );
}
