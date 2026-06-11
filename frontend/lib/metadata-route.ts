import { NextResponse } from "next/server";
import { scoreSvg } from "@/lib/metadata-svg";
import { rateLimit } from "@/lib/rate-limit";
import { redactSensitiveText } from "@/lib/telemetry";
import { fetchScoreLookup } from "@/lib/score-lookup";
import { formatScore } from "@/lib/score-format";

const RL_LIMIT = 60;
const RL_WINDOW_MS = 60_000;

export async function scoreMetadataResponseV3(
  req: Request,
  params: Promise<{ id: string }>,
) {
  const { id } = await params;
  const tokenId = Number(id);
  if (!Number.isFinite(tokenId) || tokenId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anon";
  const rl = rateLimit(`metadata:${ip}`, RL_LIMIT, RL_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limited" },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil((rl.resetAt - Date.now()) / 1000).toString(),
        },
      },
    );
  }

  try {
    const data = await fetchScoreLookup(tokenId);
    if (!data) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "public, max-age=60" } },
      );
    }

    const svg = scoreSvg({
      tokenId,
      score: data.score,
      playerName: data.playerName,
      rarity: data.rarity,
      gameName: data.gameName,
      gameId: data.gameId,
    });
    return NextResponse.json(
      {
        name: `${data.gameName} Score #${tokenId}`,
        description: `On-chain proof of a ${data.gameName} result: ${formatScore(data.gameId, data.score)}.`,
        image: "data:image/svg+xml;utf8," + encodeURIComponent(svg),
        attributes: [
          { trait_type: "Rarity", value: data.rarity },
          { trait_type: "Season", value: String(data.season) },
          { trait_type: "Score", value: String(data.score) },
          { trait_type: "Game", value: data.gameName },
        ],
      },
      {
        headers: {
          "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
        },
      },
    );
  } catch (e) {
    console.error(
      `[metadata-error] ${JSON.stringify({
        tokenId,
        message:
          e instanceof Error
            ? redactSensitiveText(e.message).slice(0, 300)
            : "lookup failed",
      })}`,
    );
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "lookup failed" },
      { status: 500 },
    );
  }
}
