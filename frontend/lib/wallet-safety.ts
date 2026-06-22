import { stacks } from "./stacks";
import { fetchJson } from "./http";
import { addressNetwork } from "./stacks-address";
import type { NetworkName } from "./game-registry";

/** Format a uSTX integer amount as a STX string with two decimals. */
export function formatStx(ustx: number): string {
  return (ustx / 1_000_000).toFixed(2);
}

/**
 * Warn when the connected wallet is on a different chain than the app. Silent
 * when they match, or when the address network can't be determined (we don't
 * cry wolf on unknown input).
 */
export function networkMismatchWarning(
  address: string | null | undefined,
  appNetwork: NetworkName,
): string | null {
  const walletNetwork = addressNetwork(address);
  if (!walletNetwork || walletNetwork === appNetwork) return null;
  return `Your wallet is on ${walletNetwork} but this app runs on ${appNetwork}. Switch networks in your wallet before continuing.`;
}

/**
 * Warn when a known balance can't cover the required transfer. Silent when the
 * balance is unknown (null) or sufficient. The exact mint transfer is the
 * threshold; the message reminds the user a small network fee sits on top.
 */
export function insufficientStxWarning(
  balanceUstx: number | null,
  requiredUstx: number,
): string | null {
  if (balanceUstx === null) return null;
  if (balanceUstx >= requiredUstx) return null;
  return `Not enough STX: this needs ${formatStx(requiredUstx)} STX plus a small network fee, but your balance is ${formatStx(balanceUstx)} STX.`;
}

const HIRO_BASE =
  stacks.networkName === "mainnet"
    ? "https://api.hiro.so"
    : "https://api.testnet.hiro.so";

/** Spendable STX balance in uSTX for an address, or null if it can't be read. */
export async function getStxBalanceUstx(address: string): Promise<number | null> {
  const json = await fetchJson<{ balance?: string }>(
    `${HIRO_BASE}/extended/v1/address/${address}/stx`,
  ).catch(() => null);
  if (!json || json.balance == null) return null;
  const n = Number(json.balance);
  return Number.isFinite(n) ? n : null;
}
