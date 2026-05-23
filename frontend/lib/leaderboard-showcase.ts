import { scoreSvg } from "@/lib/metadata-svg";
import type { TopEntry } from "@/lib/contract-calls";
import type { GameId } from "@/lib/game-registry";

export type RankedEntry = TopEntry & {
  rank: number;
};

export type LeaderboardSummary = {
  gameId: GameId;
  rows: RankedEntry[];
  leader: RankedEntry | null;
  topThree: RankedEntry[];
  cutoff: RankedEntry | null;
};

export type LeaderboardChange =
  | {
      kind: "new-leader";
      player: string;
      score: number;
      previousRank: number | null;
    }
  | {
      kind: "new-entry";
      player: string;
      score: number;
      rank: number;
    }
  | {
      kind: "score-up";
      player: string;
      score: number;
      previousScore: number;
      rank: number;
    };

export function shortPlayer(player: string): string {
  return player.length > 12 ? `${player.slice(0, 5)}…${player.slice(-4)}` : player;
}

export function scoreRarity(score: number): "Common" | "Rare" | "Epic" | "Legendary" {
  if (score >= 1000) return "Legendary";
  if (score >= 500) return "Epic";
  if (score >= 167) return "Rare";
  return "Common";
}

export function rankRows(rows: TopEntry[]): RankedEntry[] {
  return [...rows]
    .sort((a, b) => b.score - a.score || a.player.localeCompare(b.player))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function summarizeLeaderboard(
  gameId: GameId,
  rows: TopEntry[],
): LeaderboardSummary {
  const ranked = rankRows(rows);
  return {
    gameId,
    rows: ranked,
    leader: ranked[0] ?? null,
    topThree: ranked.slice(0, 3),
    cutoff: ranked.length >= 10 ? ranked[9] : null,
  };
}

export function findTopTenChange(
  previousRows: TopEntry[],
  nextRows: TopEntry[],
): LeaderboardChange | null {
  const previous = rankRows(previousRows);
  const next = rankRows(nextRows);
  if (previous.length === 0 || next.length === 0) return null;

  const previousByPlayer = new Map(previous.map((row) => [row.player, row]));
  const nextLeader = next[0];
  const previousLeader = previous[0];
  const previousLeaderRecord = previousByPlayer.get(nextLeader.player);

  if (nextLeader.player !== previousLeader.player) {
    return {
      kind: "new-leader",
      player: nextLeader.player,
      score: nextLeader.score,
      previousRank: previousLeaderRecord?.rank ?? null,
    };
  }

  const newEntry = next.find((row) => !previousByPlayer.has(row.player));
  if (newEntry) {
    return {
      kind: "new-entry",
      player: newEntry.player,
      score: newEntry.score,
      rank: newEntry.rank,
    };
  }

  const improved = next.find((row) => {
    const prev = previousByPlayer.get(row.player);
    return prev && row.score > prev.score;
  });
  if (improved) {
    return {
      kind: "score-up",
      player: improved.player,
      score: improved.score,
      previousScore: previousByPlayer.get(improved.player)!.score,
      rank: improved.rank,
    };
  }

  return null;
}

export function scoreCardImage(entry: RankedEntry, gameName: string): string {
  const svg = scoreSvg({
    tokenId: entry.rank,
    score: entry.score,
    playerName: shortPlayer(entry.player),
    rarity: scoreRarity(entry.score),
    gameName,
  });
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
