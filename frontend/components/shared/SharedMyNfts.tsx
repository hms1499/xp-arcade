// frontend/components/shared/SharedMyNfts.tsx
"use client";
import { useEffect, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { Window } from "@/components/windows/Window";
import { fetchScoreHoldings, type ScoreNft } from "@/lib/holdings";
import { rarityColor } from "@/lib/metadata-svg";
import { GAMES, type GameId } from "@/lib/game-registry";

export function SharedMyNfts({ gameId }: { gameId: GameId }) {
  const game = GAMES[gameId];
  const contractId = `${game.contractAddress}.${game.contractName}`;
  const w = useWindows((s) =>
    s.windows.find((win) => win.type === `mynfts-${gameId}`)
  );
  const address = useWallet((s) => s.address);
  const [nfts, setNfts] = useState<ScoreNft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!w || !address) return;
    setNfts(null);
    setError(null);
    fetchScoreHoldings(address, "", contractId)
      .then(setNfts)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [w, address, contractId]);

  if (!w) return null;

  return (
    <Window id={w.id} title={`${game.emoji} My ${game.label} NFTs`} width={480}>
      <div className="p-2">
        {address && (
          <div className="mb-2 text-right">
            <button
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
        )}
        {!address && (
          <p className="text-sm">Connect your wallet to see your NFTs.</p>
        )}
        {address && nfts === null && !error && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
              gap: 8,
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: 72,
                  background: "#e0e0e0",
                  borderRadius: 3,
                  animation: "shimmer 1.2s linear infinite",
                }}
              />
            ))}
          </div>
        )}
        {error && (
          <p className="text-xs text-red-600">⚠️ {error}</p>
        )}
        {nfts?.length === 0 && (
          <p className="text-sm text-gray-500">
            No {game.label} NFTs yet. Play and mint a score!
          </p>
        )}
        {nfts && nfts.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
              gap: 8,
            }}
          >
            {nfts.map((nft) => (
              <div
                key={nft.id}
                style={{
                  border: "1px solid #ccc",
                  borderRadius: 3,
                  overflow: "hidden",
                  fontSize: 10,
                  textAlign: "center",
                }}
              >
                <img
                  src={nft.image}
                  alt={nft.name}
                  style={{ width: "100%", display: "block" }}
                />
                <div
                  style={{
                    padding: "2px 4px",
                    color: nft.rarity ? rarityColor(nft.rarity) : undefined,
                  }}
                >
                  {nft.score ?? nft.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Window>
  );
}
