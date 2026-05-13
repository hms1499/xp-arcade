"use client";
import { useEffect } from "react";
import confetti from "canvas-confetti";

const TIER = (rank: number) => {
  if (rank === 1) return { emoji: "🏆", label: "Gold Trophy" };
  if (rank === 2) return { emoji: "🥈", label: "Silver Trophy" };
  if (rank === 3) return { emoji: "🥉", label: "Bronze Trophy" };
  return { emoji: "🎖️", label: "Top 10 Trophy" };
};

export function TrophyDialog({
  rank,
  onClose,
}: {
  rank: number;
  onClose: () => void;
}) {
  useEffect(() => {
    confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } });
  }, []);

  const t = TIER(rank);

  return (
    <div
      className="window"
      style={{
        position: "fixed",
        inset: "30% auto auto 50%",
        transform: "translateX(-50%)",
        width: 320,
        zIndex: 1000,
      }}
    >
      <div className="title-bar">
        <div className="title-bar-text">Congratulations!</div>
        <div className="title-bar-controls">
          <button aria-label="Close" onClick={onClose} />
        </div>
      </div>
      <div className="window-body text-center p-4">
        <div className="text-6xl mb-2">{t.emoji}</div>
        <p className="mb-2">
          You earned the <b>{t.label}</b>
        </p>
        <p className="text-xs mb-3">Rank #{rank}</p>
        <button onClick={onClose}>OK</button>
      </div>
    </div>
  );
}
