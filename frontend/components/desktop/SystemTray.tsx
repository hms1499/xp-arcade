"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { useWallet } from "@/state/wallet";
import { WalletBalloon } from "./WalletBalloon";

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

export function SystemTray() {
  const address = useWallet((s) => s.address);
  const connect = useWallet((s) => s.connect);
  const disconnect = useWallet((s) => s.disconnect);
  const hydrate = useWallet((s) => s.hydrate);
  const mintPending = useWallet((s) => s.mintPending);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, paddingRight: 4 }}>
      {mintPending && (
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
            onClick={disconnect}
            title={address}
            style={{ background: "none", border: "none", cursor: "default", fontSize: 11, display: "flex", gap: 4, alignItems: "center", fontFamily: "inherit" }}
          >
            <span style={{ color: "#00aa00" }}>●</span>
            {address.slice(0, 5)}…{address.slice(-4)}
          </button>
        ) : (
          <button
            onClick={connect}
            style={{ background: "none", border: "none", cursor: "default", fontSize: 11, fontFamily: "inherit" }}
          >
            Connect Wallet
          </button>
        )}
      </div>
      <div style={sunken}>
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
      <WalletBalloon />
    </div>
  );
}
