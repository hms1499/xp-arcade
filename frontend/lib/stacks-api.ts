import { stacks } from "./stacks";
import { fetchJson } from "./http";

const HIRO_BASE =
  stacks.networkName === "mainnet"
    ? "https://api.hiro.so"
    : "https://api.testnet.hiro.so";

/** Current stacks-block-height from the Hiro chain tip. */
export async function getCurrentStacksBlockHeight(): Promise<number> {
  const json = await fetchJson<{ results: Array<{ height: number }> }>(
    `${HIRO_BASE}/extended/v2/blocks?limit=1`,
  );
  if (!json.results[0]) throw new Error("tip fetch returned no blocks");
  return Number(json.results[0].height);
}
