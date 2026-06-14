import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchSeasonLookup, type SeasonLookup } from "@/lib/season-lookup";
import { GAME_IDS, type GameId } from "@/lib/game-registry";
import { shortPlayer } from "@/lib/leaderboard-showcase";
import { formatScoreValue } from "@/lib/score-format";

// Closed seasons are immutable; the live season refreshes within ~5 min.
export const revalidate = 300;

function parseGameId(game: string): GameId | null {
  return (GAME_IDS as string[]).includes(game) ? (game as GameId) : null;
}

function parseSeason(season: string): number | null {
  const n = Number(season);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const lookupOrNull = cache(
  async (game: string, season: string): Promise<SeasonLookup | null> => {
    const gameId = parseGameId(game);
    const seasonNum = parseSeason(season);
    if (!gameId || !seasonNum) return null;
    return fetchSeasonLookup(gameId, seasonNum);
  },
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ game: string; season: string }>;
}): Promise<Metadata> {
  const { game, season } = await params;
  const data = await lookupOrNull(game, season);
  if (!data) return { title: "XP Arcade" };
  const title = `${data.gameName} — Season ${data.season} Hall of Fame · XP Arcade`;
  const description = `Top ${data.rows.length} on-chain scores · Prize pool ${(
    data.totalUstx / 1_000_000
  ).toFixed(4)} STX · Play and climb the leaderboard.`;
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary_large_image" },
  };
}

export default async function SeasonSharePage({
  params,
}: {
  params: Promise<{ game: string; season: string }>;
}) {
  const { game, season } = await params;
  const data = await lookupOrNull(game, season);
  if (!data) notFound();

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
      <div className="window" style={{ width: "min(460px, 100%)" }}>
        <div className="title-bar">
          <div className="title-bar-text">
            {data.emoji} {data.gameName} · Season {data.season}
            {data.status === "live" ? " (live)" : ""}
          </div>
        </div>
        <div className="window-body" style={{ display: "grid", gap: 8 }}>
          <div style={{ border: "2px inset #dfdfdf", background: "#fff", padding: "10px 12px" }}>
            {data.rows.slice(0, 10).map((r) => (
              <div
                key={r.player}
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px 1fr auto",
                  gap: 8,
                  padding: "3px 0",
                  borderTop: r.rank === 1 ? "none" : "1px solid #eee",
                }}
              >
                <b>#{r.rank}</b>
                <span style={{ fontFamily: "monospace", fontSize: 12 }}>
                  {shortPlayer(r.player)}
                </span>
                <b>{formatScoreValue(data.gameId, r.score)}</b>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#555", textAlign: "center" }}>
            Prize pool: {(data.totalUstx / 1_000_000).toFixed(4)} STX
          </div>
          <Link
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
          </Link>
        </div>
      </div>
    </main>
  );
}
