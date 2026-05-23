import { GAMES } from "@/lib/game-registry";
import { scoreMetadataResponse } from "@/lib/metadata-route";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return scoreMetadataResponse(req, params, {
    game: GAMES.pacman,
    gameName: "Pac-Man",
    descriptionGameName: "Pac-Man",
    rateLimitPrefix: "metadata-pacman",
  });
}
