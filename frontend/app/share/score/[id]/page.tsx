import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchScoreLookup, type ScoreLookup } from "@/lib/score-lookup";
import { shareTitle, shareDescription } from "@/lib/share";
import { rarityColor } from "@/lib/metadata-svg";
import { GAMES } from "@/lib/game-registry";

// Minted score data is immutable; cache aggressively. If the build rejects
// this export (e.g. cacheComponents mode), drop it — correctness is unaffected.
export const revalidate = 86400;

function parseTokenId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Request-memoized: generateMetadata and the page share one chain read.
// Network errors intentionally propagate (500) so crawlers don't cache a 404
// for a valid, immutable token.
const lookupOrNull = cache(async (id: string): Promise<ScoreLookup | null> => {
  const tokenId = parseTokenId(id);
  if (!tokenId) return null;
  return fetchScoreLookup(tokenId);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await lookupOrNull(id);
  if (!data) return { title: "XP Arcade" };
  return {
    title: shareTitle(data),
    description: shareDescription(data),
    openGraph: {
      title: shareTitle(data),
      description: shareDescription(data),
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function ScoreSharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await lookupOrNull(id);
  if (!data) notFound();
  const game = GAMES[data.gameId];

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "#008080",
      }}
    >
      <div className="window" style={{ width: "min(420px, 100%)" }}>
        <div className="title-bar">
          <div className="title-bar-text">
            {game.emoji} {data.gameName} Score Card
          </div>
        </div>
        <div className="window-body" style={{ display: "grid", gap: 8 }}>
          <div
            style={{
              border: "2px inset #dfdfdf",
              background: "#fff",
              padding: "18px 12px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 12, color: "#555" }}>Score</div>
            <div style={{ fontSize: 48, fontWeight: "bold", color: "#000080" }}>
              {data.score}
            </div>
            <div style={{ fontWeight: "bold", color: rarityColor(data.rarity) }}>
              {data.rarity}
            </div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>
              {data.playerName} · Season {data.season} · Token #{data.tokenId}
            </div>
          </div>
          <a
            href="/"
            style={{
              textAlign: "center",
              padding: "6px 10px",
              fontWeight: "bold",
              background: "#c0c0c0",
              border: "2px outset #dfdfdf",
              color: "#000",
              textDecoration: "none",
            }}
          >
            🕹️ Play XP Arcade
          </a>
        </div>
      </div>
    </main>
  );
}
