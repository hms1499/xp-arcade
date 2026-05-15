"use client";
import { useEffect, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { Window } from "./Window";
import { rarityColor } from "@/lib/metadata-svg";
import { fetchScoreHoldings, type ScoreNft } from "@/lib/holdings";
import Link from "next/link";

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
            <Link
              href={`/player/${address}`}
              target="_blank"
              className="text-xs text-blue-700 underline"
            >
              Open public profile →
            </Link>
          </div>
        )}
        {!address && (
          <p className="text-sm">Connect your wallet to see your NFTs.</p>
        )}
        {address && nfts === null && !error && <p className="text-sm">Loading…</p>}
        {error && <p className="text-red-600 text-xs">⚠️ {error}</p>}
        {nfts?.length === 0 && (
          <p className="text-sm text-gray-600">
            No NFTs yet. Play Snake and mint your first score!
          </p>
        )}
        {nfts && nfts.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {nfts.map((n) => (
              <div
                key={n.id}
                className="text-center text-xs border border-gray-300 p-1"
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
    </Window>
  );
}
