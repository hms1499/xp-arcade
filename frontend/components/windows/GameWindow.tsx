"use client";
import { useState, useCallback } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { Window } from "./Window";
import { GameCanvas } from "@/components/game/GameCanvas";
import { MintDialog } from "@/components/dialogs/MintDialog";
import { getTopTen } from "@/lib/contract-calls";

export function GameWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "game"));
  const address = useWallet((s) => s.address);
  const connect = useWallet((s) => s.connect);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [isTopScore, setIsTopScore] = useState(false);

  const handleGameOver = useCallback(async (score: number) => {
    setFinalScore(score);
    try {
      const top = await getTopTen();
      const min = top.length < 10
        ? -1
        : Math.min(...top.map((e) => e.score));
      setIsTopScore(score > min);
    } catch {
      setIsTopScore(false);
    }
  }, []);

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
          <GameCanvas key={resetKey} onGameOver={handleGameOver} isTopScore={isTopScore} />
        ) : (
          <MintDialog
            score={finalScore}
            onClose={() => setFinalScore(null)}
            onPlayAgain={() => {
              setFinalScore(null);
              setIsTopScore(false);
              setResetKey((k) => k + 1);
            }}
          />
        )}
      </div>
    </Window>
  );
}
