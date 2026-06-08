"use client";
import { useEffect, useState, type CSSProperties } from "react";
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
} as const;

const TX_COLOR = {
  pending: "#000080",
  success: "#007700",
  abort_by_response: "#cc0000",
  abort_by_post_condition: "#cc0000",
  failed: "#cc0000",
} as const;

function shortTx(txId: string) {
  return `${txId.slice(0, 6)}…${txId.slice(-4)}`;
}

export function SystemTray() {
  const address = useWallet((s) => s.address);
  const connect = useWallet((s) => s.connect);
  const hydrate = useWallet((s) => s.hydrate);
  const mintPending = useWallet((s) => s.mintPending);
  const txId = useMintTx((s) => s.txId);
  const txStatus = useMintTx((s) => s.status);
  const [now, setNow] = useState(() => new Date());
  const chain = stacks.networkName;
  const openWindow = useWindows((s) => s.open);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

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
      <div style={sunken}>
        {address ? (
          <button
            type="button"
            className="tray-wallet-button"
            onClick={() => openWindow("player-profile", { address })}
            aria-label="Open wallet profile"
            title={`${address} - open profile`}
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
      <div className="tray-clock" style={sunken}>
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
      <WalletBalloon />
    </div>
  );
}
