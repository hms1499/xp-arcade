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
import { useSeasonCountdown, formatCountdown } from "@/lib/season-countdown";
import { shortAddress } from "@/lib/stacks-address";

type Claimable = { season: number; rank: number; payoutUstx: number };

type RankSnapshot = Record<string, number>;

function loadSnapshot(): RankSnapshot {
  try {
    return JSON.parse(sessionStorage.getItem("lb-snapshot") ?? "{}");
  } catch {
    return {};
  }
}

function saveSnapshot(rows: { player: string; score: number }[]) {
  const snap: RankSnapshot = {};
  rows.forEach((r) => { snap[r.player] = r.score; });
  sessionStorage.setItem("lb-snapshot", JSON.stringify(snap));
}

function rankChange(player: string, currentRank: number, snapshot: RankSnapshot, sortedRows: { player: string; score: number }[]): "up" | "down" | "same" | "new" {
  if (!(player in snapshot)) return "new";
  const prevEntries = Object.entries(snapshot).sort((a, b) => b[1] - a[1]);
  const prevRank = prevEntries.findIndex(([addr]) => addr === player) + 1;
  if (prevRank === 0) return "new";
  if (currentRank < prevRank) return "up";
  if (currentRank > prevRank) return "down";
  return "same";
}

export function LeaderboardWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "leaderboard"));
  const address = useWallet((s) => s.address);
  const [rows, setRows] = useState<TopEntry[] | null>(null);
  const [snapshot, setSnapshot] = useState<RankSnapshot>(() => loadSnapshot());
  const [error, setError] = useState<string | null>(null);
  const [busyPrize, setBusyPrize] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [prizePool, setPrizePool] = useState<number | null>(null);
  const [currentSeason, setCurrentSeason] = useState<number | null>(null);
  const [claimable, setClaimable] = useState<Claimable[]>([]);
  const countdown = useSeasonCountdown();

  useEffect(() => {
    if (!w) return;

    function load() {
      getTopTen()
        .then((data) => {
          const sorted = [...data].sort((a, b) => b.score - a.score);
          setRows(sorted);
          setError(null);
          setLastUpdated(new Date());
          setSnapshot(loadSnapshot()); // read before saving
          saveSnapshot(sorted);
          // reset snapshot if season changed
          getCurrentSeason().then((season) => {
            const storedSeason = sessionStorage.getItem("lb-season");
            if (storedSeason && storedSeason !== String(season)) {
              sessionStorage.removeItem("lb-snapshot");
              setSnapshot({});
            }
            sessionStorage.setItem("lb-season", String(season));
          }).catch(() => {});
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
          {countdown.state !== "unset" && (
            <span
              style={{
                fontFamily: "monospace",
                color: countdown.state === "expired" ? "#cc0000" : "#000080",
              }}
              title={`Ends ${countdown.endsAt.toLocaleString()}`}
            >
              ⏳ {formatCountdown(countdown)}
            </span>
          )}
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

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {rows === null && !error && (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ height: 26, background: "#e0e0e0", borderRadius: 3, animation: "shimmer 1.2s linear infinite" }} />
              ))}
            </>
          )}
          {rows?.length === 0 && (
            <div style={{ textAlign: "center", color: "#888", fontSize: 11, padding: "12px 0" }}>
              No scores yet. Be the first!
            </div>
          )}
          {rows?.map((r, i) => {
            const rank = i + 1;
            const isMe = r.player === address;
            const change = rankChange(r.player, rank, snapshot, rows);
            const BADGE_BG: Record<number, string> = { 1: "#ffd700", 2: "#c0c0c0", 3: "#cd7f32" };
            const badgeBg = BADGE_BG[rank] ?? "#bbbbbb";
            const badgeColor = rank <= 3 ? (rank === 1 ? "#7a5c00" : rank === 2 ? "#444" : "#fff") : "#555";

            return (
              <div
                key={r.player}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 6px",
                  borderRadius: 3,
                  borderLeft: isMe ? "3px solid #f59e0b" : "3px solid transparent",
                  background: isMe ? "#fff8e1" : rank === 1 ? "#fffde7" : "transparent",
                  fontSize: 11,
                  fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
                }}
              >
                {/* Rank badge */}
                <div style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: badgeBg, color: badgeColor,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: "bold", flexShrink: 0,
                }}>
                  {rank}
                </div>

                {/* Address */}
                <div style={{ flex: 1 }}>
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      useWindows.getState().open("player-profile", { address: r.player });
                    }}
                    style={{
                      background: isMe ? "#fff3e0" : "#e3f2fd",
                      color: isMe ? "#e65100" : "#1565c0",
                      border: "none",
                      borderRadius: 10,
                      padding: "1px 7px",
                      fontSize: 10,
                      fontFamily: "monospace",
                      cursor: "pointer",
                    }}
                  >
                    {isMe ? "YOU" : `${r.player.slice(0, 5)}…${r.player.slice(-4)}`}
                  </button>
                </div>

                {/* Score */}
                <span style={{ fontWeight: "bold", minWidth: 36, textAlign: "right" }}>{r.score}</span>

                {/* Rank change */}
                <span style={{
                  fontSize: 9, width: 16, textAlign: "center",
                  color: change === "up" ? "#2e7d32" : change === "down" ? "#c62828" : "#aaa",
                }}>
                  {change === "up" ? "▲" : change === "down" ? "▼" : "–"}
                </span>
              </div>
            );
          })}
        </div>
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
