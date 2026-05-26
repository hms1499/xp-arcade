"use client";
import { useState, useCallback } from "react";
import { type GameId } from "@/lib/game-registry";
import { getTopTenForGame } from "@/lib/contract-calls";
import { useMintTx } from "@/state/mint-tx";
import { useSessionStats } from "@/state/session-stats";

export function useGameSession(gameId: GameId) {
  const [score, setScore] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [showMint, setShowMint] = useState(false);
  const [isTopScore, setIsTopScore] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const activeMintGameId = useMintTx((s) => s.gameId);
  const activeTxId = useMintTx((s) => s.txId);
  const isMintPending =
    activeMintGameId === gameId && activeTxId !== null;

  const handleGameOver = useCallback(
    async (s: number) => {
      setFinalScore(s);
      setShowMint(true);
      useSessionStats.getState().recordResult(gameId, s);
      try {
        const top = await getTopTenForGame(gameId);
        const min =
          top.length < 10 ? -1 : Math.min(...top.map((e) => e.score));
        setIsTopScore(s > min);
      } catch {
        setIsTopScore(false);
      }
    },
    [gameId],
  );

  const handlePlayAgain = useCallback(() => {
    setFinalScore(0);
    setScore(0);
    setShowMint(false);
    setIsTopScore(false);
    setResetKey((k) => k + 1);
  }, []);

  return {
    score,
    setScore,
    finalScore,
    showMint,
    setShowMint,
    isTopScore,
    resetKey,
    isMintPending,
    handleGameOver,
    handlePlayAgain,
  };
}
