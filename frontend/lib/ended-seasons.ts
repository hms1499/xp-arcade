import type { GameId } from "./game-registry";

const KEY = "xp-arcade:ended-seasons";
const pairKey = (gameId: GameId, endBlock: number) => `${gameId}:${endBlock}`;

function load(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export function markSeasonEnded(gameId: GameId, endBlock: number): void {
  if (typeof window === "undefined") return;
  const ended = load();
  ended.add(pairKey(gameId, endBlock));
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...ended]));
  } catch {
    // Best effort: storage can be unavailable or full.
  }
}

export function wasSeasonEnded(gameId: GameId, endBlock: number): boolean {
  return load().has(pairKey(gameId, endBlock));
}
