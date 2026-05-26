"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@/state/wallet";

export function WalletBalloon() {
  const address = useWallet((s) => s.address);
  const connect = useWallet((s) => s.connect);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (address) return;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("balloon-dismissed") === "1") return;

    const t = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(t);
  }, [address]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      setVisible(false);
      sessionStorage.setItem("balloon-dismissed", "1");
    }, 8000);
    return () => clearTimeout(t);
  }, [visible]);

  function dismiss() {
    setVisible(false);
    sessionStorage.setItem("balloon-dismissed", "1");
  }

  if (!visible || address) return null;

  return (
    <div
      className="wallet-balloon"
      style={{
        position: "fixed",
        bottom: 36,
        right: 8,
        width: 220,
        background: "#ffffe1",
        border: "1px solid #000000",
        padding: "8px 10px",
        fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
        fontSize: 11,
        zIndex: 60,
        boxShadow: "2px 2px 6px rgba(0,0,0,0.3)",
      }}
    >
      {/* Close button */}
      <button
        onClick={dismiss}
        style={{
          position: "absolute", top: 4, right: 6,
          background: "none", border: "none", cursor: "pointer",
          fontSize: 10, color: "#666", padding: 0,
        }}
      >
        ✕
      </button>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <span style={{ fontSize: 18 }}>🦊</span>
        <div>
          <div style={{ fontWeight: "bold", marginBottom: 2 }}>Connect your wallet</div>
          <div style={{ color: "#444", marginBottom: 6, lineHeight: 1.4 }}>
            Save scores on-chain &amp; mint NFTs
          </div>
          <button onClick={connect} style={{ fontSize: 10, padding: "2px 10px" }}>
            Connect Now
          </button>
        </div>
      </div>

      {/* Triangle tail */}
      <div style={{
        position: "absolute", bottom: -8, right: 18,
        width: 0, height: 0,
        borderLeft: "7px solid transparent",
        borderRight: "7px solid transparent",
        borderTop: "8px solid #000000",
      }} />
      <div style={{
        position: "absolute", bottom: -7, right: 19,
        width: 0, height: 0,
        borderLeft: "6px solid transparent",
        borderRight: "6px solid transparent",
        borderTop: "7px solid #ffffe1",
      }} />
    </div>
  );
}
