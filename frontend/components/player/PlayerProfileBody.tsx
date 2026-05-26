"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { shortAddress } from "@/lib/stacks-address";
import { fetchAllScoreHoldings, scoreNftKey, type ScoreNft } from "@/lib/holdings";
import { rarityColor } from "@/lib/metadata-svg";
import { computePlayerStats, ustxToStx } from "@/lib/player-stats";
import { GAMES, type GameId } from "@/lib/game-registry";
import { PlayerStatsPanel } from "./PlayerStatsPanel";
import { RarityBreakdown } from "./RarityBreakdown";
import { CopyAddressButton } from "./CopyAddressButton";
import { useWallet } from "@/state/wallet";

type NftLoadState = {
  address: string;
  nfts: ScoreNft[] | null;
  error: string | null;
};

type ProfileFilter = "all" | GameId;

const RARITY_RANK: Record<string, number> = {
  Legendary: 4,
  Epic: 3,
  Rare: 2,
  Common: 1,
};

export function PlayerProfileBody({
  address,
  showBackToDesktop = false,
}: {
  address: string;
  showBackToDesktop?: boolean;
}) {
  const [loadState, setLoadState] = useState<NftLoadState | null>(null);
  const [filter, setFilter] = useState<ProfileFilter>("all");
  const walletAddress = useWallet((s) => s.address);

  useEffect(() => {
    let cancelled = false;
    fetchAllScoreHoldings(address)
      .then((list) => {
        if (cancelled) return;
        setLoadState({
          address,
          nfts: [...list].sort(
            (a, b) => (b.score ?? 0) - (a.score ?? 0) || b.id - a.id
          ),
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
  }, [address]);

  const activeState = loadState?.address === address ? loadState : null;
  const nfts = activeState?.nfts ?? null;
  const error = activeState?.error ?? null;
  const filteredNfts = useMemo(
    () => nfts?.filter((n) => filter === "all" || n.gameId === filter) ?? null,
    [nfts, filter],
  );
  const stats = useMemo(() => (nfts ? computePlayerStats(nfts) : null), [nfts]);
  const filteredStats = useMemo(
    () => (filteredNfts ? computePlayerStats(filteredNfts) : null),
    [filteredNfts],
  );
  const featuredNfts = useMemo(() => {
    if (!nfts) return null;
    return [...nfts]
      .sort(
        (a, b) =>
          (RARITY_RANK[b.rarity ?? ""] ?? 0) -
            (RARITY_RANK[a.rarity ?? ""] ?? 0) ||
          (b.score ?? 0) - (a.score ?? 0) ||
          b.id - a.id,
      )
      .slice(0, 3);
  }, [nfts]);

  return (
    <div className="p-2">
      {showBackToDesktop && (
        <Link href="/" className="text-xs text-blue-700 underline">
          ← Back to desktop
        </Link>
      )}
      <ProfileHeader
        address={address}
        isOwnProfile={walletAddress === address}
        totalMints={stats?.totalMints}
        bestScore={stats?.bestScore}
        topGame={stats ? topGameLabel(stats) : null}
      />

      {stats && nfts && nfts.length > 0 && (
        <>
          <PlayerStatsPanel stats={filteredStats ?? stats} />
          <GameBreakdown stats={stats} active={filter} onSelect={setFilter} />
          <RarityBreakdown counts={(filteredStats ?? stats).rarityCounts} />
          {featuredNfts && featuredNfts.length > 0 && filter === "all" && (
            <FeaturedNfts nfts={featuredNfts} />
          )}
        </>
      )}

      {nfts === null && !error && <ProfileLoading />}
      {error && <p className="text-red-700 text-xs">⚠️ {error}</p>}
      {nfts && nfts.length === 0 && (
        <ProfileEmpty isOwnProfile={walletAddress === address} />
      )}
      {filteredNfts && filteredNfts.length === 0 && (
        <div className="text-sm text-gray-700 border border-dashed border-gray-400 p-3 text-center">
          No score NFTs in this filter.
        </div>
      )}
      {filteredNfts && filteredNfts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {filteredNfts.map((n) => (
            <div
              key={scoreNftKey(n)}
              className="text-center text-xs border border-gray-300 p-1 bg-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={n.image} alt={n.name} className="w-full h-auto" />
              <div className="mt-1 truncate">{n.name}</div>
              {typeof n.score === "number" && (
                <div className="text-[10px] text-gray-700">
                  score {n.score}
                </div>
              )}
              {n.rarity && (
                <div
                  className="text-[9px] font-bold mt-0.5"
                  style={{ color: rarityColor(n.rarity) }}
                >
                  {n.rarity}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileLoading() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 52,
              background: "#e0e0e0",
              borderRadius: 3,
              animation: "shimmer 1.2s linear infinite",
            }}
          />
        ))}
      </div>
      <div
        style={{
          height: 96,
          background: "#e0e0e0",
          borderRadius: 3,
          animation: "shimmer 1.2s linear infinite",
        }}
      />
    </div>
  );
}

function ProfileEmpty({ isOwnProfile }: { isOwnProfile: boolean }) {
  return (
    <div
      className="text-sm text-gray-700 text-center"
      style={{
        border: "1px dashed #808080",
        background: "#f5f5f0",
        padding: 14,
      }}
    >
      <div className="font-bold mb-1">No score NFTs yet.</div>
      <div className="text-xs">
        {isOwnProfile
          ? "Play a game and mint a score to start filling this profile."
          : "This player has not minted a score NFT yet."}
      </div>
    </div>
  );
}

function FeaturedNfts({ nfts }: { nfts: ScoreNft[] }) {
  return (
    <section className="mb-3">
      <div
        className="text-[10px] uppercase text-gray-500 mb-1"
        style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
      >
        <span>Featured NFTs</span>
        <span>Top rarity, then score</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {nfts.map((nft) => {
          const game = GAMES[nft.gameId];
          return (
            <div
              key={scoreNftKey(nft)}
              className="border border-gray-300 bg-white p-1 text-xs"
              style={{
                display: "grid",
                gridTemplateColumns: "56px 1fr",
                gap: 6,
                alignItems: "center",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={nft.image} alt={nft.name} className="w-full h-auto" />
              <div style={{ minWidth: 0 }}>
                <div className="font-bold truncate">
                  {game.emoji} {nft.name}
                </div>
                {typeof nft.score === "number" && (
                  <div className="text-[10px] text-gray-700">
                    Score <b>{nft.score}</b>
                  </div>
                )}
                {nft.rarity && (
                  <div
                    className="text-[10px] font-bold"
                    style={{ color: rarityColor(nft.rarity) }}
                  >
                    {nft.rarity}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function topGameLabel(stats: ReturnType<typeof computePlayerStats>): string | null {
  const [topGame] = (Object.keys(GAMES) as GameId[])
    .map((id) => ({ id, bestScore: stats.byGame[id].bestScore }))
    .sort((a, b) => b.bestScore - a.bestScore);
  if (!topGame || topGame.bestScore === 0) return null;
  return GAMES[topGame.id].label;
}

function ProfileHeader({
  address,
  isOwnProfile,
  totalMints,
  bestScore,
  topGame,
}: {
  address: string;
  isOwnProfile: boolean;
  totalMints?: number;
  bestScore?: number;
  topGame: string | null;
}) {
  return (
    <div
      className="mb-3"
      style={{
        background: "#f5f5f0",
        border: "1px solid #d0d0c8",
        padding: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="text-[10px] uppercase text-gray-500">
            {isOwnProfile ? "My profile" : "Player profile"}
          </div>
          <h2 className="text-sm font-bold mb-1">
            Player {shortAddress(address)}
          </h2>
        </div>
        <div className="text-[10px] font-mono text-gray-700">
          <CopyAddressButton value={address} />
          <a
            href={`https://explorer.hiro.so/address/${address}?chain=${
              address.startsWith("SP") ? "mainnet" : "testnet"
            }`}
            target="_blank"
            rel="noreferrer"
            className="text-blue-700 underline ml-1"
          >
            Explorer ↗
          </a>
        </div>
      </div>
      <p className="text-[10px] font-mono text-gray-700 mb-2 break-all">
        {address}
      </p>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <ProfileChip label="NFTs" value={totalMints ?? "..."} />
        <ProfileChip label="Best" value={bestScore ?? "..."} />
        <ProfileChip label="Top game" value={topGame ?? "..."} />
      </div>
    </div>
  );
}

function ProfileChip({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <span
      className="text-[10px]"
      style={{
        display: "inline-flex",
        gap: 4,
        alignItems: "center",
        border: "1px solid #c0c0c0",
        background: "#ffffff",
        padding: "2px 6px",
      }}
    >
      <span className="text-gray-500">{label}</span>
      <b>{value}</b>
    </span>
  );
}

function GameBreakdown({
  stats,
  active,
  onSelect,
}: {
  stats: ReturnType<typeof computePlayerStats>;
  active: ProfileFilter;
  onSelect: (filter: ProfileFilter) => void;
}) {
  const filters: ProfileFilter[] = ["all", "snake", "tetris", "pacman"];
  return (
    <div className="mb-3">
      <div className="flex flex-wrap gap-1 mb-2">
        {filters.map((id) => {
          const label = id === "all" ? "All" : GAMES[id].label;
          const mints = id === "all" ? stats.totalMints : stats.byGame[id].totalMints;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              style={{ fontWeight: active === id ? "bold" : "normal" }}
            >
              {label} ({mints})
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
        {(Object.keys(GAMES) as GameId[]).map((id) => {
          const gameStats = stats.byGame[id];
          const selected = active === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className="text-left"
              style={{
                border: selected ? "2px solid #000080" : "1px solid #c0c0c0",
                background: selected ? "#eef3ff" : "#ffffff",
                padding: selected ? 7 : 8,
                fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
              }}
            >
              <div
                className="font-bold mb-1"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 6,
                }}
              >
                <span>
                  {GAMES[id].emoji} {GAMES[id].label}
                </span>
                <span style={{ color: gameStats.totalMints > 0 ? "#007700" : "#777" }}>
                  {gameStats.totalMints}
                </span>
              </div>
              {gameStats.totalMints > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 4,
                    color: "#555",
                  }}
                >
                  <span>Best</span>
                  <b style={{ textAlign: "right", color: "#000" }}>
                    {gameStats.bestScore}
                  </b>
                  <span>Seasons</span>
                  <b style={{ textAlign: "right", color: "#000" }}>
                    {gameStats.seasonsPlayed}
                  </b>
                  <span>Fees</span>
                  <b style={{ textAlign: "right", color: "#000" }}>
                    {ustxToStx(gameStats.mintFeesUstx)} STX
                  </b>
                </div>
              ) : (
                <div style={{ color: "#777" }}>No minted scores</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
