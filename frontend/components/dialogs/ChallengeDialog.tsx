"use client";
import { type GameId, GAMES } from "@/lib/game-registry";
import { shortAddress } from "@/lib/stacks-address";
import { formatScoreValue } from "@/lib/score-format";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { Challenge } from "@/lib/challenge-link";

export function ChallengeDialog({
  challenge, onAccept, onDecline,
}: {
  challenge: Challenge;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const ref = useFocusTrap<HTMLDivElement>(onDecline);
  const who = challenge.by ? shortAddress(challenge.by) : "A friend";
  const target = formatScoreValue(challenge.gameId as GameId, challenge.target);
  const game = GAMES[challenge.gameId]?.label ?? challenge.gameId;

  return (
    <div
      ref={ref} tabIndex={-1} className="window" role="dialog" aria-modal="true"
      aria-label="Challenge invitation"
      style={{ position: "fixed", top: "30%", left: "50%", transform: "translateX(-50%)", width: 320, zIndex: 1000 }}
    >
      <div className="title-bar">
        <div className="title-bar-text">🎯 You&apos;ve been challenged</div>
      </div>
      <div className="window-body" style={{ fontSize: 12 }}>
        <p style={{ marginTop: 0 }}>
          <b>{who}</b> challenges you to beat <b>{target}</b> in <b>{game}</b>.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
          <button type="button" onClick={onDecline}>Maybe later</button>
          <button type="button" onClick={onAccept}>Accept &amp; Play</button>
        </div>
      </div>
    </div>
  );
}
