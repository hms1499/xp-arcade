import { NextResponse } from "next/server";
import { fetchCallReadOnlyFunction, cvToValue, uintCV } from "@stacks/transactions";
import { stacks } from "@/lib/stacks";
import { unwrap } from "@/lib/cv-unwrap";
import { trophySvg } from "@/lib/metadata-svg";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const trophyId = Number(id);
  if (!Number.isFinite(trophyId) || trophyId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  try {
    const res = await fetchCallReadOnlyFunction({
      network: stacks.network,
      contractAddress: stacks.contractAddress,
      contractName: stacks.contractName,
      functionName: "get-trophy-data",
      functionArgs: [uintCV(trophyId)],
      senderAddress: stacks.contractAddress,
    });
    const v = unwrap<null | { rank: string; season: string }>(cvToValue(res));
    if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });

    const svg = trophySvg({
      trophyId,
      rank: Number(v.rank),
      season: Number(v.season),
    });
    return NextResponse.json({
      name: `Snake Trophy #${trophyId}`,
      description: `Trophy NFT for rank ${v.rank} in season ${v.season}.`,
      image: "data:image/svg+xml;utf8," + encodeURIComponent(svg),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "lookup failed" },
      { status: 500 }
    );
  }
}
