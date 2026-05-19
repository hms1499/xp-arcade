// frontend/components/shared/SharedLeaderboard.tsx
"use client";
import { useEffect, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { Window } from "@/components/windows/Window";
import { getTopTenForGame, type TopEntry } from "@/lib/contract-calls";
import { GAMES, type GameId } from "@/lib/game-registry";
import { useSeasonCountdown, formatCountdown } from "@/lib/season-countdown";

type RankSnapshot = Record<string, number>;

function loadSnapshot(gameId: GameId): RankSnapshot {
  try {
    return JSON.parse(sessionStorage.getItem(`lb-snapshot-${gameId}`) ?? "{}");
  } catch {
    return {};
  }
}

function saveSnapshot(gameId: GameId, rows: TopEntry[]) {
  const snap: RankSnapshot = {};
  rows.forEach((r) => { snap[r.player] = r.score; });
  sessionStorage.setItem(`lb-snapshot-${gameId}`, JSON.stringify(snap));
}

function rankChange(
  player: string,
  currentRank: number,
  snapshot: RankSnapshot,
): "up" | "down" | "same" | "new" {
  if (!(player in snapshot)) return "new";
  const prevEntries = Object.entries(snapshot).sort((a, b) => b[1] - a[1]);
  const prevRank = prevEntries.findIndex(([addr]) => addr === player) + 1;
  if (prevRank === 0) return "new";
  if (currentRank < prevRank) return "up";
  if (currentRank > prevRank) return "down";
  return "same";
}

export function SharedLeaderboard({ gameId }: { gameId: GameId }) {
  const game = GAMES[gameId];
  const w = useWindows((s) =>
    s.windows.find((win) => win.type === `leaderboard-${gameId}`)
  );
  const address = useWallet((s) => s.address);
  const [rows, setRows] = useState<TopEntry[] | null>(null);
  const [snapshot, setSnapshot] = useState<RankSnapshot>(() =>
    typeof window !== "undefined" ? loadSnapshot(gameId) : {}
  );
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const countdown = useSeasonCountdown();

  useEffect(() => {
    if (!w) return;

    function load() {
      getTopTenForGame(gameId)
        .then((data) => {
          const sorted = [...data].sort((a, b) => b.score - a.score);
          setRows(sorted);
          setError(null);
          setLastUpdated(new Date());
          setSnapshot(loadSnapshot(gameId));
          saveSnapshot(gameId, sorted);
        })
        .catch((e) =>
          setError(e instanceof Error ? e.message : "Load failed")
        );
    }

    setRows(null);
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [w, gameId]);

  if (!w) return null;

  const myRank =
    address && rows
      ? rows.findIndex((r) => r.player === address) + 1
      : 0;

  const BADGE_BG: Record<number, string> = {
    1: "#ffd700",
    2: "#c0c0c0",
    3: "#cd7f32",
  };

  return (
    <Window id={w.id} title={`${game.emoji} ${game.label} — High Scores`} width={420}>
      <div className="p-2">
        {error && (
          <p className="text-red-600 text-xs mb-2">⚠️ {error}</p>
        )}
        {countdown.state !== "unset" && (
          <div className="flex justify-end mb-1">
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 11,
                color: countdown.state === "expired" ? "#cc0000" : "#000080",
              }}
              title={`Ends ${countdown.endsAt.toLocaleString()}`}
            >
              ⏳ {formatCountdown(countdown)}
            </span>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {rows === null && !error &&
            [0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  height: 26,
                  background: "#e0e0e0",
                  borderRadius: 3,
                  animation: "shimmer 1.2s linear infinite",
                }}
              />
            ))}
          {rows?.length === 0 && (
            <div
              style={{
                textAlign: "center",
                color: "#888",
                fontSize: 11,
                padding: "12px 0",
              }}
            >
              No scores yet. Be the first!
            </div>
          )}
          {rows?.map((r, i) => {
            const rank = i + 1;
            const isMe = r.player === address;
            const change = rankChange(r.player, rank, snapshot);
            const badgeBg = BADGE_BG[rank] ?? "#bbbbbb";
            const badgeColor =
              rank <= 3
                ? rank === 1
                  ? "#7a5c00"
                  : rank === 2
                  ? "#444"
                  : "#fff"
                : "#555";

            return (
              <div
                key={r.player}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 6px",
                  borderRadius: 3,
                  borderLeft: isMe
                    ? "3px solid #f59e0b"
                    : "3px solid transparent",
                  background: isMe
                    ? "#fff8e1"
                    : rank === 1
                    ? "#fffde7"
                    : "transparent",
                  fontSize: 11,
                  fontFamily:
                    '"Pixelated MS Sans Serif", Arial, sans-serif',
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: badgeBg,
                    color: badgeColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    fontWeight: "bold",
                    flexShrink: 0,
                  }}
                >
                  {rank}
                </div>
                <div style={{ flex: 1 }}>
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      useWindows
                        .getState()
                        .open("player-profile", { address: r.player });
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
                    {isMe
                      ? "YOU"
                      : `${r.player.slice(0, 5)}…${r.player.slice(-4)}`}
                  </button>
                </div>
                <span
                  style={{
                    fontWeight: "bold",
                    minWidth: 36,
                    textAlign: "right",
                  }}
                >
                  {r.score}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    width: 16,
                    textAlign: "center",
                    color:
                      change === "up"
                        ? "#2e7d32"
                        : change === "down"
                        ? "#c62828"
                        : "#aaa",
                  }}
                >
                  {change === "up" ? "▲" : change === "down" ? "▼" : "–"}
                </span>
              </div>
            );
          })}
        </div>
        {lastUpdated && (
          <p className="text-[9px] text-gray-400 mt-1 text-right">
            Updated{" "}
            {lastUpdated.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}{" "}
            · auto-refresh 30s
            {myRank > 0 && <> · Your rank: #{myRank}</>}
          </p>
        )}
      </div>
    </Window>
  );
}
