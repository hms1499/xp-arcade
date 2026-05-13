"use client";
import { useState } from "react";
import { useWindows } from "@/state/window-manager";
import { Window } from "./Window";
import { GameCanvas } from "@/components/game/GameCanvas";
import { MintDialog } from "@/components/dialogs/MintDialog";

export function GameWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "game"));
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [resetKey, setResetKey] = useState(0);

  if (!w) return null;

  return (
    <Window id={w.id} title="Snake — Untitled">
      <div className="p-2">
        {finalScore === null ? (
          <GameCanvas key={resetKey} onGameOver={setFinalScore} />
        ) : (
          <MintDialog
            score={finalScore}
            onClose={() => setFinalScore(null)}
            onPlayAgain={() => {
              setFinalScore(null);
              setResetKey((k) => k + 1);
            }}
          />
        )}
      </div>
    </Window>
  );
}
