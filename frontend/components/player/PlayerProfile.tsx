"use client";

import { useEffect, useMemo, useState } from "react";
import { shortAddress } from "@/lib/stacks-address";
import { fetchScoreHoldings, type ScoreNft } from "@/lib/holdings";
import { rarityColor } from "@/lib/metadata-svg";
import { computePlayerStats } from "@/lib/player-stats";
import { PlayerStatsPanel } from "./PlayerStatsPanel";
import { RarityBreakdown } from "./RarityBreakdown";
import { CopyAddressButton } from "./CopyAddressButton";

export function PlayerProfile({ address }: { address: string }) {
  const [nfts, setNfts] = useState<ScoreNft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNfts(null);
    setError(null);
    fetchScoreHoldings(address)
      .then((list) =>
        setNfts([...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)))
      )
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [address]);

  const stats = useMemo(() => (nfts ? computePlayerStats(nfts) : null), [nfts]);

  return (
    <div className="min-h-screen p-4 bg-[#3a6ea5] text-white">
      <div className="bg-[#ece9d8] text-black border border-black/20 max-w-3xl mx-auto p-4">
        <a href="/" className="text-xs text-blue-700 underline">
          ← Back to desktop
        </a>
        <h1 className="text-lg font-bold mb-2 mt-2">
          Player {shortAddress(address)}
        </h1>
        <p className="text-[10px] font-mono text-gray-700 mb-4 break-all">
          {address}
          <CopyAddressButton value={address} />
          <a
            href={`https://explorer.hiro.so/address/${address}?chain=${
              address.startsWith("SP") ? "mainnet" : "testnet"
            }`}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] ml-2 text-blue-700 underline"
          >
            Explorer ↗
          </a>
        </p>

        {stats && nfts && nfts.length > 0 && (
          <>
            <PlayerStatsPanel stats={stats} />
            <RarityBreakdown counts={stats.rarityCounts} />
          </>
        )}

        {nfts === null && !error && <p className="text-sm">Loading NFTs…</p>}
        {error && <p className="text-red-700 text-xs">⚠️ {error}</p>}
        {nfts && nfts.length === 0 && (
          <div className="text-sm text-gray-700 border border-dashed border-gray-400 p-3 text-center">
            No score NFTs minted yet by this player.{" "}
            <a href="/" className="text-blue-700 underline">
              Play Snake →
            </a>
          </div>
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
                {typeof n.score === "number" && (
                  <div className="text-[10px] text-gray-700">
                    score {n.score}
                  </div>
                )}
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
