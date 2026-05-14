"use client";
import { useEffect, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { Window } from "./Window";
import {
  getTopTen,
  claimPrize,
  getPrizePoolBalance,
  getCurrentSeason,
  getSeasonPrize,
  hasClaimedPrize,
  computePayoutUstx,
  type TopEntry,
} from "@/lib/contract-calls";
import { useToasts } from "@/state/toasts";
import { watchTx } from "@/lib/tx-tracker";

type Claimable = { season: number; rank: number; payoutUstx: number };

export function LeaderboardWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "leaderboard"));
  const address = useWallet((s) => s.address);
  const [rows, setRows] = useState<TopEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyPrize, setBusyPrize] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [prizePool, setPrizePool] = useState<number | null>(null);
  const [currentSeason, setCurrentSeason] = useState<number | null>(null);
  const [claimable, setClaimable] = useState<Claimable[]>([]);

  useEffect(() => {
    if (!w) return;

    function load() {
      getTopTen()
        .then((data) => {
          const sorted = [...data].sort((a, b) => b.score - a.score);
          setRows(sorted);
          setError(null);
          setLastUpdated(new Date());
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));

      getPrizePoolBalance().then(setPrizePool).catch(() => {});
      getCurrentSeason().then(setCurrentSeason).catch(() => {});
    }

    setRows(null);
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [w]);

  useEffect(() => {
    if (!address || !currentSeason || currentSeason <= 1) {
      setClaimable([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const found: Claimable[] = [];
      for (let s = 1; s < currentSeason; s++) {
        const snap = await getSeasonPrize(s);
        if (!snap || snap.total <= 0) continue;
        const sorted = [...snap.topTen].sort((a, b) => b.score - a.score);
        const idx = sorted.findIndex((e) => e.player === address);
        if (idx === -1) continue;
        const claimed = await hasClaimedPrize(address, s);
        if (claimed) continue;
        found.push({
          season: s,
          rank: idx + 1,
          payoutUstx: computePayoutUstx(snap.total, idx + 1),
        });
      }
      if (!cancelled) setClaimable(found);
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [address, currentSeason]);

  if (!w) return null;

  const myRank = address && rows
    ? rows.findIndex((r) => r.player === address) + 1
    : 0;

  async function handleClaimPrize(season: number) {
    setBusyPrize(true);
    try {
      const txId = await claimPrize(season);
      useToasts.getState().push({ title: "Prize claim submitted", body: `Season ${season} — watching for confirmation…` });
      watchTx(txId, (s) => {
        if (s === "success") {
          useToasts.getState().push({ title: "Prize claim recorded!", body: "Owner will send STX off-chain." });
          setClaimable((prev) => prev.filter((c) => c.season !== season));
        } else if (s !== "pending") {
          useToasts.getState().push({ title: "Claim failed", body: "Transaction rejected on-chain." });
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim prize failed");
    } finally {
      setBusyPrize(false);
    }
  }

  const poolDisplay = prizePool != null
    ? `${(prizePool / 1_000_000).toFixed(4)} STX`
    : "…";

  return (
    <Window id={w.id} title="High Scores" width={420}>
      <div className="p-2">
        {error && <p className="text-red-600 text-xs mb-2">&#x26A0;&#xFE0F; {error}</p>}
        <div className="flex justify-between items-center mb-2 text-xs">
          <span>
            &#x1F3C6; Prize Pool: <b>{poolDisplay}</b>
            {currentSeason != null && <span className="text-gray-500"> — Season {currentSeason}</span>}
          </span>
        </div>

        {claimable.length > 0 && (
          <div className="mb-2 border border-yellow-500 bg-yellow-50 p-1 text-xs">
            <div className="font-bold mb-1">&#x1F4B0; You have unclaimed prizes</div>
            {claimable.map((c) => (
              <div key={c.season} className="flex justify-between items-center py-0.5">
                <span>
                  Season {c.season} · Rank #{c.rank} ·{" "}
                  <b>{(c.payoutUstx / 1_000_000).toFixed(4)} STX</b>
                </span>
                <button
                  onClick={() => handleClaimPrize(c.season)}
                  disabled={busyPrize}
                  className="text-xs"
                >
                  {busyPrize ? "…" : "Claim"}
                </button>
              </div>
            ))}
            <div className="text-[9px] text-gray-500 mt-1">
              Note: claim records the amount on-chain; owner sends STX off-chain.
            </div>
          </div>
        )}

        <table className="w-full text-xs interactive">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && !error && (
              <tr><td colSpan={3}>Loading…</td></tr>
            )}
            {rows?.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-gray-500">
                  No scores yet. Be the first!
                </td>
              </tr>
            )}
            {rows?.map((r, i) => (
              <tr
                key={r.player}
                style={r.player === address ? { fontWeight: "bold" } : undefined}
              >
                <td>{i + 1}</td>
                <td>{r.player.slice(0, 6)}…{r.player.slice(-4)}</td>
                <td>{r.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {lastUpdated && (
          <p className="text-[9px] text-gray-400 mt-1 text-right">
            Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} &middot; auto-refresh 30s
            {myRank > 0 && <> &middot; Your rank: #{myRank}</>}
          </p>
        )}
      </div>
    </Window>
  );
}
