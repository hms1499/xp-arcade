import type { Challenge } from "./challenge-link";
import type { ChallengeStatus } from "@/state/challenge";
import type { GameId } from "./game-registry";

export function shouldMarkMet(
  status: ChallengeStatus | null,
  challenge: Challenge | null,
  gameId: GameId,
  score: number,
  sessionBest: number,
): boolean {
  if (status !== "accepted" || !challenge || challenge.gameId !== gameId) return false;
  return score >= challenge.target || sessionBest >= challenge.target;
}
