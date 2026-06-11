"use client";
import { useEffect, useMemo, useState } from "react";
import { Window } from "@/components/windows/Window";
import { useWindows } from "@/state/window-manager";
import {
  getCurrentSeasonForGame,
  getSeasonPrizeForGame,
  getTopTenForGame,
  type TopEntry,
} from "@/lib/contract-calls";
import { GAME_IDS, GAMES, type GameId } from "@/lib/game-registry";
import { formatScoreValue } from "@/lib/score-format";
import { rankRows, scoreRarity, shortPlayer } from "@/lib/leaderboard-showcase";
import { rarityColor } from "@/lib/metadata-svg";

type SeasonSnapshot = {
  gameId: GameId;
  season: number;
  status: "current" | "closed";
  totalUstx: number | null;
  rows: TopEntry[];
};

type LoadState =
  | { status: "loading"; snapshots: SeasonSnapshot[]; error: null }
  | { status: "ready"; snapshots: SeasonSnapshot[]; error: null }
  | { status: "error"; snapshots: SeasonSnapshot[]; error: string };

function formatStx(ustx: number | null): string {
  if (ustx === null) return "Live";
  return `${(ustx / 1_000_000).toFixed(4)} STX`;
}

function seasonLabel(snapshot: SeasonSnapshot): string {
  return snapshot.status === "current"
    ? `Season ${snapshot.season} live`
    : `Season ${snapshot.season}`;
}

async function loadHallOfFame(): Promise<SeasonSnapshot[]> {
  const byGame = await Promise.all(
    GAME_IDS.map(async (gameId) => {
      const currentSeason = await getCurrentSeasonForGame(gameId);
      const liveRows = await getTopTenForGame(gameId);
      const closedSeasonIds = Array.from(
        { length: Math.max(0, currentSeason - 1) },
        (_, index) => currentSeason - 1 - index,
      ).slice(0, 5);
      const closed = await Promise.all(
        closedSeasonIds.map(async (season): Promise<SeasonSnapshot | null> => {
          const prize = await getSeasonPrizeForGame(gameId, season).catch(() => null);
          if (!prize || prize.topTen.length === 0) return null;
          return {
            gameId,
            season,
            status: "closed" as const,
            totalUstx: prize.total,
            rows: prize.topTen,
          };
        }),
      );
      const closedSnapshots = closed.filter(
        (snapshot): snapshot is SeasonSnapshot => snapshot !== null,
      );

      return [
        {
          gameId,
          season: currentSeason,
          status: "current" as const,
          totalUstx: null,
          rows: liveRows,
        },
        ...closedSnapshots,
      ];
    }),
  );

  return byGame.flat();
}

export function HallOfFameWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "hall-of-fame"));
  const [state, setState] = useState<LoadState>({
    status: "loading",
    snapshots: [],
    error: null,
  });
  const [activeGame, setActiveGame] = useState<GameId | "all">("all");

  useEffect(() => {
    if (!w) return;
    let cancelled = false;
    loadHallOfFame()
      .then((snapshots) => {
        if (!cancelled) setState({ status: "ready", snapshots, error: null });
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: "error",
            snapshots: [],
            error: error instanceof Error ? error.message : "Could not load Hall of Fame",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [w]);

  const snapshots = useMemo(() => {
    const rows =
      activeGame === "all"
        ? state.snapshots
        : state.snapshots.filter((snapshot) => snapshot.gameId === activeGame);
    return rows.sort(
      (a, b) =>
        b.season - a.season ||
        GAME_IDS.indexOf(a.gameId) - GAME_IDS.indexOf(b.gameId),
    );
  }, [activeGame, state.snapshots]);

  if (!w) return null;

  const leaders = snapshots
    .map((snapshot) => {
      const leader = rankRows(snapshot.rows)[0];
      return leader ? { snapshot, leader } : null;
    })
    .filter((entry): entry is { snapshot: SeasonSnapshot; leader: TopEntry & { rank: number } } => entry !== null);

  return (
    <Window id={w.id} title="🎖️ Hall of Fame" width={560}>
      <div className="p-2" style={{ fontSize: 11 }}>
        <div
          style={{
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <button
            onClick={() => setActiveGame("all")}
            style={{ fontWeight: activeGame === "all" ? "bold" : "normal" }}
          >
            All Games
          </button>
          {GAME_IDS.map((gameId) => (
            <button
              key={gameId}
              onClick={() => setActiveGame(gameId)}
              style={{ fontWeight: activeGame === gameId ? "bold" : "normal" }}
            >
              {GAMES[gameId].emoji} {GAMES[gameId].label}
            </button>
          ))}
        </div>

        {state.status === "loading" && (
          <p style={{ color: "#555", marginBottom: 8 }}>Loading season records...</p>
        )}
        {state.error && (
          <p className="text-red-600" style={{ marginBottom: 8 }}>
            {state.error}
          </p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 6,
            marginBottom: 10,
          }}
        >
          {leaders.slice(0, 3).map(({ snapshot, leader }) => {
            const game = GAMES[snapshot.gameId];
            const rarity = scoreRarity(leader.score, snapshot.gameId);
            return (
              <div
                key={`${snapshot.gameId}-${snapshot.season}-hero`}
                style={{
                  border: "1px solid #808080",
                  background: "#f5f5f0",
                  padding: 7,
                  minHeight: 84,
                }}
              >
                <div style={{ color: "#555", marginBottom: 4 }}>
                  {game.emoji} {seasonLabel(snapshot)}
                </div>
                <div style={{ fontSize: 18, fontWeight: "bold" }}>{formatScoreValue(snapshot.gameId, leader.score)}</div>
                <button
                  onClick={() =>
                    useWindows.getState().open("player-profile", { address: leader.player })
                  }
                  style={{
                    fontFamily: "monospace",
                    fontSize: 10,
                    padding: "1px 4px",
                    marginTop: 3,
                  }}
                >
                  {shortPlayer(leader.player)}
                </button>
                <div style={{ color: rarityColor(rarity), marginTop: 4 }}>{rarity}</div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {snapshots.map((snapshot) => {
            const game = GAMES[snapshot.gameId];
            const ranked = rankRows(snapshot.rows);
            return (
              <section
                key={`${snapshot.gameId}-${snapshot.season}-${snapshot.status}`}
                style={{
                  border: "1px solid #999",
                  background: "#ffffff",
                }}
              >
                <header
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 8,
                    alignItems: "center",
                    background: "#c0c0c0",
                    borderBottom: "1px solid #999",
                    padding: "4px 6px",
                    fontWeight: "bold",
                  }}
                >
                  <span>
                    {game.emoji} {game.label} · {seasonLabel(snapshot)}
                  </span>
                  <span style={{ color: "#555", fontWeight: "normal" }}>
                    {formatStx(snapshot.totalUstx)}
                  </span>
                </header>
                {ranked.length === 0 ? (
                  <div style={{ padding: 10, color: "#777", textAlign: "center" }}>
                    No minted scores yet.
                  </div>
                ) : (
                  <div style={{ display: "grid" }}>
                    {ranked.slice(0, 10).map((row) => {
                      const rarity = scoreRarity(row.score, snapshot.gameId);
                      return (
                        <div
                          key={`${snapshot.gameId}-${snapshot.season}-${row.player}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "28px 1fr 54px 70px",
                            gap: 6,
                            alignItems: "center",
                            padding: "4px 6px",
                            borderTop: row.rank === 1 ? "none" : "1px solid #eee",
                            background: row.rank === 1 ? "#fff8d6" : "#fff",
                          }}
                        >
                          <b>#{row.rank}</b>
                          <button
                            onClick={() =>
                              useWindows.getState().open("player-profile", {
                                address: row.player,
                              })
                            }
                            style={{
                              justifySelf: "start",
                              fontFamily: "monospace",
                              fontSize: 10,
                              padding: "1px 5px",
                            }}
                          >
                            {shortPlayer(row.player)}
                          </button>
                          <b style={{ textAlign: "right" }}>{formatScoreValue(snapshot.gameId, row.score)}</b>
                          <span style={{ color: rarityColor(rarity), textAlign: "right" }}>
                            {rarity}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {state.status === "ready" && snapshots.length === 0 && (
          <p style={{ color: "#777", textAlign: "center", padding: 12 }}>
            No season records are available yet.
          </p>
        )}
      </div>
    </Window>
  );
}
