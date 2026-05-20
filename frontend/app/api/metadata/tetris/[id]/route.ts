import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const tokenId = Number(id);
  if (!Number.isFinite(tokenId) || tokenId < 1) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return NextResponse.json({
    sip: 16,
    name: `Tetris Score #${tokenId}`,
    description: `On-chain proof of a Tetris game score.`,
    image: `${appUrl}/api/metadata/tetris/${tokenId}/image`,
    attributes: [
      { trait_type: "Game", value: "Tetris" },
      { trait_type: "Token ID", value: String(tokenId) },
    ],
  });
}
