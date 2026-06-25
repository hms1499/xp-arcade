"use client";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { useIsOwner } from "@/lib/owner";
import { GAMES } from "@/lib/game-registry";
import { DESKTOP_THEMES, useDesktopTheme } from "@/state/desktop-theme";
import { useWelcome } from "@/state/welcome";

const menuItemBase: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "4px 16px 4px 8px",
  display: "flex",
  gap: 8,
  alignItems: "center",
  fontSize: 11,
  fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
  border: "none",
  cursor: "default",
};

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <li role="none">
      <button
        role="menuitem"
        style={{
          ...menuItemBase,
          background: hovered ? "#000080" : "transparent",
          color: hovered ? "#ffffff" : "#000000",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
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
  const address = useWallet((s) => s.address);
  const isOwner = useIsOwner(address);
  const [showAbout, setShowAbout] = useState(false);
  const theme = useDesktopTheme((s) => s.theme);
  const setTheme = useDesktopTheme((s) => s.setTheme);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (target instanceof Element && target.closest("[data-start-button='true']")) return;
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
    {showAbout && <AboutDialog onClose={() => { setShowAbout(false); onClose(); }} />}
    <div
      ref={menuRef}
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
          {Object.values(GAMES).map((game) => (
            <MenuItem
              key={game.id}
              icon={game.emoji}
              label={game.label}
              onClick={() => { openWin(`game-${game.id}`); onClose(); }}
            />
          ))}
          <MenuItem
            icon="🏆"
            label="Leaderboard"
            onClick={() => { openWin("highscore"); onClose(); }}
          />
          <MenuItem
            icon="🎖️"
            label="Hall of Fame"
            onClick={() => { openWin("hall-of-fame"); onClose(); }}
          />
          <MenuItem
            icon="👑"
            label="Arcade Champion"
            onClick={() => { openWin("arcade-champion"); onClose(); }}
          />
          <MenuItem
            icon="💾"
            label="My NFTs"
            onClick={() => { openWin("mynfts"); onClose(); }}
          />
          <MenuItem
            icon="🌐"
            label="Internet"
            onClick={() => { openWin("browser"); onClose(); }}
          />
          {isOwner && (
            <MenuItem
              icon="🛠️"
              label="Season Admin"
              onClick={() => { openWin("season-admin"); onClose(); }}
            />
          )}

          <li
            style={{
              borderTop: "1px solid #808080",
              borderBottom: "1px solid #ffffff",
              margin: "4px 0",
            }}
          />

          <MenuItem
            icon="❔"
            label="How It Works"
            onClick={() => { openWin("how-it-works"); onClose(); }}
          />
          <MenuItem
            icon="⚙️"
            label="Control Panel"
            onClick={() => { openWin("control-panel"); onClose(); }}
          />
          <MenuItem
            icon="👋"
            label="Welcome"
            onClick={() => {
              useWelcome.getState().open();
              onClose();
            }}
          />
          <MenuItem
            icon="ℹ️"
            label="About XP Arcade"
            onClick={() => setShowAbout(true)}
          />

          <li
            style={{
              borderTop: "1px solid #808080",
              borderBottom: "1px solid #ffffff",
              margin: "4px 0",
            }}
          />

          <li
            role="none"
            style={{
              padding: "3px 8px 2px",
              color: "#555",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Desktop Theme
          </li>
          {DESKTOP_THEMES.map((option) => (
            <MenuItem
              key={option.id}
              icon={theme === option.id ? "✓" : " "}
              label={option.label}
              onClick={() => {
                setTheme(option.id);
                onClose();
              }}
            />
          ))}

          <li
            style={{
              borderTop: "1px solid #808080",
              borderBottom: "1px solid #ffffff",
              margin: "4px 0",
            }}
          />

          {address ? (
            <>
              <MenuItem
                icon="👤"
                label="View Wallet Profile"
                onClick={() => {
                  openWin("player-profile", { address });
                  onClose();
                }}
              />
              <MenuItem
                icon="🔌"
                label="Disconnect Wallet"
                onClick={() => { disconnect(); onClose(); }}
              />
            </>
          ) : (
            <MenuItem
              icon="🔌"
              label="Connect Wallet"
              onClick={() => {
                void useWallet.getState().connect();
                onClose();
              }}
            />
          )}
          <MenuItem
            icon="⏻"
            label="Shut Down"
            onClick={() => {
              window.dispatchEvent(new Event("xp-arcade:shutdown"));
              onClose();
            }}
          />
        </ul>
      </div>
    </div>
    </>
  );
}
