import { ImageResponse } from "next/og";
import { fetchSeasonLookup } from "@/lib/season-lookup";
import { GAME_BG } from "@/lib/score-card";
import { GAME_IDS, type GameId } from "@/lib/game-registry";
import { shortPlayer } from "@/lib/leaderboard-showcase";
import { formatScoreValue } from "@/lib/score-format";

export const alt = "XP Arcade Hall of Fame season card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function Image({
  params,
}: {
  params: Promise<{ game: string; season: string }>;
}) {
  const { game, season } = await params;
  const gameId = (GAME_IDS as string[]).includes(game) ? (game as GameId) : null;
  const seasonNum = Number(season);
  // Like the score image route: fall back to a generic branded card rather than
  // erroring — a generic unfurl beats a broken one.
  const data =
    gameId && Number.isInteger(seasonNum) && seasonNum > 0
      ? await fetchSeasonLookup(gameId, seasonNum).catch(() => null)
      : null;

  const bg = gameId ? GAME_BG[gameId] : "#1a1a2e";
  const heading = data
    ? `${data.emoji} ${data.gameName} · Season ${data.season}`
    : "XP Arcade";
  const rows = data ? data.rows.slice(0, 5) : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: `linear-gradient(135deg, ${bg}, #101010)`,
          padding: 54,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            background: "#c0c0c0",
            border: "3px solid #ffffff",
            borderRightColor: "#404040",
            borderBottomColor: "#404040",
            padding: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#000080",
              color: "#ffffff",
              padding: "10px 20px",
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            <span>{heading}</span>
            <span style={{ fontSize: 20, fontWeight: 400 }}>
              XP Arcade on Stacks
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flexGrow: 1,
              background: "#efefef",
              border: "2px solid #808080",
              margin: "16px 8px 8px",
              padding: "14px 40px",
            }}
          >
            <span
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: "#111111",
                marginBottom: 8,
              }}
            >
              {data ? `HALL OF FAME · TOP ${rows.length}` : "Play. Mint. Climb."}
            </span>
            {rows.map((r, i) => (
              <div
                key={r.player}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 40,
                  fontWeight: 700,
                  color: "#111111",
                  padding: "4px 0",
                }}
              >
                <span>
                  {MEDALS[i] ?? `#${r.rank}`} {shortPlayer(r.player)}
                </span>
                <span>{data ? formatScoreValue(data.gameId, r.score) : ""}</span>
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "6px 12px",
              fontSize: 22,
              color: "#111111",
            }}
          >
            <span>
              {data
                ? `Prize pool: ${(data.totalUstx / 1_000_000).toFixed(4)} STX`
                : "On-chain arcade scores"}
            </span>
            <span>xp-snake.vercel.app</span>
          </div>
        </div>
      </div>
    ),
    { ...size, emoji: "twemoji" },
  );
}
