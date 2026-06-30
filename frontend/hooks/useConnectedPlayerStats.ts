"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@/state/wallet";
import { useMintTx } from "@/state/mint-tx";
import { fetchAllScoreHoldings } from "@/lib/holdings";
import { computePlayerStats, type PlayerStats } from "@/lib/player-stats";

/**
 * The connected wallet's aggregate stats (carries on-chain base XP = totalScore),
 * fetched globally so the level-up watcher can run without the profile being open.
 * `stats` is null while loading / disconnected / on error, and whenever the loaded
 * data belongs to a previous address (mirrors PlayerProfileBody's guard so a
 * wallet switch never exposes stale stats). Reads dedupe via cachedRead.
 */
export function useConnectedPlayerStats(): { stats: PlayerStats | null } {
  const address = useWallet((s) => s.address);
  const mintStatus = useMintTx((s) => s.status);
  const mintConfirmed = mintStatus === "success";
  const [loaded, setLoaded] = useState<{ address: string; stats: PlayerStats } | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    fetchAllScoreHoldings(address)
      .then((nfts) => {
        if (!cancelled) setLoaded({ address, stats: computePlayerStats(nfts) });
      })
      .catch(() => {
        /* leave prior state; stats is gated on address match below */
      });
    return () => {
      cancelled = true;
    };
  }, [address, mintConfirmed]);

  const stats = loaded?.address === address ? loaded.stats : null;
  return { stats };
}
