import { GAMES } from "@/lib/game-registry";
import { scoreMetadataResponse } from "@/lib/metadata-route";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return scoreMetadataResponse(req, params, {
    game: GAMES.breakout,
    gameName: "XP Bricks",
    descriptionGameName: "XP Bricks",
    rateLimitPrefix: "metadata-breakout",
  });
}
