"use client";
import { useEffect, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { Window } from "./Window";
import { rarityColor } from "@/lib/metadata-svg";
import { fetchScoreHoldings, type ScoreNft } from "@/lib/holdings";

type Nft = ScoreNft;

export function MyNftsWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "my-nfts"));
  const address = useWallet((s) => s.address);
  const [nfts, setNfts] = useState<Nft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!w || !address) return;
    setNfts(null);
    setError(null);
    fetchScoreHoldings(address)
      .then(setNfts)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [w, address]);

  if (!w) return null;

  return (
    <Window id={w.id} title="My Snake NFTs" width={480}>
      <div className="p-2">
        {address && (
          <div className="mb-2 text-right">
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                useWindows.getState().open("player-profile", { address });
              }}
              className="text-xs"
            >
              Open my profile
            </button>
          </div>
        )}
        {!address && (
          <p className="text-sm">Connect your wallet to see your NFTs.</p>
        )}
        {address && nfts === null && !error && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 8 }}>
            {[0,1,2,3].map((i) => (
              <div
                key={i}
                style={{
                  height: 72, background: "#111", border: "1px solid #1a3a1a", borderRadius: 4,
                  animation: "shimmer 1.2s linear infinite",
                }}
              />
            ))}
          </div>
        )}
        {error && <p className="text-red-600 text-xs">⚠️ {error}</p>}
        {nfts?.length === 0 && (
          <p className="text-sm text-gray-600">
            No NFTs yet. Play Snake and mint your first score!
          </p>
        )}
        {nfts && nfts.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 8 }}>
            {nfts.map((n) => (
              <div
                key={n.id}
                style={{
                  background: "#000",
                  border: "1px solid #1a3a1a",
                  borderRadius: 4,
                  padding: 6,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  fontFamily: "monospace",
                }}
              >
                {/* Score value */}
                <div style={{ color: "#0f0", fontWeight: "bold", fontSize: 14 }}>
                  {n.score ?? "?"}
                </div>
                <div style={{ color: "#555", fontSize: 8 }}>SCORE</div>
                {n.rarity && (
                  <div style={{ color: rarityColor(n.rarity), fontSize: 8, fontWeight: "bold" }}>
                    {n.rarity}
                  </div>
                )}
                <div style={{ color: "#333", fontSize: 8 }}>#{n.id}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Window>
  );
}
