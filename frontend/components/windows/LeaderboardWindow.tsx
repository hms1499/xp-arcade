"use client";
import { useEffect, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { Window } from "./Window";
import { getTopTen, claimTrophy, type TopEntry } from "@/lib/contract-calls";
import { TrophyDialog } from "@/components/dialogs/TrophyDialog";
import { useToasts } from "@/state/toasts";

export function LeaderboardWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "leaderboard"));
  const address = useWallet((s) => s.address);
  const [rows, setRows] = useState<TopEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimedRank, setClaimedRank] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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

  async function handleClaim() {
    setBusy(true);
    try {
      await claimTrophy();
      setClaimedRank(myRank);
      useToasts.getState().push({
        title: "Trophy claimed!",
        body: `Trophy NFT submitted for rank #${myRank}.`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Window id={w.id} title="High Scores" width={420}>
        <div className="p-2">
          {error && <p className="text-red-600 text-xs mb-2">⚠️ {error}</p>}
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
                <tr>
                  <td colSpan={3}>Loading…</td>
                </tr>
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
                  <td>
                    {r.player.slice(0, 6)}…{r.player.slice(-4)}
                  </td>
                  <td>{r.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {lastUpdated && (
            <p className="text-[9px] text-gray-400 mt-1 text-right">
              Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · auto-refresh 30s
            </p>
          )}
          {myRank > 0 && (
            <div className="mt-3 text-center">
              <button onClick={handleClaim} disabled={busy}>
                {busy ? "Claiming…" : `Claim Trophy (Rank #${myRank})`}
              </button>
            </div>
          )}
        </div>
      </Window>
      {claimedRank !== null && (
        <TrophyDialog rank={claimedRank} onClose={() => setClaimedRank(null)} />
      )}
    </>
  );
}
