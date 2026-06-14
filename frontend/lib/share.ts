import { stacks } from "@/lib/stacks";
import { GAMES, type GameId } from "@/lib/game-registry";
import { fetchJson } from "@/lib/http";

export function scoreShareUrl(tokenId: number | null): string {
  return tokenId && tokenId > 0
    ? `${stacks.appUrl}/share/score/${tokenId}`
    : stacks.appUrl;
}

export function xIntentUrl(
  gameId: GameId,
  score: number,
  tokenId: number | null,
): string {
  const u = new URL("https://x.com/intent/post");
  u.searchParams.set(
    "text",
    `I scored ${score} in ${GAMES[gameId].label} on XP Arcade 🕹️`,
  );
  u.searchParams.set("url", scoreShareUrl(tokenId));
  return u.toString();
}

export function shareTitle(d: { gameName: string; score: number }): string {
  return `${d.gameName} — ${d.score} points · XP Arcade`;
}

export function shareDescription(d: {
  rarity: string;
  season: number;
}): string {
  return `${d.rarity} score NFT minted on Stacks · Season ${d.season} · Play and climb the on-chain leaderboard.`;
}

type TxEventsResponse = {
  events?: Array<{
    event_type?: string;
    asset?: {
      asset_event_type?: string;
      asset_id?: string;
      value?: { repr?: string };
    };
  }>;
};

// Resolves the freshly minted token id from the confirmed tx's NFT mint event.
export async function resolveMintedTokenId(
  txId: string,
  gameId: GameId,
): Promise<number | null> {
  const game = GAMES[gameId];
  const base = stacks.network.client?.baseUrl ?? "https://api.hiro.so";
  const data = await fetchJson<TxEventsResponse>(
    `${base}/extended/v1/tx/${txId}?event_limit=50`,
  ).catch(() => null);
  const assetId = `${game.contractAddress}.${game.contractName}::${game.nftAssetName}`;
  const mint = data?.events?.find(
    (e) =>
      e.event_type === "non_fungible_token_asset" &&
      e.asset?.asset_event_type === "mint" &&
      e.asset?.asset_id === assetId,
  );
  const repr = mint?.asset?.value?.repr;
  if (!repr || !/^u\d+$/.test(repr)) return null;
  return Number(repr.slice(1));
}

export function seasonShareUrl(gameId: GameId, season: number): string {
  return `${stacks.appUrl}/share/season/${gameId}/${season}`;
}

export function xSeasonIntentUrl(gameId: GameId, season: number): string {
  const u = new URL("https://x.com/intent/post");
  u.searchParams.set(
    "text",
    `${GAMES[gameId].emoji} ${GAMES[gameId].label} Season ${season} Hall of Fame on XP Arcade 🕹️`,
  );
  u.searchParams.set("url", seasonShareUrl(gameId, season));
  return u.toString();
}
