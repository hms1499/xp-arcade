"use client";
import { useCallback, useEffect, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { useIsOwner } from "@/lib/owner";
import { Window } from "./Window";
import {
  getCurrentSeasonForGame,
  getPrizePoolBalanceForGame,
  getSeasonPrizeForGame,
  endSeasonForGame,
  getTopTenForGame,
  type TopEntry,
} from "@/lib/contract-calls";
import { buildPayoutRows } from "@/lib/payout-schedule";
import { useToasts } from "@/state/toasts";
import { watchTx } from "@/lib/tx-tracker";
import { useSeasonCountdown, formatCountdown } from "@/lib/season-countdown";
import { GAMES, type GameId } from "@/lib/game-registry";

type PayoutRow = {
  player: string;
  rank: number;
  score: number;
  payoutUstx: number;
};

type SeasonView = {
  season: number;
  total: number;
  rows: PayoutRow[];
  hasTies: boolean;
};

export function SeasonAdminWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "season-admin"));
  const address = useWallet((s) => s.address);
  const isOwner = useIsOwner(address);
  const [currentSeason, setCurrentSeason] = useState<number | null>(null);
  const [accumulated, setAccumulated] = useState<number | null>(null);
  const [currentTopTen, setCurrentTopTen] = useState<TopEntry[] | null>(null);
  const [seasons, setSeasons] = useState<SeasonView[]>([]);
  const [busyEnd, setBusyEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameId, setGameId] = useState<GameId>("snake");
  const countdown = useSeasonCountdown(gameId);

  const loadPastSeasons = useCallback(async (cs: number, g: GameId) => {
    const results: SeasonView[] = [];
    for (let s = 1; s < cs; s++) {
      const snap = await getSeasonPrizeForGame(g, s);
      if (!snap) continue;
      const ranked = buildPayoutRows(snap.total, snap.topTen);
      const rows: PayoutRow[] = ranked.map((e) => ({
        player: e.player,
        rank: e.rank,
        score: e.score,
        payoutUstx: e.payoutUstx,
      }));
      const scores = ranked.map((e) => e.score);
      const hasTies = new Set(scores).size < scores.length;
      results.push({ season: s, total: snap.total, rows, hasTies });
    }
    setSeasons(results);
  }, []);

  useEffect(() => {
    if (!w) return;
    Promise.all([
      getCurrentSeasonForGame(gameId),
      getPrizePoolBalanceForGame(gameId),
      getTopTenForGame(gameId),
    ])
      .then(([cs, pool, topTen]) => {
        setError(null);
        setCurrentSeason(cs);
        setAccumulated(pool);
        setCurrentTopTen([...topTen].sort((a, b) => b.score - a.score));
        return loadPastSeasons(cs, gameId);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [w, gameId, loadPastSeasons]);

  if (!w) return null;

  if (!isOwner) {
    return (
      <Window id={w.id} title="Season Admin" width={420}>
        <div className="p-3 text-xs">
          &#x26A0;&#xFE0F; This window is for the contract owner only.
          <div className="text-gray-500 mt-2">Connected: {address ?? "—"}</div>
        </div>
      </Window>
    );
  }

  const currentScores = currentTopTen?.map((e) => e.score) ?? [];
  const currentHasTies = currentScores.length > 1 && new Set(currentScores).size < currentScores.length;
  const currentCutoff = currentTopTen && currentTopTen.length >= 10 ? currentTopTen[9].score : null;
  const canEndSeason = currentSeason != null && accumulated != null && currentTopTen !== null;

  async function handleEndSeason() {
    const preflight = [
      `Season: ${currentSeason ?? "unknown"}`,
      `Pool: ${accumulated != null ? (accumulated / 1_000_000).toFixed(4) : "unknown"} STX`,
      `Ranked players: ${currentTopTen?.length ?? "unknown"}/10`,
      currentHasTies ? "Tied scores: yes" : "Tied scores: no",
    ].join("\n");
    if (
      !confirm(
        `End the current ${gameId} season?\n\n${preflight}\n\nThis locks the snapshot and starts a new season.`,
      )
    )
      return;
    setBusyEnd(true);
    try {
      const txId = await endSeasonForGame(gameId);
      useToasts.getState().push({
        title: "End-season submitted",
        body: "Watching for confirmation…",
      });
      watchTx(txId, (s) => {
        if (s === "success") {
          useToasts.getState().push({
            title: "Season closed",
            body: "Snapshot locked. Reloading…",
          });
          getCurrentSeasonForGame(gameId).then((cs) => {
            setCurrentSeason(cs);
            loadPastSeasons(cs, gameId);
          });
          getPrizePoolBalanceForGame(gameId).then(setAccumulated);
        } else if (s === "timeout") {
          useToasts.getState().push({
            title: "Confirmation delayed",
            body: "Check the end-season transaction in Explorer.",
          });
        } else if (s !== "pending") {
          useToasts.getState().push({
            title: "End-season failed",
            body: "Transaction rejected.",
          });
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "End season failed");
    } finally {
      setBusyEnd(false);
    }
  }

  return (
    <Window id={w.id} title="Season Admin" width={560}>
      <div className="p-2 text-xs">
        <div role="tablist" className="flex gap-1 mb-2">
          {(Object.keys(GAMES) as GameId[]).map((g) => (
            <button
              key={g}
              role="tab"
              aria-selected={gameId === g}
              onClick={() => setGameId(g)}
              style={{ fontWeight: gameId === g ? "bold" : "normal" }}
            >
              {GAMES[g].label}
            </button>
          ))}
        </div>

        {error && <p className="text-red-600 mb-2">&#x26A0;&#xFE0F; {error}</p>}

        <fieldset className="mb-3">
          <legend>Current Season</legend>
          <div className="flex justify-between items-center p-1">
            <div>
              Season <b>{currentSeason ?? "…"}</b> · Pool:{" "}
              <b>{accumulated != null ? (accumulated / 1_000_000).toFixed(4) : "…"} STX</b>
            </div>
            <button onClick={handleEndSeason} disabled={busyEnd || !canEndSeason}>
              {busyEnd ? "Closing…" : "End Season"}
            </button>
          </div>
          <div
            className="text-[10px] px-1 py-1 mb-1"
            style={{
              background: currentHasTies ? "#fff8d6" : "#eef0ff",
              border: `1px solid ${currentHasTies ? "#e0c060" : "#9090c0"}`,
              color: currentHasTies ? "#8a5a00" : "#000080",
              lineHeight: 1.4,
            }}
          >
            Preflight: top-10 <b>{currentTopTen ? `${currentTopTen.length}/10` : "..."}</b>
            {" · "}
            cutoff <b>{currentCutoff ?? "open"}</b>
            {" · "}
            ties <b>{currentHasTies ? "yes" : "no"}</b>
          </div>
          <p className="text-[10px] text-gray-500 px-1">
            Ending the season snapshots top-10 and pool total, then starts a fresh season.
          </p>
          {countdown.state !== "unset" && countdown.state !== "loading" && (
            <p
              className="text-[10px] px-1 mt-1"
              style={{
                color:
                  countdown.state === "iso-expired" || countdown.state === "reached"
                    ? "#cc0000"
                    : "#000080",
              }}
            >
              ⏳ Deadline: <b>{formatCountdown(countdown)}</b>
              {" · ~"}
              {countdown.endsAt.toLocaleString()}
              {countdown.state === "iso-expired" &&
                " — call End Season now to honour it."}
              {countdown.state === "reached" &&
                " — anyone can call End Season now."}
            </p>
          )}
        </fieldset>

        {seasons.length === 0 && (
          <p className="text-gray-500 italic">No past seasons yet — end the current one to create a snapshot.</p>
        )}

        {seasons.length > 0 && (
          <p className="text-[10px] text-gray-600 px-1 mb-2">
            Players claim their prizes directly on-chain via the contract. These snapshots are read-only.
          </p>
        )}

        {seasons.map((s) => (
          <fieldset key={s.season} className="mb-3">
            <legend>Season {s.season} · Pool {(s.total / 1_000_000).toFixed(4)} STX</legend>
            {s.hasTies && (
              <p
                className="text-[10px] px-1 mb-1"
                style={{ color: "#aa6600", background: "#fff8d6", border: "1px solid #e0c060", padding: "4px" }}
              >
                ⚠️ Tied scores detected. The payout schedule uses sorted row order.
              </p>
            )}
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
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r) => (
                    <tr key={r.player}>
                      <td>{r.rank}</td>
                      <td title={r.player}>{r.player.slice(0, 6)}…{r.player.slice(-4)}</td>
                      <td>{r.score}</td>
                      <td>{(r.payoutUstx / 1_000_000).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </fieldset>
        ))}
      </div>
    </Window>
  );
}
