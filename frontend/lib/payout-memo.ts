import type { GameId } from "./game-registry";

const VALID_GAMES: readonly GameId[] = ["snake", "tetris", "pacman"] as const;

export type PayoutMemoFields = {
  gameId: GameId;
  season: number;
  rank: number;
};

export function formatPayoutMemo(fields: PayoutMemoFields): string {
  return `xpa-${fields.gameId}-s${fields.season}-r${fields.rank}`;
}

const MEMO_RE = /^xpa-(snake|tetris|pacman)-s(\d+)-r(\d+)$/;

export function parsePayoutMemo(memo: string): PayoutMemoFields | null {
  const m = MEMO_RE.exec(memo);
  if (!m) return null;
  const [, gameId, seasonStr, rankStr] = m;
  if (!VALID_GAMES.includes(gameId as GameId)) return null;
  const season = Number(seasonStr);
  const rank = Number(rankStr);
  if (!Number.isInteger(season) || !Number.isInteger(rank)) return null;
  return { gameId: gameId as GameId, season, rank };
}
