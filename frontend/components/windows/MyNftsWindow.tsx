"use client";
import { useEffect, useMemo, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { Window } from "@/components/windows/Window";
import { fetchAllScoreHoldings, scoreNftKey, type ScoreNft } from "@/lib/holdings";
import { rarityColor } from "@/lib/metadata-svg";
import { GAMES, type GameId } from "@/lib/game-registry";

const GAME_BADGE_BG: Record<string, string> = {
  snake: "#d4edda",
  tetris: "#d1ecf1",
  pacman: "#fff3cd",
};
const GAME_BADGE_COLOR: Record<string, string> = {
  snake: "#155724",
  tetris: "#0c5460",
  pacman: "#856404",
};

type NftLoadState = {
  address: string;
  nfts: ScoreNft[] | null;
  error: string | null;
};

type GameFilter = "all" | GameId;
type RarityFilter = "all" | string;
type SortMode = "score-desc" | "newest" | "game" | "season-desc";

const GAME_FILTERS: GameFilter[] = ["all", "snake", "tetris", "pacman"];
const SORT_LABELS: Record<SortMode, string> = {
  "score-desc": "Highest score",
  newest: "Newest",
  game: "Game",
  "season-desc": "Season",
};

function filterLabel(gameId: GameFilter) {
  if (gameId === "all") return "All";
  const game = GAMES[gameId];
  return `${game.emoji} ${game.label}`;
}

export function MyNftsWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "mynfts"));
  const address = useWallet((s) => s.address);
  const [loadState, setLoadState] = useState<NftLoadState | null>(null);
  const [gameFilter, setGameFilter] = useState<GameFilter>("all");
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("score-desc");

  useEffect(() => {
    if (!w || !address) return;
    let cancelled = false;
    fetchAllScoreHoldings(address)
      .then((list) => {
        if (cancelled) return;
        setLoadState({
          address,
          nfts: [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.id - a.id),
          error: null,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadState({
          address,
          nfts: null,
          error: e instanceof Error ? e.message : "Load failed",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [w, address]);

  const activeState = loadState?.address === address ? loadState : null;
  const nfts = activeState?.nfts ?? null;
  const error = activeState?.error ?? null;
  const rarityOptions = useMemo(() => {
    if (!nfts) return [];
    return Array.from(new Set(nfts.map((nft) => nft.rarity).filter(Boolean) as string[]))
      .sort((a, b) => a.localeCompare(b));
  }, [nfts]);
  const visibleNfts = useMemo(() => {
    if (!nfts) return null;
    const filtered = nfts.filter((nft) => {
      const matchesGame = gameFilter === "all" || nft.gameId === gameFilter;
      const matchesRarity = rarityFilter === "all" || nft.rarity === rarityFilter;
      return matchesGame && matchesRarity;
    });
    return [...filtered].sort((a, b) => {
      if (sortMode === "newest") {
        return b.id - a.id || a.gameId.localeCompare(b.gameId);
      }
      if (sortMode === "game") {
        return a.gameId.localeCompare(b.gameId) || (b.score ?? 0) - (a.score ?? 0);
      }
      if (sortMode === "season-desc") {
        return (b.season ?? 0) - (a.season ?? 0) || (b.score ?? 0) - (a.score ?? 0);
      }
      return (b.score ?? 0) - (a.score ?? 0) || b.id - a.id;
    });
  }, [nfts, gameFilter, rarityFilter, sortMode]);
  const filtersActive = gameFilter !== "all" || rarityFilter !== "all";

  if (!w) return null;

  return (
    <Window id={w.id} title="💾 My NFTs" width={480}>
      <div className="p-2">
        {address && (
          <>
            <div
              className="mb-2"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {GAME_FILTERS.map((id) => (
                  <button
                    type="button"
                    aria-pressed={gameFilter === id}
                    key={id}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setGameFilter(id);
                    }}
                    style={{
                      fontSize: 10,
                      fontWeight: gameFilter === id ? "bold" : "normal",
                    }}
                  >
                    {filterLabel(id)}
                  </button>
                ))}
                <select
                  aria-label="Filter by rarity"
                  value={rarityFilter}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => setRarityFilter(e.target.value)}
                  style={{
                    height: 22,
                    fontSize: 10,
                    fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
                  }}
                >
                  <option value="all">All rarity</option>
                  {rarityOptions.map((rarity) => (
                    <option key={rarity} value={rarity}>
                      {rarity}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Sort NFTs"
                  value={sortMode}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  style={{
                    height: 22,
                    fontSize: 10,
                    fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
                  }}
                >
                  {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                    <option key={mode} value={mode}>
                      {SORT_LABELS[mode]}
                    </option>
                  ))}
                </select>
                {filtersActive && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setGameFilter("all");
                      setRarityFilter("all");
                    }}
                    style={{ fontSize: 10 }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  useWindows.getState().open("player-profile", { address });
                }}
                className="text-xs"
              >
                Open my profile
              </button>
            </div>
            {nfts && (
              <div
                className="mb-2 text-[10px] text-gray-500"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  borderTop: "1px solid #d0d0c8",
                  paddingTop: 4,
                }}
              >
                <span>
                  Showing <b>{visibleNfts?.length ?? 0}</b> of <b>{nfts.length}</b>
                </span>
                <span>Sorted by {SORT_LABELS[sortMode].toLowerCase()}</span>
              </div>
            )}
          </>
        )}
        {!address && (
          <p className="text-sm">Connect your wallet to see your NFTs.</p>
        )}
        {address && nfts === null && !error && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
              gap: 8,
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: 96,
                  background: "#e0e0e0",
                  borderRadius: 3,
                  animation: "shimmer 1.2s linear infinite",
                }}
              />
            ))}
          </div>
        )}
        {error && <p className="text-xs text-red-600">⚠️ {error}</p>}
        {nfts?.length === 0 && (
          <p className="text-sm text-gray-500">
            No NFTs yet. Play a game and mint a score!
          </p>
        )}
        {nfts && nfts.length > 0 && visibleNfts?.length === 0 && (
          <div
            className="text-sm text-gray-500"
            style={{
              textAlign: "center",
              padding: "18px 8px",
              border: "1px solid #d0d0c8",
              background: "#f5f5f0",
            }}
          >
            <p className="mb-2">No NFTs match these filters.</p>
            <button
              type="button"
              onClick={() => {
                setGameFilter("all");
                setRarityFilter("all");
              }}
            >
              Clear filters
            </button>
          </div>
        )}
        {visibleNfts && visibleNfts.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))",
              gap: 8,
            }}
          >
            {visibleNfts.map((nft) => (
              <NftCard key={scoreNftKey(nft)} nft={nft} />
            ))}
          </div>
        )}
      </div>
    </Window>
  );
}

function NftCard({ nft }: { nft: ScoreNft }) {
  const game = GAMES[nft.gameId];
  return (
    <div
      style={{
        border: "1px solid #ccc",
        borderRadius: 3,
        overflow: "hidden",
        fontSize: 10,
        background: "#fff",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={nft.image}
        alt={nft.name}
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          objectFit: "cover",
          display: "block",
          borderBottom: "1px solid #d0d0d0",
        }}
      />
      <div style={{ padding: "5px 6px", display: "grid", gap: 4 }}>
        <div
          className="truncate"
          title={nft.name}
          style={{ fontWeight: "bold", minWidth: 0 }}
        >
          {nft.name}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 6,
          }}
        >
          <span style={{ color: "#555" }}>Score</span>
          <b style={{ fontSize: 16, color: "#000080" }}>
            {typeof nft.score === "number" ? nft.score : "?"}
          </b>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-block",
              padding: "1px 5px",
              borderRadius: 8,
              fontSize: 9,
              background: GAME_BADGE_BG[nft.gameId] ?? "#eee",
              color: GAME_BADGE_COLOR[nft.gameId] ?? "#333",
            }}
          >
            {game.emoji} {game.label}
          </span>
          {nft.rarity && (
            <span
              style={{
                display: "inline-block",
                padding: "1px 5px",
                border: "1px solid #d0d0d0",
                fontSize: 9,
                color: rarityColor(nft.rarity),
                fontWeight: "bold",
              }}
            >
              {nft.rarity}
            </span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 4,
            color: "#666",
            fontSize: 9,
            borderTop: "1px solid #eeeeee",
            paddingTop: 3,
          }}
        >
          <span>#{nft.id}</span>
          <span>{typeof nft.season === "number" ? `Season ${nft.season}` : "Season ?"}</span>
        </div>
      </div>
    </div>
  );
}
