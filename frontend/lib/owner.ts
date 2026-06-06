"use client";
import { useEffect, useState } from "react";
import { getContractOwner } from "./contract-calls";

// The v3 contract owner is a single principal that effectively never changes
// (only `transfer-ownership` would), so the authoritative read is cached for
// the session. A failed read is NOT cached, so a transient error can retry.
let cachedOwner: string | null = null;

/** Test-only: clear the cached owner between cases. */
export function __resetOwnerCache(): void {
  cachedOwner = null;
}

/**
 * Authoritative owner check against the on-chain `get-contract-owner` read-only.
 * Replaces the old `addr === contractAddress` heuristic, which broke if
 * ownership was ever transferred. Fails safe to `false`.
 */
export async function resolveIsOwner(
  address: string | null,
  fetchOwner: () => Promise<string> = getContractOwner,
): Promise<boolean> {
  if (!address) return false;
  if (cachedOwner === null) {
    try {
      cachedOwner = await fetchOwner();
    } catch {
      return false;
    }
  }
  return address === cachedOwner;
}

/** React hook wrapper: resolves owner status asynchronously, false while loading. */
export function useIsOwner(address: string | null): boolean {
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    let cancelled = false;
    resolveIsOwner(address)
      .then((v) => { if (!cancelled) setIsOwner(v); })
      .catch(() => { if (!cancelled) setIsOwner(false); });
    return () => { cancelled = true; };
  }, [address]);
  return isOwner;
}
