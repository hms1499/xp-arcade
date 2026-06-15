"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { type GameId } from "@/lib/game-registry";
import { getTopTenForGame } from "@/lib/contract-calls";
import { useMintTx } from "@/state/mint-tx";
import { useSessionStats } from "@/state/session-stats";
import { useDailyChallenge } from "@/state/daily-challenge";
import { assessScoreRisk, type ScoreRiskReport } from "@/lib/score-risk";

export function useGameSession(gameId: GameId) {
  const [score, setScore] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [showMint, setShowMint] = useState(false);
  const [isTopScore, setIsTopScore] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [riskReport, setRiskReport] = useState<ScoreRiskReport>(() =>
    assessScoreRisk({ gameId, score: 0, durationMs: 0 }),
  );
  const startedAtRef = useRef(0);

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, [resetKey]);

  const activeMintGameId = useMintTx((s) => s.gameId);
  const activeTxId = useMintTx((s) => s.txId);
  const isMintPending =
    activeMintGameId === gameId && activeTxId !== null;

  const handleGameOver = useCallback(
    async (s: number) => {
      const startedAt = startedAtRef.current || Date.now();
      const durationMs = Date.now() - startedAt;
      setFinalScore(s);
      setShowMint(true);
      setRiskReport(assessScoreRisk({ gameId, score: s, durationMs }));
      useSessionStats.getState().recordResult(gameId, s);
      useDailyChallenge.getState().recordPlay(gameId, s);
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
    startedAtRef.current = Date.now();
    setFinalScore(0);
    setScore(0);
    setShowMint(false);
    setIsTopScore(false);
    setRiskReport(assessScoreRisk({ gameId, score: 0, durationMs: 0 }));
    setResetKey((k) => k + 1);
  }, [gameId]);

  return {
    score,
    setScore,
    finalScore,
    showMint,
    setShowMint,
    isTopScore,
    riskReport,
    resetKey,
    isMintPending,
    handleGameOver,
    handlePlayAgain,
  };
}
