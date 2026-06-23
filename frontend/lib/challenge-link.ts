import { type GameId } from "./game-registry";
import { isStacksAddress } from "./stacks-address";
import { stacks } from "./stacks";

export type Challenge = { gameId: GameId; target: number; by?: string };

/** On-chain MAX-SCORE cap — the largest target a challenge may carry. */
export const MAX_CHALLENGE_SCORE = 9999;

export function buildChallengeUrl(c: {
  gameId: GameId;
  score: number;
  by?: string;
}): string {
  const u = new URL(stacks.appUrl);
  u.searchParams.set("challenge", c.gameId);
  u.searchParams.set("score", String(c.score));
  if (c.by && isStacksAddress(c.by)) u.searchParams.set("by", c.by);
  return u.toString();
}
