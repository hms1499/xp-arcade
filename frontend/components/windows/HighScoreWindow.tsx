"use client";
import { useEffect, useRef, useState } from "react";
import { useWindows, type WindowEntry } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { Window } from "@/components/windows/Window";
import {
  getBestScoreForGame,
  getCurrentSeasonForGame,
  getPrizePoolBalanceForGame,
  getTopTenForGame,
  claimPrizeV3,
  endSeasonForGame,
  type TopEntry,
} from "@/lib/contract-calls";
import { findClaimablePrizes, classifyClaimTx, type Claim } from "@/lib/claimable-prizes";
import { watchTx } from "@/lib/tx-tracker";
import { useToasts } from "@/state/toasts";
import { GAME_IDS, GAMES, type GameId } from "@/lib/game-registry";
import { formatScoreValue } from "@/lib/score-format";
import { useSeasonCountdown, formatCountdown } from "@/lib/season-countdown";
import { markSeasonEnded, wasSeasonEnded } from "@/lib/ended-seasons";
import { stacks } from "@/lib/stacks";

const BADGE_BG: Record<number, string> = { 1: "#ffd700", 2: "#c0c0c0", 3: "#cd7f32" };

type RankSnapshot = Record<string, number>;
type LeaderboardLoadState = {
  gameId: GameId;
  rows: TopEntry[] | null;
  season: number | null;
  playerBest: number | null;
  poolUstx: number | null;
  snapshot: RankSnapshot;
  error: string | null;
  lastUpdated: Date | null;
};
type ClaimLoadState = {
  key: string;
  claims: Claim[];
  checked: boolean;
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
  const countdown = useSeasonCountdown(gameId);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyEnd, setBusyEnd] = useState(false);

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
        getPrizePoolBalanceForGame(gameId).catch(() => null),
      ])
        .then(([data, season, playerBest, poolUstx]) => {
          const sorted = [...data].sort((a, b) => b.score - a.score);
          const previousSnapshot = loadSnapshot(gameId);
          saveSnapshot(gameId, sorted);
          setLoadState({
            gameId,
            rows: sorted,
            season,
            playerBest,
            poolUstx,
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
            poolUstx: null,
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
  }, [isActive, gameId, address, reloadKey]);

  async function handlePermissionlessEnd() {
    if (
      !confirm(
        `The on-chain deadline for ${GAMES[gameId].label} has passed.\n\n` +
          "End this season now? This locks the top-10 snapshot and opens prize claims. " +
          "Anyone may do this — no owner needed.\n\n" +
          "Note: the deadline block is in the past and is NOT reset on close, so a " +
          "freshly-opened season can be closed again immediately. Only proceed if " +
          "this is the intended contest close.",
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
          if (countdown.state === "reached") {
            markSeasonEnded(gameId, countdown.endBlock);
          }
          useToasts.getState().push({
            title: "Season closed",
            body: "Snapshot locked. Refreshing…",
          });
          setReloadKey((k) => k + 1);
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
      useToasts.getState().push({
        title: "End-season failed",
        body: e instanceof Error ? e.message : "Could not submit.",
      });
    } finally {
      setBusyEnd(false);
    }
  }

  const activeState = loadState?.gameId === gameId ? loadState : null;
  const rows = activeState?.rows ?? null;
  const snapshot = activeState?.snapshot ?? {};
  const error = activeState?.error ?? null;
  const lastUpdated = activeState?.lastUpdated ?? null;
  const season = activeState?.season ?? null;
  const playerBest = activeState?.playerBest ?? null;
  const poolUstx = activeState?.poolUstx ?? null;

  const claimKey = `${gameId}:${address ?? "guest"}:${season ?? "loading"}`;
  const [claimState, setClaimState] = useState<ClaimLoadState>({
    key: "",
    claims: [],
    checked: false,
  });
  const [claimingSeason, setClaimingSeason] = useState<number | null>(null);
  const claimWatchRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (!address || !season) {
        if (!cancelled) setClaimState({ key: claimKey, claims: [], checked: true });
        return;
      }
      const found = await findClaimablePrizes(gameId, address, season);
      if (!cancelled) {
        setClaimState({ key: claimKey, claims: found, checked: true });
      }
    })().catch(() => {
      if (!cancelled) {
        setClaimState({ key: claimKey, claims: [], checked: true });
      }
    });
    return () => { cancelled = true; };
  }, [address, season, gameId, claimKey]);

  // Stop any in-flight claim watcher if the window unmounts.
  useEffect(() => () => claimWatchRef.current?.(), []);

  const myRank =
    address && rows ? rows.findIndex((r) => r.player === address) + 1 : 0;
  const cutoff = rows && rows.length >= 10 ? rows[9].score : null;
  const pointsNeeded =
    address && rows && myRank === 0 && cutoff !== null && playerBest !== null
      ? Math.max(0, cutoff - playerBest + 1)
      : null;
  const claims =
    claimState.key === claimKey && claimState.checked ? claimState.claims : [];
  const claimsChecked = claimState.key === claimKey && claimState.checked;

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
          {claims.map((c) =>
            c.claimOpen ? (
            <button
              key={c.season}
              disabled={claimingSeason !== null}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={async (e) => {
                e.stopPropagation();
                setClaimingSeason(c.season);
                let txId: string;
                try {
                  txId = await claimPrizeV3(gameId, c.season, c.amountUstx);
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  if (msg !== "cancelled") {
                    useToasts.getState().push({
                      title: "Claim failed",
                      body: msg,
                      type: "error",
                    });
                  }
                  setClaimingSeason(null);
                  return;
                }
                // Keep the button in "Confirming..." until the tx settles. The
                // season is removed only on confirmed success; an on-chain abort
                // (e.g. post-condition) restores the button so the player retries.
                claimWatchRef.current?.();
                claimWatchRef.current = watchTx(txId, (status) => {
                  const outcome = classifyClaimTx(status);
                  if (outcome === "pending") return;
                  claimWatchRef.current?.();
                  claimWatchRef.current = null;
                  setClaimingSeason(null);
                  if (outcome === "confirmed") {
                    setClaimState((prev) => ({
                      ...prev,
                      claims: prev.claims.filter((x) => x.season !== c.season),
                    }));
                    useToasts.getState().push({
                      title: "Prize received",
                      body: `Season ${c.season} payout has arrived in your wallet.`,
                      type: "success",
                    });
                  } else if (outcome === "timeout") {
                    useToasts.getState().push({
                      title: "Confirmation delayed",
                      body: `Season ${c.season} claim may still confirm. Check Explorer before retrying.`,
                      type: "info",
                    });
                  } else {
                    useToasts.getState().push({
                      title: "Claim failed",
                      body: `Season ${c.season} claim was rejected on-chain. You can try again.`,
                      type: "error",
                    });
                  }
                });
              }}
              style={{
                marginTop: 3,
                justifySelf: "start",
                fontSize: 10,
                fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
                cursor: claimingSeason === c.season ? "wait" : "default",
              }}
            >
              {claimingSeason === c.season
                ? "Confirming..."
                : `Claim ${(c.amountUstx / 1_000_000).toFixed(2)} STX · Season ${c.season}`}
            </button>
            ) : (
              <span
                key={c.season}
                style={{
                  marginTop: 3,
                  justifySelf: "start",
                  fontSize: 10,
                  fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
                  opacity: 0.7,
                }}
              >
                Claim window closed · Season {c.season}
              </span>
            ),
          )}
          {claims.length === 0 && (
            <span
              style={{
                marginTop: 3,
                justifySelf: "start",
                fontSize: 10,
                opacity: 0.8,
              }}
            >
              {!address
                ? "Connect wallet to check claimable prizes."
                : !claimsChecked
                ? "Checking claimable prizes..."
                : season === 1
                ? "Claiming opens after this season ends."
                : "No claimable prizes for this game."}
            </span>
          )}
        </div>
        <div style={{ display: "grid", gap: 2, textAlign: "right" }}>
          <span style={{ color: "#006400" }}>
            Pool{" "}
            <b>
              {poolUstx === null
                ? "..."
                : `${(poolUstx / 1_000_000).toFixed(2)} STX`}
            </b>
          </span>
          <span>
            {cutoff !== null ? <>Cutoff <b>{formatScoreValue(gameId, cutoff)}</b></> : "Open top-10"}
          </span>
          {countdown.state !== "unset" && countdown.state !== "loading" && (
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 11,
                color:
                  countdown.state === "iso-expired" || countdown.state === "reached"
                    ? "#cc0000"
                    : "#000080",
              }}
              title={`~${countdown.endsAt.toLocaleString()}`}
            >
              ⏳ {formatCountdown(countdown)}
            </span>
          )}
        </div>
      </div>
      {countdown.state === "reached" &&
        !wasSeasonEnded(gameId, countdown.endBlock) && (
        <div className="mb-2 px-1">
          <button
            type="button"
            disabled={!address || busyEnd}
            onClick={handlePermissionlessEnd}
            title={
              !address
                ? "Connect a wallet to end the season"
                : "The deadline block has passed — anyone can close this season"
            }
          >
            {busyEnd ? "Ending…" : "End Season (deadline reached)"}
          </button>
          <p className="text-[10px] text-gray-600 mt-1">
            The on-chain deadline has passed. Any wallet can close this season to
            unlock prize claims.
          </p>
        </div>
        )}
      <details
        className="text-[10px] mb-2 px-1 py-1"
        style={{
          background: "#eef6ff",
          border: "1px solid #8aa7c7",
          color: "#34495e",
          lineHeight: 1.4,
        }}
      >
        <summary style={{ cursor: "pointer", fontWeight: "bold", color: "#000080" }}>
          Prize rules & on-chain verification
        </summary>
        <div style={{ padding: "5px 3px 2px" }}>
          Scores are client-submitted. Mint fees fund this game&apos;s season pool
          on Stacks {stacks.networkName}. Positions 1-3 receive 20% each;
          positions 4-10 receive about 5.71% each. Tied scores split the
          combined value of their occupied positions.
          <span className="block mt-1">
            Winners claim directly from the contract during the claim window.{" "}
            <a
              href={`https://explorer.hiro.so/address/${GAMES[gameId].contractAddress}.${GAMES[gameId].contractName}?chain=mainnet`}
              target="_blank"
              rel="noreferrer"
            >
              Verify contract
            </a>
          </span>
        </div>
      </details>
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
                {formatScoreValue(gameId, r.score)}
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
