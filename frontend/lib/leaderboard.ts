import type { TopEntry } from "./contract-calls";

export function isTopTenScore(score: number, top: TopEntry[]): boolean {
  if (top.length < 10) return true;
  const lowest = Math.min(...top.map((entry) => entry.score));
  return score > lowest;
}
