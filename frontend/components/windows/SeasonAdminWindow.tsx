"use client";
import { useCallback, useEffect, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { stacks } from "@/lib/stacks";
import { Window } from "./Window";
import {
  getCurrentSeasonForGame,
  getPrizePoolBalanceForGame,
  getSeasonPrizeForGame,
  hasClaimedPrizeForGame,
  endSeasonForGame,
  transferStx,
  computePayoutUstx,
} from "@/lib/contract-calls";
import { useToasts } from "@/state/toasts";
import { usePayoutLedger, type PayoutEntry } from "@/state/payout-ledger";
import { watchTx } from "@/lib/tx-tracker";
import { useSeasonCountdown, formatCountdown } from "@/lib/season-countdown";
import { GAMES, type GameId } from "@/lib/game-registry";
import { formatPayoutMemo } from "@/lib/payout-memo";
import { getStxBalance } from "@/lib/stx-balance";

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
  hasTies: boolean;
};

export function isOwnerAddress(addr: string | null): boolean {
  return !!addr && addr === stacks.contractAddress;
}

const EXPLORER = "https://explorer.hiro.so/txid";

function renderPayoutCell(args: {
  entry: PayoutEntry | undefined;
  busy: boolean;
  insufficient: boolean;
  onSend: () => void;
}) {
  const { entry, busy, insufficient, onSend } = args;
  if (!entry) {
    return (
      <button
        onClick={onSend}
        disabled={busy || insufficient}
        title={insufficient ? "Owner wallet balance is below this payout" : undefined}
      >
        {busy ? "…" : insufficient ? "Low balance" : "Send STX"}
      </button>
    );
  }
  if (entry.status === "pending") {
    return (
      <a href={`${EXPLORER}/${entry.txId}`} target="_blank" rel="noreferrer">
        ⏳ Pending
      </a>
    );
  }
  if (entry.status === "success") {
    return (
      <a href={`${EXPLORER}/${entry.txId}`} target="_blank" rel="noreferrer">
        ✓ Paid
      </a>
    );
  }
  return (
    <span>
      <button
        onClick={onSend}
        disabled={busy || insufficient}
        title={insufficient ? "Owner wallet balance is below this payout" : undefined}
      >
        {busy ? "…" : insufficient ? "Low balance" : "Retry"}
      </button>{" "}
      <a href={`${EXPLORER}/${entry.txId}`} target="_blank" rel="noreferrer" title="failed tx">
        ✗
      </a>
    </span>
  );
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
  const [gameId, setGameId] = useState<GameId>("snake");
  const ledgerEntries = usePayoutLedger((s) => s.entries);
  const [ownerBalance, setOwnerBalance] = useState<number | null>(null);

  const refreshOwnerBalance = useCallback(() => {
    if (!address) return;
    getStxBalance(address).then(setOwnerBalance);
  }, [address]);

  const loadPastSeasons = useCallback(
    async (cs: number, g: GameId) => {
      const results: SeasonView[] = [];
      for (let s = 1; s < cs; s++) {
        const snap = await getSeasonPrizeForGame(g, s);
        if (!snap) continue;
        const sorted = [...snap.topTen].sort((a, b) => b.score - a.score);
        // Match on-chain rank-fold: rank = 1 + count(entries with strictly greater score).
        // Ties share the same rank, identical to claim-prize behaviour.
        const rows: PayoutRow[] = await Promise.all(
          sorted.map(async (e) => {
            const rank = 1 + snap.topTen.filter((x) => x.score > e.score).length;
            return {
              player: e.player,
              rank,
              score: e.score,
              payoutUstx: computePayoutUstx(snap.total, rank),
              claimed: await hasClaimedPrizeForGame(g, e.player, s).catch(() => false),
            };
          }),
        );
        const scores = sorted.map((e) => e.score);
        const hasTies = new Set(scores).size < scores.length;
        results.push({ season: s, total: snap.total, rows, hasTies });
      }
      setSeasons(results);
    },
    [],
  );

  useEffect(() => {
    if (!w) return;
    setError(null);
    refreshOwnerBalance();
    Promise.all([
      getCurrentSeasonForGame(gameId),
      getPrizePoolBalanceForGame(gameId),
    ])
      .then(([cs, pool]) => {
        setCurrentSeason(cs);
        setAccumulated(pool);
        return loadPastSeasons(cs, gameId);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [w, gameId, loadPastSeasons, refreshOwnerBalance]);

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
    if (
      !confirm(
        `End the current ${gameId} season? This locks the snapshot and starts a new season.`,
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

  async function handlePay(row: PayoutRow, season: number) {
    const stxAmount = (row.payoutUstx / 1_000_000).toFixed(4);
    if (
      !confirm(
        `Send ${stxAmount} STX to ${row.player} for ${gameId} Season ${season} rank #${row.rank}?`,
      )
    )
      return;
    const key = `${season}-${row.player}`;
    setBusyPay(key);
    try {
      const memo = formatPayoutMemo({ gameId, season, rank: row.rank });
      const txId = await transferStx(row.player, row.payoutUstx, memo);
      usePayoutLedger.getState().submit(gameId, season, row.player, txId);
      useToasts.getState().push({
        title: "Payout submitted",
        body: `${stxAmount} STX → ${row.player.slice(0, 6)}… (watching…)`,
      });
      watchTx(txId, (s) => {
        if (s === "success") {
          usePayoutLedger.getState().updateStatus(gameId, season, row.player, "success");
          refreshOwnerBalance();
          useToasts.getState().push({
            title: "Payout confirmed",
            body: `${stxAmount} STX → ${row.player.slice(0, 6)}…`,
          });
        } else if (s !== "pending") {
          usePayoutLedger.getState().updateStatus(gameId, season, row.player, "failed");
          useToasts.getState().push({
            title: "Payout failed",
            body: `${stxAmount} STX → ${row.player.slice(0, 6)}… rejected.`,
          });
        }
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

        {seasons.length > 0 && (() => {
          const unpaidUstx = seasons.reduce((sum, s) => {
            return (
              sum +
              s.rows.reduce((rowSum, r) => {
                const entry = ledgerEntries[`${gameId}-${s.season}-${r.player}`];
                const settled = entry?.status === "success" || entry?.status === "pending";
                return settled ? rowSum : rowSum + r.payoutUstx;
              }, 0)
            );
          }, 0);
          const short = ownerBalance != null && ownerBalance < unpaidUstx;
          return (
            <p
              className="text-[10px] px-1 mb-2"
              style={{
                color: short ? "#aa0000" : "#000080",
                background: short ? "#ffe0e0" : "#eef0ff",
                border: `1px solid ${short ? "#cc8080" : "#9090c0"}`,
                padding: "4px",
              }}
            >
              Owner balance:{" "}
              <b>{ownerBalance != null ? (ownerBalance / 1_000_000).toFixed(4) : "…"} STX</b>
              {" · Unpaid total: "}
              <b>{(unpaidUstx / 1_000_000).toFixed(4)} STX</b>
              {short && " — wallet is short; top up before sending."}
            </p>
          );
        })()}

        {seasons.map((s) => (
          <fieldset key={s.season} className="mb-3">
            <legend>Season {s.season} · Pool {(s.total / 1_000_000).toFixed(4)} STX</legend>
            {s.hasTies && (
              <p
                className="text-[10px] px-1 mb-1"
                style={{ color: "#aa6600", background: "#fff8d6", border: "1px solid #e0c060", padding: "4px" }}
              >
                ⚠️ Tied scores detected. Tied players share the same rank and payout (matches on-chain
                claim-prize). Verify the table before sending — total disbursed may exceed 100% of pool.
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
                          {renderPayoutCell({
                            entry: ledgerEntries[`${gameId}-${s.season}-${r.player}`],
                            busy: busyPay === key,
                            insufficient:
                              ownerBalance != null && ownerBalance < r.payoutUstx,
                            onSend: () => handlePay(r, s.season),
                          })}
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
