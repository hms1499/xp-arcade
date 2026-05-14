import { NextResponse } from "next/server";
import { fetchCallReadOnlyFunction, cvToValue, uintCV } from "@stacks/transactions";
import { stacks } from "@/lib/stacks";
import { unwrap } from "@/lib/cv-unwrap";
import { scoreSvg } from "@/lib/metadata-svg";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tokenId = Number(id);
  if (!Number.isFinite(tokenId) || tokenId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
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
    const v = unwrap<null | {
      score: string;
      "player-name": string;
      rarity: string;
      season: string;
    }>(cvToValue(res));
    if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });

    const rarity = String(v.rarity ?? "Common");
    const season = Number(v.season ?? 1);
    const svg = scoreSvg({
      tokenId,
      score: Number(v.score),
      playerName: String(v["player-name"]),
      rarity,
    });
    return NextResponse.json({
      name: `Snake Score #${tokenId}`,
      description: `On-chain proof of a snake game score: ${v.score}.`,
      image: "data:image/svg+xml;utf8," + encodeURIComponent(svg),
      attributes: [
        { trait_type: "Rarity", value: rarity },
        { trait_type: "Season", value: String(season) },
        { trait_type: "Score", value: String(Number(v.score)) },
      ],
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "lookup failed" },
      { status: 500 }
    );
  }
}
