"use client";
import { useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { SystemTray } from "./SystemTray";
import { StartMenu } from "./StartMenu";
import { LeaderboardTicker } from "./LeaderboardTicker";
import type { GameId } from "@/lib/game-registry";
import type { LeaderboardSummary } from "@/lib/leaderboard-showcase";

const TYPE_LABEL: Record<string, string> = {
  game: "Snake",
  leaderboard: "High Scores",
  "my-nfts": "My NFTs",
  "season-admin": "Season Admin",
  "player-profile": "Player Profile",
};

function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-3)}`;
}

function Win95Flag() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      style={{ marginRight: 4, flexShrink: 0 }}
      aria-hidden="true"
    >
      <rect x="0" y="0" width="7" height="7" fill="#FF0000" />
      <rect x="9" y="0" width="7" height="7" fill="#00AA00" />
      <rect x="0" y="9" width="7" height="7" fill="#0000AA" />
      <rect x="9" y="9" width="7" height="7" fill="#FFAA00" />
    </svg>
  );
}

export function Taskbar({
  leaderboardSummaries,
}: {
  leaderboardSummaries: Record<GameId, LeaderboardSummary>;
}) {
  const [open, setOpen] = useState(false);
  const windows = useWindows((s) => s.windows);
  const focus = useWindows((s) => s.focus);
  const walletAddress = useWallet((s) => s.address);

  return (
    <div
      className="xp-taskbar"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 28,
        background: "#c0c0c0",
        borderTop: "2px solid #ffffff",
        display: "flex",
        alignItems: "center",
        zIndex: 40,
        padding: "0 2px",
        gap: 2,
      }}
    >
      <button
        style={{
          display: "flex",
          alignItems: "center",
          fontWeight: "bold",
          height: 22,
          padding: "0 8px",
          fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
          fontSize: 11,
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <Win95Flag />
        Start
      </button>

      <StartMenu open={open} onClose={() => setOpen(false)} />

      <div
        style={{
          width: 1,
          height: 20,
          borderLeft: "1px solid #808080",
          borderRight: "1px solid #ffffff",
          margin: "0 2px",
        }}
      />

      {walletAddress && (
        <button
          className="taskbar-wallet-chip"
          onClick={() => useWindows.getState().open("player-profile", { address: walletAddress })}
          style={{
            height: 22,
            padding: "0 8px",
            fontSize: 11,
            fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
            display: "flex",
            alignItems: "center",
            gap: 4,
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#00aa00", fontSize: 8 }}>●</span>
          {shortAddr(walletAddress)}
        </button>
      )}

      <div className="taskbar-window-list" style={{ display: "flex", gap: 2, flex: 1, overflow: "hidden" }}>
        {windows.map((w) => (
          <button
            key={w.id}
            onClick={() => focus(w.id)}
            style={{
              height: 22,
              padding: "0 8px",
              maxWidth: 150,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 11,
              fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
            }}
          >
            {TYPE_LABEL[w.type] ?? w.type}
          </button>
        ))}
      </div>

      <LeaderboardTicker summaries={leaderboardSummaries} />

      <SystemTray />
    </div>
  );
}
