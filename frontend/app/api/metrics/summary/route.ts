import { NextResponse } from "next/server";
import { mget } from "@/lib/redis";
import { ALL_EVENTS } from "@/lib/telemetry";
import { GAME_IDS } from "@/lib/game-registry";
import {
  dailyGameKey,
  keysForRange,
  totalKey,
  utcDay,
} from "@/lib/metrics-keys";
import { summarizeEvent, type EventCounts } from "@/lib/metrics-summary";

export const dynamic = "force-dynamic";

const MAX_DAYS = 90;
const DEFAULT_DAYS = 30;

function parseDays(value: string | null): number {
  const n = Number(value ?? DEFAULT_DAYS);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_DAYS;
  return Math.min(Math.floor(n), MAX_DAYS);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = parseDays(url.searchParams.get("days"));
  const now = new Date();

  // Build every key we need across all events, fetch once, then aggregate.
  const keySet = new Set<string>();
  for (const event of ALL_EVENTS) {
    keysForRange(event, days, now).forEach((k) => keySet.add(k));
    keySet.add(totalKey(event));
    for (let i = 0; i < days; i += 1) {
      const day = utcDay(new Date(now.getTime() - i * 86_400_000));
      for (const game of GAME_IDS) keySet.add(dailyGameKey(event, game, day));
    }
  }
  const keys = [...keySet];
  const values = await mget(keys);
  const counts: Record<string, number> = {};
  keys.forEach((k, i) => {
    const v = values[i];
    if (v != null) counts[k] = v;
  });

  const events: Record<string, EventCounts> = {};
  for (const event of ALL_EVENTS) {
    events[event] = summarizeEvent(event, days, counts, now);
  }

  return NextResponse.json(
    { days, generatedAt: now.toISOString(), events },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
