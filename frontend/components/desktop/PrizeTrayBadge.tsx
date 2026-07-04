"use client";
import type { CSSProperties } from "react";
import { useUnclaimedPrizes } from "@/state/unclaimed-prizes";
import { useWindows } from "@/state/window-manager";

const sunken: CSSProperties = {
  border: "1px solid",
  borderColor: "#808080 #ffffff #ffffff #808080",
  padding: "0 6px",
  height: 20,
  display: "flex",
  alignItems: "center",
  fontSize: 11,
  fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
  gap: 4,
  background: "#c0c0c0",
};

/** Persistent tray reminder: visible while the connected wallet has open,
 *  unclaimed prize money; click lands on the claim tab. */
export function PrizeTrayBadge() {
  const totalUstx = useUnclaimedPrizes((s) => s.totalUstx);
  const topGame = useUnclaimedPrizes((s) => s.topGame);
  const open = useWindows((s) => s.open);
  if (totalUstx <= 0 || !topGame) return null;
  const stx = (totalUstx / 1_000_000).toFixed(2);
  return (
    <button
      type="button"
      className="tray-prize-badge"
      title={`Unclaimed prizes: ${stx} STX`}
      aria-label={`Unclaimed prizes: ${stx} STX — open High Scores to claim`}
      onClick={() => open("highscore", { initialTab: topGame })}
      style={{ ...sunken, border: "1px solid", cursor: "default", color: "#7a5c00" }}
    >
      <span aria-hidden="true">💰</span>
      <span style={{ fontWeight: "bold" }}>{stx}</span>
    </button>
  );
}
