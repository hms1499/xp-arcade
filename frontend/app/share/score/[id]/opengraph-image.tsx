import { ImageResponse } from "next/og";
import { fetchScoreLookup } from "@/lib/score-lookup";
import { GAME_BG } from "@/lib/score-card";
import { rarityColor } from "@/lib/metadata-svg";
import { GAMES } from "@/lib/game-registry";

export const alt = "XP Arcade score card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tokenId = Number(id);
  const data =
    Number.isInteger(tokenId) && tokenId > 0
      ? await fetchScoreLookup(tokenId).catch(() => null)
      : null;

  const bg = data ? GAME_BG[data.gameId] : "#1a1a2e";
  const accent = data ? rarityColor(data.rarity) : "#ffffff";
  const heading = data
    ? `${GAMES[data.gameId].emoji} ${data.gameName} Score Card`
    : "XP Arcade";

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
              flexGrow: 1,
              alignItems: "center",
              justifyContent: "space-between",
              background: "#efefef",
              border: "2px solid #808080",
              margin: "16px 8px 8px",
              padding: "12px 40px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 170, fontWeight: 700, color: "#111111" }}>
                {data ? data.score : "?"}
              </span>
              <span style={{ fontSize: 42, fontWeight: 700, color: accent }}>
                {data ? data.rarity : "Play. Mint. Climb."}
              </span>
              <span style={{ fontSize: 28, color: "#333333", marginTop: 10 }}>
                {data
                  ? `${data.playerName} · Season ${data.season}`
                  : "On-chain arcade scores"}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 190,
                height: 190,
                background: accent,
                fontSize: 112,
              }}
            >
              {data ? GAMES[data.gameId].emoji : "🕹️"}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "6px 12px",
              fontSize: 20,
              color: "#111111",
            }}
          >
            <span>Play. Mint. Climb the leaderboard.</span>
            <span>xp-snake.vercel.app</span>
          </div>
        </div>
      </div>
    ),
    { ...size, emoji: "twemoji" },
  );
}
