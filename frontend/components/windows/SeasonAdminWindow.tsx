"use client";
import { useCallback, useEffect, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { stacks } from "@/lib/stacks";
import { Window } from "./Window";
import {
  getCurrentSeason,
  getPrizePoolBalance,
  getSeasonPrize,
  hasClaimedPrize,
  endSeason,
  transferStx,
  computePayoutUstx,
} from "@/lib/contract-calls";
import { useToasts } from "@/state/toasts";
import { watchTx } from "@/lib/tx-tracker";
import { useSeasonCountdown, formatCountdown } from "@/lib/season-countdown";

type PayoutRow = {
  player: string;
  rank: number;
  score: number;
  payoutUstx: number;
  claimed: boolean;
};

type SeasonView = {
  season: number;
  total: number;
  rows: PayoutRow[];
};

export function isOwnerAddress(addr: string | null): boolean {
  return !!addr && addr === stacks.contractAddress;
}

export function SeasonAdminWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "season-admin"));
  const address = useWallet((s) => s.address);
  const [currentSeason, setCurrentSeason] = useState<number | null>(null);
  const [accumulated, setAccumulated] = useState<number | null>(null);
  const [seasons, setSeasons] = useState<SeasonView[]>([]);
  const [busyEnd, setBusyEnd] = useState(false);
  const [busyPay, setBusyPay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const countdown = useSeasonCountdown();

  const loadPastSeasons = useCallback(async (cs: number) => {
    const results: SeasonView[] = [];
    for (let s = 1; s < cs; s++) {
      const snap = await getSeasonPrize(s);
      if (!snap) continue;
      const sorted = [...snap.topTen].sort((a, b) => b.score - a.score);
      const rows: PayoutRow[] = await Promise.all(
        sorted.map(async (e, i) => ({
          player: e.player,
          rank: i + 1,
          score: e.score,
          payoutUstx: computePayoutUstx(snap.total, i + 1),
          claimed: await hasClaimedPrize(e.player, s).catch(() => false),
        })),
      );
      results.push({ season: s, total: snap.total, rows });
    }
    setSeasons(results);
  }, []);

  useEffect(() => {
    if (!w) return;
    setError(null);
    Promise.all([getCurrentSeason(), getPrizePoolBalance()])
      .then(([cs, pool]) => {
        setCurrentSeason(cs);
        setAccumulated(pool);
        return loadPastSeasons(cs);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [w, loadPastSeasons]);

  if (!w) return null;

  if (!isOwnerAddress(address)) {
    return (
      <Window id={w.id} title="Season Admin" width={420}>
        <div className="p-3 text-xs">
          &#x26A0;&#xFE0F; This window is for the contract owner only.
          <div className="text-gray-500 mt-2">Connected: {address ?? "—"}</div>
        </div>
      </Window>
    );
  }

  async function handleEndSeason() {
    if (!confirm("End the current season? This locks the snapshot and starts a new season.")) return;
    setBusyEnd(true);
    try {
      const txId = await endSeason();
      useToasts.getState().push({ title: "End-season submitted", body: "Watching for confirmation…" });
      watchTx(txId, (s) => {
        if (s === "success") {
          useToasts.getState().push({ title: "Season closed", body: "Snapshot locked. Reloading…" });
          getCurrentSeason().then((cs) => {
            setCurrentSeason(cs);
            loadPastSeasons(cs);
          });
          getPrizePoolBalance().then(setAccumulated);
        } else if (s !== "pending") {
          useToasts.getState().push({ title: "End-season failed", body: "Transaction rejected." });
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "End season failed");
    } finally {
      setBusyEnd(false);
    }
  }

  async function handlePay(row: PayoutRow, season: number) {
    const stxAmount = (row.payoutUstx / 1_000_000).toFixed(4);
    if (!confirm(`Send ${stxAmount} STX to ${row.player} for Season ${season} rank #${row.rank}?`)) return;
    const key = `${season}-${row.player}`;
    setBusyPay(key);
    try {
      await transferStx(row.player, row.payoutUstx, `XP Snake S${season} #${row.rank}`);
      useToasts.getState().push({
        title: "Payout submitted",
        body: `${stxAmount} STX → ${row.player.slice(0, 6)}…`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setBusyPay(null);
    }
  }

  return (
    <Window id={w.id} title="Season Admin" width={560}>
      <div className="p-2 text-xs">
        {error && <p className="text-red-600 mb-2">&#x26A0;&#xFE0F; {error}</p>}

        <fieldset className="mb-3">
          <legend>Current Season</legend>
          <div className="flex justify-between items-center p-1">
            <div>
              Season <b>{currentSeason ?? "…"}</b> · Pool:{" "}
              <b>{accumulated != null ? (accumulated / 1_000_000).toFixed(4) : "…"} STX</b>
            </div>
            <button onClick={handleEndSeason} disabled={busyEnd || currentSeason == null}>
              {busyEnd ? "Closing…" : "End Season"}
            </button>
          </div>
          <p className="text-[10px] text-gray-500 px-1">
            Ending the season snapshots top-10 and pool total, then starts a fresh season.
          </p>
          {countdown.state !== "unset" && (
            <p className="text-[10px] px-1 mt-1" style={{ color: countdown.state === "expired" ? "#cc0000" : "#000080" }}>
              ⏳ Soft deadline: <b>{formatCountdown(countdown)}</b>
              {" · ends "}
              {countdown.endsAt.toLocaleString()}
              {countdown.state === "expired" && " — call End Season now to honour it."}
            </p>
          )}
        </fieldset>

        {seasons.length === 0 && (
          <p className="text-gray-500 italic">No past seasons yet — end the current one to create a snapshot.</p>
        )}

        {seasons.map((s) => (
          <fieldset key={s.season} className="mb-3">
            <legend>Season {s.season} · Pool {(s.total / 1_000_000).toFixed(4)} STX</legend>
            {s.rows.length === 0 ? (
              <p className="px-1 text-gray-500">No top-10 entries.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Player</th>
                    <th>Score</th>
                    <th>Payout</th>
                    <th>Claim?</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r) => {
                    const key = `${s.season}-${r.player}`;
                    return (
                      <tr key={r.player}>
                        <td>{r.rank}</td>
                        <td title={r.player}>{r.player.slice(0, 6)}…{r.player.slice(-4)}</td>
                        <td>{r.score}</td>
                        <td>{(r.payoutUstx / 1_000_000).toFixed(4)}</td>
                        <td>{r.claimed ? "✓" : "—"}</td>
                        <td>
                          <button
                            onClick={() => handlePay(r, s.season)}
                            disabled={busyPay === key}
                          >
                            {busyPay === key ? "…" : "Send STX"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="text-[10px] text-gray-500 px-1 mt-1">
              ✓ = player called claim-prize directly on-chain. Payouts are owner-initiated — send STX regardless of claim status; tracking is off-chain.
            </p>
          </fieldset>
        ))}
      </div>
    </Window>
  );
}
