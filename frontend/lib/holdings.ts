import { stacks } from "./stacks";
import { GAME_IDS, GAMES, type GameId } from "./game-registry";

export type ScoreNft = {
  id: number;
  gameId: GameId;
  image: string;
  name: string;
  rarity?: string;
  score?: number;
  season?: number;
};

type HoldingsResponse = {
  results?: Array<{ value: { repr: string } }>;
};

type MetadataResponse = {
  name: string;
  image: string;
  attributes?: Array<{ trait_type: string; value: string }>;
};

function attr(meta: MetadataResponse, key: string): string | undefined {
  return meta.attributes?.find((a) => a.trait_type === key)?.value;
}

export function scoreNftKey(nft: Pick<ScoreNft, "gameId" | "id">): string {
  return `${nft.gameId}-${nft.id}`;
}

export async function fetchScoreHoldings(
  addr: string,
  gameId: GameId
): Promise<ScoreNft[]> {
  const game = GAMES[gameId];
  const apiBase = stacks.network.client?.baseUrl ?? "https://api.hiro.so";
  const contractId = `${game.contractAddress}.${game.contractName}`;
  const asset = `${contractId}::${game.nftAssetName}`;
  const ids: number[] = [];
  const limit = 50;
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      principal: addr,
      asset_identifiers: asset,
      limit: String(limit),
      offset: String(offset),
    });
    const url = `${apiBase}/extended/v1/tokens/nft/holdings?${params.toString()}`;
    const data = (await fetch(url).then((r) => r.json())) as HoldingsResponse;
    const page = data.results ?? [];
    ids.push(...page.map((r) => Number(r.value.repr.replace("u", ""))));
    if (page.length < limit) break;
    offset += limit;
  }

  const META_CONCURRENCY = 5;

  async function fetchMeta(id: number): Promise<ScoreNft | null> {
    try {
      const res = await fetch(`/api/metadata/${game.metaSegment}/${id}`);
      if (!res.ok) return null;
      const meta = (await res.json()) as MetadataResponse;
      return {
        id,
        gameId,
        image: meta.image,
        name: meta.name,
        rarity: attr(meta, "Rarity"),
        score: attr(meta, "Score") ? Number(attr(meta, "Score")) : undefined,
        season: attr(meta, "Season") ? Number(attr(meta, "Season")) : undefined,
      };
    } catch {
      return null;
    }
  }

  const results: Array<ScoreNft | null> = new Array(ids.length).fill(null);
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const index = cursor++;
      results[index] = await fetchMeta(ids[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(META_CONCURRENCY, ids.length) }, worker),
  );

  return results.filter((nft): nft is ScoreNft => nft !== null);
}

export async function fetchAllScoreHoldings(addr: string): Promise<ScoreNft[]> {
  const results = await Promise.allSettled(
    GAME_IDS.map((id) =>
      fetchScoreHoldings(addr, id)
    )
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}
