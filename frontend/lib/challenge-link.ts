import { GAME_IDS, type GameId } from "./game-registry";
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

export function parseChallengeParams(sp: URLSearchParams): Challenge | null {
  const game = sp.get("challenge");
  if (!game || !(GAME_IDS as readonly string[]).includes(game)) return null;

  const raw = sp.get("score");
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const target = Number(raw);
  if (!Number.isInteger(target) || target < 1 || target > MAX_CHALLENGE_SCORE)
    return null;

  const by = sp.get("by");
  return {
    gameId: game as GameId,
    target,
    by: by && isStacksAddress(by) ? by : undefined,
  };
}
