"use client";

import { useEffect, useState } from "react";
import { shortAddress } from "@/lib/stacks-address";
import { fetchScoreHoldings, type ScoreNft } from "@/lib/holdings";
import { rarityColor } from "@/lib/metadata-svg";
import { computePlayerStats } from "@/lib/player-stats";
import { PlayerStatsPanel } from "./PlayerStatsPanel";

export function PlayerProfile({ address }: { address: string }) {
  const [nfts, setNfts] = useState<ScoreNft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNfts(null);
    setError(null);
    fetchScoreHoldings(address)
      .then(setNfts)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [address]);

  return (
    <div className="min-h-screen p-4 bg-[#3a6ea5] text-white">
      <div className="bg-[#ece9d8] text-black border border-black/20 max-w-3xl mx-auto p-4">
        <h1 className="text-lg font-bold mb-2">Player {shortAddress(address)}</h1>
        <p className="text-[10px] font-mono text-gray-700 mb-4 break-all">{address}</p>

        {nfts && nfts.length > 0 && (
          <PlayerStatsPanel stats={computePlayerStats(nfts)} />
        )}

        {nfts === null && !error && <p className="text-sm">Loading NFTs…</p>}
        {error && <p className="text-red-700 text-xs">⚠️ {error}</p>}
        {nfts && nfts.length === 0 && (
          <p className="text-sm text-gray-600">No score NFTs minted yet.</p>
        )}
        {nfts && nfts.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {nfts.map((n) => (
              <div
                key={n.id}
                className="text-center text-xs border border-gray-300 p-1 bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={n.image} alt={n.name} className="w-full h-auto" />
                <div className="mt-1 truncate">{n.name}</div>
                {n.rarity && (
                  <div
                    className="text-[9px] font-bold mt-0.5"
                    style={{ color: rarityColor(n.rarity) }}
                  >
                    {n.rarity}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
