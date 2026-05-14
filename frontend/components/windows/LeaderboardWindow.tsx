"use client";
import { useEffect, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { Window } from "./Window";
import {
  getTopTen,
  claimPrize,
  getPrizePoolBalance,
  type TopEntry,
} from "@/lib/contract-calls";
import { useToasts } from "@/state/toasts";
import { watchTx } from "@/lib/tx-tracker";

export function LeaderboardWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "leaderboard"));
  const address = useWallet((s) => s.address);
  const [rows, setRows] = useState<TopEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyPrize, setBusyPrize] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [prizePool, setPrizePool] = useState<number | null>(null);

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

      getPrizePoolBalance()
        .then(setPrizePool)
        .catch(() => {});
    }

    setRows(null);
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [w]);

  if (!w) return null;

  const myRank = address && rows
    ? rows.findIndex((r) => r.player === address) + 1
    : 0;

  async function handleClaimPrize() {
    const season = 1; // TODO: derive from contract once multi-season UI is built
    setBusyPrize(true);
    try {
      const txId = await claimPrize(season);
      useToasts.getState().push({ title: "Prize claim submitted", body: "Watching for confirmation…" });
      watchTx(txId, (s) => {
        if (s === "success") {
          useToasts.getState().push({ title: "Prize claimed!", body: "STX sent to your wallet." });
          setPrizePool(null);
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
    <>
      <Window id={w.id} title="High Scores" width={420}>
        <div className="p-2">
          {error && <p className="text-red-600 text-xs mb-2">&#x26A0;&#xFE0F; {error}</p>}
          <div className="flex justify-between items-center mb-2 text-xs">
            <span>&#x1F3C6; Prize Pool: <b>{poolDisplay}</b></span>
            {myRank > 0 && myRank <= 10 && (
              <button
                onClick={handleClaimPrize}
                disabled={busyPrize}
                className="text-xs"
              >
                {busyPrize ? "Claiming…" : "Claim Prize"}
              </button>
            )}
          </div>
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
            </p>
          )}
        </div>
      </Window>
    </>
  );
}
