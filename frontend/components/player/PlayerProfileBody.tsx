"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { shortAddress } from "@/lib/stacks-address";
import { fetchAllScoreHoldings, scoreNftKey, type ScoreNft } from "@/lib/holdings";
import { rarityColor } from "@/lib/metadata-svg";
import { computePlayerStats } from "@/lib/player-stats";
import { PlayerStatsPanel } from "./PlayerStatsPanel";
import { RarityBreakdown } from "./RarityBreakdown";
import { CopyAddressButton } from "./CopyAddressButton";

type NftLoadState = {
  address: string;
  nfts: ScoreNft[] | null;
  error: string | null;
};

export function PlayerProfileBody({
  address,
  showBackToDesktop = false,
}: {
  address: string;
  showBackToDesktop?: boolean;
}) {
  const [loadState, setLoadState] = useState<NftLoadState | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAllScoreHoldings(address)
      .then((list) => {
        if (cancelled) return;
        setLoadState({
          address,
          nfts: [...list].sort(
            (a, b) => (b.score ?? 0) - (a.score ?? 0) || b.id - a.id
          ),
          error: null,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadState({
          address,
          nfts: null,
          error: e instanceof Error ? e.message : "Load failed",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  const activeState = loadState?.address === address ? loadState : null;
  const nfts = activeState?.nfts ?? null;
  const error = activeState?.error ?? null;
  const stats = useMemo(() => (nfts ? computePlayerStats(nfts) : null), [nfts]);

  return (
    <div className="p-2">
      {showBackToDesktop && (
        <Link href="/" className="text-xs text-blue-700 underline">
          ← Back to desktop
        </Link>
      )}
      <h2 className="text-sm font-bold mb-1 mt-1">
        Player {shortAddress(address)}
      </h2>
      <p className="text-[10px] font-mono text-gray-700 mb-3 break-all">
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
          No score NFTs minted yet by this player.
        </div>
      )}
      {nfts && nfts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {nfts.map((n) => (
            <div
              key={scoreNftKey(n)}
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
  );
}
