"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@/state/wallet";
import { fetchAllScoreHoldings } from "@/lib/holdings";
import { cachedRead } from "@/lib/read-cache";
import { computePlayerStats, type PlayerStats } from "@/lib/player-stats";

/** In-memory TTL for the holdings cache — matches the repo's ~30 s read convention. */
const HOLDINGS_TTL_MS = 30_000;

/**
 * The connected wallet's aggregate stats (carries on-chain base XP = totalScore),
 * fetched globally so the level-up watcher can run without the profile being open.
 *
 * Fetch strategy:
 *  - Runs once per connected address (dependency array is [address] only).
 *  - Routed through `cachedRead` (in-memory TTL + concurrent-dedupe + 429 backoff)
 *    keyed by `holdings:<address>`.
 *  - Does NOT yet share a cache key with PlayerProfileBody / MyNftsWindow, which
 *    still call fetchAllScoreHoldings directly; cross-window dedupe is a deliberate
 *    fast-follow, out of scope here.
 *  - Base XP reconciles on the next address change / page reload; live XP signals
 *    at game-over come from play-XP, so no mint-confirm refetch is needed here.
 *
 * `stats` is null while loading / disconnected / on error, and whenever the loaded
 * data belongs to a previous address (mirrors PlayerProfileBody's guard so a
 * wallet switch never exposes stale stats).
 */
export function useConnectedPlayerStats(): { stats: PlayerStats | null } {
  const address = useWallet((s) => s.address);
  const [loaded, setLoaded] = useState<{ address: string; stats: PlayerStats } | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    cachedRead(`holdings:${address}`, HOLDINGS_TTL_MS, () => fetchAllScoreHoldings(address))
      .then((nfts) => {
        if (!cancelled) setLoaded({ address, stats: computePlayerStats(nfts) });
      })
      .catch(() => {
        /* leave prior state; stats is gated on address match below */
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  const stats = loaded?.address === address ? loaded.stats : null;
  return { stats };
}
