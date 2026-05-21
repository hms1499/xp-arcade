import { stacks } from "./stacks";
import { GAMES, type GameId } from "./game-registry";

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

export async function fetchScoreHoldings(
  addr: string,
  gameId: GameId
): Promise<ScoreNft[]> {
  const game = GAMES[gameId];
  const apiBase = stacks.network.client?.baseUrl ?? "https://api.hiro.so";
  const contractId = `${game.contractAddress}.${game.contractName}`;
  const asset = `${contractId}::${game.nftAssetName}`;
  const url = `${apiBase}/extended/v1/tokens/nft/holdings?principal=${addr}&asset_identifiers=${asset}&limit=50`;
  const data = (await fetch(url).then((r) => r.json())) as HoldingsResponse;
  const ids = (data.results ?? []).map((r) =>
    Number(r.value.repr.replace("u", ""))
  );
  return Promise.all(
    ids.map(async (id) => {
      const meta = (await fetch(
        `/api/metadata/${game.metaSegment}/${id}`
      ).then((x) => x.json())) as MetadataResponse;
      return {
        id,
        gameId,
        image: meta.image,
        name: meta.name,
        rarity: attr(meta, "Rarity"),
        score: attr(meta, "Score") ? Number(attr(meta, "Score")) : undefined,
        season: attr(meta, "Season") ? Number(attr(meta, "Season")) : undefined,
      };
    })
  );
}

export async function fetchAllScoreHoldings(addr: string): Promise<ScoreNft[]> {
  const results = await Promise.allSettled(
    (["snake", "tetris", "pacman"] as GameId[]).map((id) =>
      fetchScoreHoldings(addr, id)
    )
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}
