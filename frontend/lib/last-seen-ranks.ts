import type { LiveRanks } from "./player-ranks";

export const LAST_SEEN_RANKS_KEY = "xp-arcade:last-ranks";

type Stored = { address: string; ranks: LiveRanks };

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
