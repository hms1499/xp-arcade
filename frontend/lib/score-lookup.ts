import { fetchCallReadOnlyFunction, cvToValue, uintCV } from "@stacks/transactions";
import { stacks } from "@/lib/stacks";
import { unwrap } from "@/lib/cv-unwrap";
import { GAMES, gameIdFromOnchainOrNull, type GameId } from "@/lib/game-registry";

type RawScoreData = {
  score: string;
  "player-name": string;
  rarity: string;
  season: string;
  "game-id": string;
};

export type ScoreLookup = {
  tokenId: number;
  gameId: GameId;
  gameName: string;
  score: number;
  playerName: string;
  rarity: string;
  season: number;
};

// Returns null for unknown tokens / unregistered games; throws on network errors
// so callers can distinguish 404 from 500.
export async function fetchScoreLookup(tokenId: number): Promise<ScoreLookup | null> {
  const res = await fetchCallReadOnlyFunction({
    network: stacks.network,
    contractAddress: stacks.contractAddress,
    contractName: stacks.contractName,
    functionName: "get-score-data",
    functionArgs: [uintCV(tokenId)],
    senderAddress: stacks.contractAddress,
  });
  const v = unwrap<null | RawScoreData>(cvToValue(res));
  if (!v) return null;
  const gameId = gameIdFromOnchainOrNull(Number(v["game-id"]));
  if (!gameId) return null;
  return {
    tokenId,
    gameId,
    gameName: GAMES[gameId].label,
    score: Number(v.score),
    playerName: String(v["player-name"]),
    rarity: String(v.rarity ?? "Common"),
    season: Number(v.season ?? 1),
  };
}
