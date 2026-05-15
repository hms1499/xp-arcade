"use client";
import { useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { Window } from "./Window";
import { GameCanvas } from "@/components/game/GameCanvas";
import { MintDialog } from "@/components/dialogs/MintDialog";

export function GameWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "game"));
  const address = useWallet((s) => s.address);
  const connect = useWallet((s) => s.connect);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [resetKey, setResetKey] = useState(0);

  if (!w) return null;

  return (
    <Window id={w.id} title="Snake — Untitled">
      <div className="p-2">
        {finalScore === null && !address && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
              padding: "4px 8px",
              background: "#ffffe1",
              border: "1px solid #808080",
              fontSize: 11,
              fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
            }}
          >
            <span style={{ flex: 1 }}>
              💡 Playing offline — connect your wallet to save your score on-chain
            </span>
            <button onClick={connect} style={{ fontSize: 11 }}>
              Connect Wallet
            </button>
          </div>
        )}
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
