"use client";
import { useEffect, useState } from "react";
import { stacks } from "@/lib/stacks";
import { getLastTokenId } from "@/lib/contract-calls";

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const [totalNfts, setTotalNfts] = useState<number | null>(null);
  const contractId = stacks.contractAddress
    ? `${stacks.contractAddress}.${stacks.contractName}`
    : "not configured";
  const explorerBase = "https://explorer.hiro.so";
  const chain = process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const explorerUrl = stacks.contractAddress
    ? `${explorerBase}/txid/${stacks.contractAddress}.${stacks.contractName}?chain=${chain}`
    : null;

  useEffect(() => {
    getLastTokenId()
      .then(setTotalNfts)
      .catch(() => setTotalNfts(null));
  }, []);

  return (
    <div
      className="window"
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 340,
        zIndex: 1000,
      }}
    >
      <div className="title-bar">
        <div className="title-bar-text">About XP Arcade</div>
        <div className="title-bar-controls">
          <button aria-label="Close" onClick={onClose} />
        </div>
      </div>
      <div className="window-body" style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 48 }}>🕹️</span>
          <div>
            <div style={{ fontWeight: "bold", fontSize: 14 }}>XP Arcade</div>
            <div style={{ fontSize: 11, color: "#444" }}>Version 2.0 — Multi-Game Platform</div>
            <div style={{ fontSize: 11, color: "#444" }}>Arcade games on Stacks blockchain</div>
          </div>
        </div>

        <div
          style={{
            border: "1px solid #808080",
            borderRight: "1px solid #ffffff",
            borderBottom: "1px solid #ffffff",
            borderLeft: "1px solid #ffffff",
            borderTop: "1px solid #808080",
            background: "#ffffff",
            padding: "6px 8px",
            fontSize: 11,
            marginBottom: 12,
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ color: "#666", paddingRight: 8, paddingBottom: 2 }}>Network</td>
                <td style={{ fontFamily: "monospace", fontSize: 10 }}>
                  {process.env.NEXT_PUBLIC_NETWORK ?? "mainnet"}
                </td>
              </tr>
              <tr>
                <td style={{ color: "#666", paddingRight: 8, paddingBottom: 2 }}>Contract</td>
                <td style={{ fontFamily: "monospace", fontSize: 9, wordBreak: "break-all" }}>
                  {contractId}
                </td>
              </tr>
              <tr>
                <td style={{ color: "#666", paddingRight: 8 }}>Total NFTs minted</td>
                <td style={{ fontFamily: "monospace", fontSize: 10 }}>
                  {totalNfts === null ? "loading…" : totalNfts}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {explorerUrl && (
          <p style={{ fontSize: 10, color: "#000080", marginBottom: 12, wordBreak: "break-all" }}>
            🔗{" "}
            <a href={explorerUrl} target="_blank" rel="noreferrer" style={{ color: "#000080" }}>
              View contract on Hiro Explorer
            </a>
          </p>
        )}

        <p style={{ fontSize: 10, color: "#666", marginBottom: 12 }}>
          Scores are client-trusted. No STX prizes — NFTs only.
          Top-10 leaderboard is on-chain; trophies claimable once per season.
        </p>

        <div style={{ textAlign: "center" }}>
          <button onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
}
