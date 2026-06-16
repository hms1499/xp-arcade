"use client";
import type { LeaderboardSnapshot } from "./leaderboard-cache";
import type { GameLeaderboard } from "./leaderboard-reads";

export type { LeaderboardSnapshot, GameLeaderboard };

const TTL_MS = 30_000;
let cache: { data: LeaderboardSnapshot; expiresAt: number } | null = null;
let inFlight: Promise<LeaderboardSnapshot> | null = null;

export function resetSnapshotCacheForTest(): void {
  cache = null;
  inFlight = null;
}

/** Fetch the shared leaderboard snapshot from our cached route, with in-flight
 *  dedupe + a short client TTL cache. Falls back to the last good snapshot. */
export async function fetchLeaderboardSnapshot(): Promise<LeaderboardSnapshot> {
  if (cache && Date.now() < cache.expiresAt) return cache.data;
  if (inFlight) return inFlight;

  inFlight = fetch("/api/leaderboard")
    .then((res) => {
      if (!res.ok) throw new Error(`leaderboard ${res.status}`);
      return res.json() as Promise<LeaderboardSnapshot>;
    })
    .then((data) => {
      cache = { data, expiresAt: Date.now() + TTL_MS };
      return data;
    })
    .catch((err) => {
      if (cache) return cache.data;
      throw err;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
