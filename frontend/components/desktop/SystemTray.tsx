"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useWallet } from "@/state/wallet";
import { useMintTx } from "@/state/mint-tx";
import { WalletBalloon } from "./WalletBalloon";
import { stacks } from "@/lib/stacks";
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

const TX_LABEL = {
  pending: "Mint pending",
  success: "Mint confirmed",
  abort_by_response: "Mint failed",
  abort_by_post_condition: "Mint blocked",
  failed: "Mint failed",
  timeout: "Confirmation delayed",
} as const;

const TX_COLOR = {
  pending: "#000080",
  success: "#007700",
  abort_by_response: "#cc0000",
  abort_by_post_condition: "#cc0000",
  failed: "#cc0000",
  timeout: "#9a6700",
} as const;

function shortTx(txId: string) {
  return `${txId.slice(0, 6)}…${txId.slice(-4)}`;
}

const trayMenuItemBase: CSSProperties = {
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
  background: "transparent",
};

function TrayMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        style={{
          ...trayMenuItemBase,
          background: hovered ? "#000080" : "transparent",
          color: hovered ? "#ffffff" : "#000000",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onClick}
      >
        <span style={{ fontSize: 14, lineHeight: "1" }}>{icon}</span>
        <span>{label}</span>
      </button>
    </li>
  );
}

export function SystemTray() {
  const address = useWallet((s) => s.address);
  const connect = useWallet((s) => s.connect);
  const disconnect = useWallet((s) => s.disconnect);
  const hydrate = useWallet((s) => s.hydrate);
  const mintPending = useWallet((s) => s.mintPending);
  const txId = useMintTx((s) => s.txId);
  const txStatus = useMintTx((s) => s.status);
  const [now, setNow] = useState(() => new Date());
  const [menuOpen, setMenuOpen] = useState(false);
  const walletRef = useRef<HTMLDivElement | null>(null);
  const chain = stacks.networkName;
  const openWindow = useWindows((s) => s.open);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Close the wallet menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (walletRef.current && !walletRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <div
      className="system-tray"
      style={{ display: "flex", alignItems: "center", gap: 2, paddingRight: 4 }}
    >
      {txId && (
        <button
          type="button"
          className="tray-tx-chip"
          onClick={() => {
            window.open(
              `https://explorer.hiro.so/txid/${txId}?chain=${chain}`,
              "_blank",
              "noopener,noreferrer",
            );
          }}
          title={`Open transaction ${txId}`}
          style={{
            ...sunken,
            color: TX_COLOR[txStatus],
            maxWidth: 148,
            overflow: "hidden",
            whiteSpace: "nowrap",
            cursor: "default",
          }}
        >
          {txStatus === "pending" && <div className="tray-spinner" />}
          <span>{TX_LABEL[txStatus]}</span>
          <span style={{ color: "#555", fontFamily: "monospace" }}>
            {shortTx(txId)}
          </span>
        </button>
      )}
      {mintPending && !txId && (
        <div
          style={{
            ...sunken,
            width: 20,
            padding: 0,
            justifyContent: "center",
          }}
        >
          <div className="tray-spinner" />
        </div>
      )}
      <div ref={walletRef} style={{ position: "relative" }}>
        <div style={sunken}>
          {address ? (
            <button
              type="button"
              className="tray-wallet-button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Wallet menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title={address}
              style={{ background: "none", border: "none", cursor: "default", fontSize: 11, display: "flex", gap: 4, alignItems: "center", fontFamily: "inherit" }}
            >
              <span className="tray-wallet-icon" style={{ color: "#00aa00" }}>●</span>
              <span className="tray-wallet-label">
                {address.slice(0, 5)}…{address.slice(-4)}
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="tray-wallet-button"
              onClick={connect}
              aria-label="Connect wallet"
              style={{ background: "none", border: "none", cursor: "default", fontSize: 11, fontFamily: "inherit" }}
            >
              <span className="tray-wallet-icon">▣</span>
              <span className="tray-wallet-label">Connect Wallet</span>
            </button>
          )}
        </div>

        {address && menuOpen && (
          <ul
            role="menu"
            aria-label="Wallet menu"
            style={{
              position: "absolute",
              bottom: "calc(100% + 2px)",
              right: 0,
              minWidth: 160,
              margin: 0,
              padding: 2,
              listStyle: "none",
              background: "#c0c0c0",
              border: "2px solid",
              borderColor: "#ffffff #808080 #808080 #ffffff",
              boxShadow: "1px 1px 0 #000000",
              zIndex: 70,
            }}
          >
            <TrayMenuItem
              icon="👤"
              label="View Wallet Profile"
              onClick={() => {
                openWindow("player-profile", { address });
                setMenuOpen(false);
              }}
            />
            <TrayMenuItem
              icon="🔌"
              label="Disconnect Wallet"
              onClick={() => {
                disconnect();
                setMenuOpen(false);
              }}
            />
          </ul>
        )}
      </div>
      <div className="tray-clock" style={sunken}>
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
      <WalletBalloon />
    </div>
  );
}
