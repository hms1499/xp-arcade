import { NextResponse } from "next/server";
import { fetchCallReadOnlyFunction, cvToValue, uintCV } from "@stacks/transactions";
import { stacks } from "@/lib/stacks";
import { scoreSvg } from "@/lib/metadata-svg";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
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
    const v = cvToValue(res) as null | { score: bigint; "player-name": string };
    if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });

    const svg = scoreSvg({
      tokenId,
      score: Number(v.score),
      playerName: String(v["player-name"]),
    });
    return NextResponse.json({
      name: `Snake Score #${tokenId}`,
      description: `On-chain proof of a snake game score: ${v.score}.`,
      image: "data:image/svg+xml;utf8," + encodeURIComponent(svg),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "lookup failed" },
      { status: 500 }
    );
  }
}
