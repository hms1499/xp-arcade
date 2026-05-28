"use client";
import { useEffect, useRef, useState } from "react";
import { useWindows, type WindowEntry } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { Window } from "@/components/windows/Window";
import {
  getBestScoreForGame,
  getCurrentSeasonForGame,
  getTopTenForGame,
  getSeasonPrizeForGame,
  hasClaimedPrizeForGame,
  claimPrizeV3,
  computePayoutUstx,
  type TopEntry,
} from "@/lib/contract-calls";
import { useToasts } from "@/state/toasts";
import { GAME_IDS, GAMES, type GameId } from "@/lib/game-registry";
import { useSeasonCountdown, formatCountdown } from "@/lib/season-countdown";

const BADGE_BG: Record<number, string> = { 1: "#ffd700", 2: "#c0c0c0", 3: "#cd7f32" };

type RankSnapshot = Record<string, number>;
type LeaderboardLoadState = {
  gameId: GameId;
  rows: TopEntry[] | null;
  season: number | null;
  playerBest: number | null;
  snapshot: RankSnapshot;
  error: string | null;
  lastUpdated: Date | null;
};

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

function LeaderboardTab({
  gameId,
  isActive,
  address,
}: {
  gameId: GameId;
  isActive: boolean;
  address: string | null;
}) {
  const [loadState, setLoadState] = useState<LeaderboardLoadState | null>(null);
  const countdown = useSeasonCountdown();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isActive) return;

    function load() {
      Promise.all([
        getTopTenForGame(gameId),
        getCurrentSeasonForGame(gameId).catch(() => null),
        address
          ? getBestScoreForGame(gameId, address)
              .then((best) => best?.score ?? 0)
              .catch(() => null)
          : Promise.resolve(null),
      ])
        .then(([data, season, playerBest]) => {
          const sorted = [...data].sort((a, b) => b.score - a.score);
          const previousSnapshot = loadSnapshot(gameId);
          saveSnapshot(gameId, sorted);
          setLoadState({
            gameId,
            rows: sorted,
            season,
            playerBest,
            snapshot: previousSnapshot,
            error: null,
            lastUpdated: new Date(),
          });
        })
        .catch((e) => {
          setLoadState({
            gameId,
            rows: null,
            season: null,
            playerBest: null,
            snapshot: typeof window !== "undefined" ? loadSnapshot(gameId) : {},
            error: e instanceof Error ? e.message : "Load failed",
            lastUpdated: null,
          });
        });
    }

    load();
    timerRef.current = setInterval(load, 30_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, gameId, address]);

  const activeState = loadState?.gameId === gameId ? loadState : null;
  const rows = activeState?.rows ?? null;
  const snapshot = activeState?.snapshot ?? {};
  const error = activeState?.error ?? null;
  const lastUpdated = activeState?.lastUpdated ?? null;
  const season = activeState?.season ?? null;
  const playerBest = activeState?.playerBest ?? null;

  const [claim, setClaim] = useState<null | { season: number; amountUstx: number }>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!address || !season || season <= 1) { setClaim(null); return; }
    const closed = season - 1;
    let cancelled = false;
    (async () => {
      const [prize, already] = await Promise.all([
        getSeasonPrizeForGame(gameId, closed),
        hasClaimedPrizeForGame(gameId, address, closed),
      ]);
      if (cancelled || !prize || already) { setClaim(null); return; }
      const mine = prize.topTen.find((e) => e.player === address);
      if (!mine) { setClaim(null); return; }
      const higher = prize.topTen.filter((e) => e.score > mine.score).length;
      const rank = higher + 1;
      setClaim({ season: closed, amountUstx: computePayoutUstx(prize.total, rank) });
    })().catch(() => { if (!cancelled) setClaim(null); });
    return () => { cancelled = true; };
  }, [address, season, gameId]);

  const myRank =
    address && rows ? rows.findIndex((r) => r.player === address) + 1 : 0;
  const cutoff = rows && rows.length >= 10 ? rows[9].score : null;
  const pointsNeeded =
    address && rows && myRank === 0 && cutoff !== null && playerBest !== null
      ? Math.max(0, cutoff - playerBest + 1)
      : null;

  return (
    <div>
      {error && <p className="text-red-600 text-xs mb-2">⚠️ {error}</p>}
      <div
        className="text-[10px] mb-2"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 8,
          alignItems: "center",
          background: "#f5f5f0",
          border: "1px solid #d0d0c8",
          padding: "5px 6px",
          color: "#555",
        }}
      >
        <div style={{ display: "grid", gap: 2 }}>
          <span>
            Season <b>{season ?? "..."}</b>
            {rows && <> · {rows.length}/10 ranked</>}
          </span>
          <span>
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}`
              : "Loading live scores"}
            {myRank > 0 && <> · Your rank: #{myRank}</>}
          </span>
          {claim && (
            <button
              disabled={claiming}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={async (e) => {
                e.stopPropagation();
                setClaiming(true);
                try {
                  await claimPrizeV3(gameId, claim.season, claim.amountUstx);
                  setClaim(null);
                  useToasts.getState().push({
                    title: "Claim submitted",
                    body: `Prize for season ${claim.season} is on its way.`,
                    type: "success",
                  });
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  if (msg !== "cancelled") {
                    useToasts.getState().push({
                      title: "Claim failed",
                      body: msg,
                      type: "error",
                    });
                  }
                } finally {
                  setClaiming(false);
                }
              }}
              style={{
                marginTop: 3,
                justifySelf: "start",
                fontSize: 10,
                fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
                cursor: claiming ? "wait" : "default",
              }}
            >
              {claiming
                ? "Claiming..."
                : `Claim ${(claim.amountUstx / 1_000_000).toFixed(2)} STX`}
            </button>
          )}
        </div>
        <div style={{ display: "grid", gap: 2, textAlign: "right" }}>
          <span>
            {cutoff !== null ? <>Cutoff <b>{cutoff}</b></> : "Open top-10"}
          </span>
          {countdown.state !== "unset" && (
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
          )}
        </div>
      </div>
      {address && rows && myRank === 0 && (
        <p
          className="text-[9px] text-gray-600 mb-2 px-1 py-1"
          style={{ background: "#fff8e1", border: "1px solid #d7b35a", lineHeight: 1.3 }}
        >
          {cutoff === null
            ? "Any minted score will enter this leaderboard."
            : playerBest === null
            ? "Current best could not be read."
            : pointsNeeded === 0
            ? "Your current best is enough to enter; mint a qualifying run to update your row."
            : `You need ${pointsNeeded} more point${pointsNeeded === 1 ? "" : "s"} than your current best to enter top 10.`}
        </p>
      )}
      {gameId === "snake" && (
        <details
          className="text-[9px] text-gray-500 mb-2 px-1 py-1"
          style={{ background: "#f5f5f0", border: "1px solid #d0d0c8", lineHeight: 1.3 }}
        >
          <summary
            style={{
              cursor: "pointer",
              color: "#555",
            }}
          >
            Snake rarity note
          </summary>
          Snake&apos;s 20×20 grid caps practical scores around 400. A Rare Snake
          NFT is roughly as hard to earn as an Epic in Tetris or Pac-Man. Tiers
          reflect achievement within each game, not cross-game equivalence.
        </details>
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
            No scores yet.
          </div>
        )}
        {rows?.map((r, i) => {
          const rank = i + 1;
          const isMe = r.player === address;
          const change = rankChange(r.player, rank, snapshot);
          const badgeBg = BADGE_BG[rank] ?? "#bbbbbb";
          const badgeColor =
            rank <= 3 ? (rank === 1 ? "#7a5c00" : rank === 2 ? "#444" : "#fff") : "#555";

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
              <span style={{ fontWeight: "bold", minWidth: 36, textAlign: "right" }}>
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
    </div>
  );
}

export function HighScoreWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "highscore"));
  const address = useWallet((s) => s.address);

  if (!w) return null;

  return <HighScoreContent key={w.id} w={w} address={address} />;
}

function HighScoreContent({
  w,
  address,
}: {
  w: WindowEntry;
  address: string | null;
}) {
  const [activeTab, setActiveTab] = useState<GameId>(
    () => w.payload?.initialTab ?? "snake",
  );

  return (
    <Window id={w.id} title="🏆 High Scores" width={460}>
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #999",
          padding: "4px 4px 0",
          background: "#c0c0c0",
        }}
      >
        {GAME_IDS.map((id) => {
          const game = GAMES[id];
          const active = id === activeTab;
          return (
            <button
              key={id}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setActiveTab(id);
              }}
              style={{
                padding: "3px 12px",
                marginRight: 2,
                border: "1px solid #808080",
                borderBottom: active ? "1px solid #c0c0c0" : "1px solid #808080",
                background: active ? "#c0c0c0" : "#a8a8a8",
                fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
                fontSize: 11,
                cursor: "default",
                fontWeight: active ? "bold" : "normal",
                position: "relative",
                top: active ? 1 : 0,
                zIndex: active ? 1 : 0,
              }}
            >
              {game.emoji} {game.label}
            </button>
          );
        })}
      </div>
      <div className="p-2">
        {GAME_IDS.map((id) => (
          <div key={id} style={{ display: id === activeTab ? "block" : "none" }}>
            <LeaderboardTab gameId={id} isActive={id === activeTab} address={address} />
          </div>
        ))}
      </div>
    </Window>
  );
}
