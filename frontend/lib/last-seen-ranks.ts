import type { LiveRanks } from "./player-ranks";

export const LAST_SEEN_RANKS_KEY = "xp-arcade:last-ranks";

type Stored = { address: string; ranks: LiveRanks };

// NOTE: A null return is overloaded — it means BOTH "unranked in every game" AND
// "no snapshot stored yet". Rank-drop detection relies on the stored snapshot being
// complete; a future cache change that returns partial boards could produce false
// "bumped" nudges if this ambiguity is not resolved upstream.
export function loadLastSeenRanks(address: string): LiveRanks | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_SEEN_RANKS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (parsed.address !== address || parsed.ranks == null) return null;
    return parsed.ranks as LiveRanks;
  } catch {
    return null;
  }
}

export function saveLastSeenRanks(address: string, ranks: LiveRanks): void {
  if (typeof window === "undefined") return;
  try {
    const payload: Stored = { address, ranks };
    window.localStorage.setItem(LAST_SEEN_RANKS_KEY, JSON.stringify(payload));
  } catch {
    /* storage blocked → no-op */
  }
}
