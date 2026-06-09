import { stacks } from "./stacks";

const HIRO_BASE =
  stacks.networkName === "mainnet"
    ? "https://api.hiro.so"
    : "https://api.testnet.hiro.so";

/** Current stacks-block-height from the Hiro chain tip. */
export async function getCurrentStacksBlockHeight(): Promise<number> {
  const res = await fetch(`${HIRO_BASE}/extended/v2/blocks?limit=1`);
  if (!res.ok) throw new Error(`tip fetch failed: ${res.status}`);
  const json = (await res.json()) as { results: Array<{ height: number }> };
  return Number(json.results[0].height);
}
