import { NextResponse } from "next/server";
import { fetchCallReadOnlyFunction, cvToValue, uintCV } from "@stacks/transactions";
import { stacks } from "@/lib/stacks";
import { unwrap } from "@/lib/cv-unwrap";
import { scoreSvg } from "@/lib/metadata-svg";
import { rateLimit } from "@/lib/rate-limit";
import { GAMES, gameIdFromOnchainOrNull } from "@/lib/game-registry";

const RL_LIMIT = 60;
const RL_WINDOW_MS = 60_000;

type ScoreData = {
  score: string;
  "player-name": string;
  rarity: string;
  season: string;
  "game-id": string;
};

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
    const res = await fetchCallReadOnlyFunction({
      network: stacks.network,
      contractAddress: stacks.contractAddress,
      contractName: stacks.contractName,
      functionName: "get-score-data",
      functionArgs: [uintCV(tokenId)],
      senderAddress: stacks.contractAddress,
    });
    const v = unwrap<null | ScoreData>(cvToValue(res));
    if (!v) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "public, max-age=60" } },
      );
    }

    const gameId = gameIdFromOnchainOrNull(Number(v["game-id"]));
    if (!gameId) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "public, max-age=60" } },
      );
    }
    const gameName = GAMES[gameId].label;
    const rarity = String(v.rarity ?? "Common");
    const season = Number(v.season ?? 1);
    const svg = scoreSvg({
      tokenId,
      score: Number(v.score),
      playerName: String(v["player-name"]),
      rarity,
      gameName,
    });
    return NextResponse.json(
      {
        name: `${gameName} Score #${tokenId}`,
        description: `On-chain proof of a ${gameName} game score: ${v.score}.`,
        image: "data:image/svg+xml;utf8," + encodeURIComponent(svg),
        attributes: [
          { trait_type: "Rarity", value: rarity },
          { trait_type: "Season", value: String(season) },
          { trait_type: "Score", value: String(Number(v.score)) },
          { trait_type: "Game", value: gameName },
        ],
      },
      {
        headers: {
          "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "lookup failed" },
      { status: 500 },
    );
  }
}
