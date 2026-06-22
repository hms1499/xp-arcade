"use client";

import { useWindows } from "@/state/window-manager";
import {
  formatCountdown,
  isCountdownUrgent,
  type Countdown,
} from "@/lib/season-countdown";
import { stacks } from "@/lib/stacks";

export function PrizePoolHero({
  totalUstx,
  gameCount,
  countdown,
}: {
  totalUstx: number | null;
  gameCount: number;
  countdown: Countdown;
}) {
  const open = useWindows((s) => s.open);
  const urgent = isCountdownUrgent(countdown);
  const countdownText = formatCountdown(countdown);

  return (
    <section
      style={{
        width: 300,
        background: "#c0c0c0",
        border: "2px solid",
        borderColor: "#ffffff #808080 #808080 #ffffff",
        boxShadow: "2px 2px 0 #000000",
        fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
        fontSize: 11,
      }}
    >
      <div
        style={{
          background: "linear-gradient(90deg, #000080, #1084d0)",
          color: "#ffffff",
          fontWeight: "bold",
          padding: "3px 6px",
        }}
      >
        <span aria-hidden="true">💰</span> Prize Pool (this season)
      </div>
      <button
        type="button"
        aria-label="Open High Scores"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => open("highscore")}
        style={{
          width: "100%",
          display: "grid",
          gap: 3,
          padding: "10px 8px",
          textAlign: "center",
        }}
        title="Open High Scores"
      >
        <span style={{ fontSize: 26, fontWeight: "bold", color: "#000080" }}>
          {totalUstx === null
            ? "Loading…"
            : `${(totalUstx / 1_000_000).toFixed(2)} STX`}
        </span>
        <span style={{ color: "#555" }}>up for grabs across {gameCount} games</span>
        {countdownText && (
          <span
            style={{
              fontFamily: "monospace",
              fontWeight: urgent ? "bold" : "normal",
              color: urgent ? "#cc0000" : "#000080",
            }}
          >
            <span aria-hidden="true">⏳</span>{" "}
            {countdown.state === "live" ? `ends in ${countdownText}` : countdownText}
          </span>
        )}
      </button>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          borderTop: "1px solid #808080",
          padding: "3px 6px",
          fontSize: 9,
          color: "#006400",
        }}
      >
        <span title="Mint fees are held by the contract, not by us">
          ✅ Held on-chain
        </span>
        <span style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => open("how-it-works")}
            style={{ minWidth: 0, minHeight: 0, padding: "0 5px", fontSize: 9, color: "#000080" }}
          >
            How it works
          </button>
          <a
            href={`https://explorer.hiro.so/address/${stacks.contractAddress}.${stacks.contractName}?chain=${stacks.networkName}`}
            target="_blank"
            rel="noreferrer"
            onMouseDown={(e) => e.stopPropagation()}
            style={{ color: "#000080" }}
          >
            Verify ↗
          </a>
        </span>
      </div>
    </section>
  );
}
