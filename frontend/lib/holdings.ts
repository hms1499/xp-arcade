import { stacks } from "./stacks";
import { GAMES } from "./game-registry";

export type ScoreNft = {
  id: number;
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
  metaBase = "",
  contractId?: string
): Promise<ScoreNft[]> {
  const apiBase = stacks.network.client?.baseUrl ?? "https://api.hiro.so";
  const finalContractId = contractId ?? `${GAMES.snake.contractAddress}.${GAMES.snake.contractName}`;
  const contractName = finalContractId.split(".").pop() ?? "snake-score";
  const asset = `${finalContractId}::${contractName}`;
  const url = `${apiBase}/extended/v1/tokens/nft/holdings?principal=${addr}&asset_identifiers=${asset}&limit=50`;
  const data = (await fetch(url).then((r) => r.json())) as HoldingsResponse;
  const ids = (data.results ?? []).map((r) =>
    Number(r.value.repr.replace("u", ""))
  );
  return Promise.all(
    ids.map(async (id) => {
      const meta = (await fetch(`${metaBase}/api/metadata/score/${id}`).then(
        (x) => x.json()
      )) as MetadataResponse;
      const rarity = attr(meta, "Rarity");
      const score = attr(meta, "Score");
      const season = attr(meta, "Season");
      return {
        id,
        image: meta.image,
        name: meta.name,
        rarity,
        score: score ? Number(score) : undefined,
        season: season ? Number(season) : undefined,
      };
    })
  );
}
