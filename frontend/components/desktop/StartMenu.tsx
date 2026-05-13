"use client";
import type React from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";

const menuItemStyle: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "4px 16px 4px 8px",
  display: "flex",
  gap: 8,
  alignItems: "center",
  fontSize: 11,
  fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
  background: "transparent",
  border: "none",
  cursor: "default",
  color: "#000000",
};

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <li role="none">
      <button
        role="menuitem"
        style={menuItemStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#000080";
          e.currentTarget.style.color = "#ffffff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "#000000";
        }}
        onClick={onClick}
      >
        <span style={{ fontSize: 18, lineHeight: "1" }}>{icon}</span>
        <span>{label}</span>
      </button>
    </li>
  );
}

export function StartMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const openWin = useWindows((s) => s.open);
  const disconnect = useWallet((s) => s.disconnect);

  if (!open) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 28,
        left: 0,
        display: "flex",
        border: "2px solid",
        borderColor: "#ffffff #808080 #808080 #ffffff",
        boxShadow: "2px 2px 0 #000000",
        zIndex: 50,
        background: "#c0c0c0",
      }}
    >
      {/* Navy sidebar */}
      <div
        style={{
          width: 28,
          background: "linear-gradient(to top, #000080, #1084d0)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          paddingBottom: 8,
        }}
      >
        <span
          style={{
            color: "#ffffff",
            fontSize: 13,
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            letterSpacing: 2,
            userSelect: "none",
            fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
          }}
        >
          <strong>Windows</strong> 95
        </span>
      </div>

      {/* Menu items */}
      <div style={{ minWidth: 200, background: "#c0c0c0" }}>
        <ul
          role="menu"
          style={{ listStyle: "none", margin: 0, padding: "4px 0" }}
        >
          <MenuItem
            icon="🐍"
            label="Play Snake"
            onClick={() => { openWin("game"); onClose(); }}
          />
          <MenuItem
            icon="🏆"
            label="Leaderboard"
            onClick={() => { openWin("leaderboard"); onClose(); }}
          />
          <MenuItem
            icon="💾"
            label="My Snake NFTs"
            onClick={() => { openWin("my-nfts"); onClose(); }}
          />

          <li
            style={{
              borderTop: "1px solid #808080",
              borderBottom: "1px solid #ffffff",
              margin: "4px 0",
            }}
          />

          <MenuItem
            icon="🔌"
            label="Disconnect Wallet"
            onClick={() => { disconnect(); onClose(); }}
          />
          <MenuItem
            icon="⏻"
            label="Shut Down"
            onClick={() => location.reload()}
          />
        </ul>
      </div>
    </div>
  );
}
