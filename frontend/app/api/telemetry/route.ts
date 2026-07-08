import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { isFunnelEvent, sanitizeTelemetryPayload } from "@/lib/telemetry";
import { incrWithTtl } from "@/lib/redis";
import {
  EVENT_TTL_SECONDS,
  dailyGameKey,
  dailyKey,
  totalKey,
  utcDay,
} from "@/lib/metrics-keys";

// Play emits more events than errors do, so allow a more generous window.
const LIMIT = 60;
const WINDOW_MS = 60_000;

async function countEvent(event: string, game?: string): Promise<void> {
  const day = utcDay();
  await incrWithTtl(dailyKey(event, day), EVENT_TTL_SECONDS);
  await incrWithTtl(totalKey(event));
  if (game) await incrWithTtl(dailyGameKey(event, game, day), EVENT_TTL_SECONDS);
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anon";
  const limit = rateLimit(`telemetry:${ip}`, LIMIT, WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const payload = sanitizeTelemetryPayload(
    await request.json().catch(() => null),
  );
  if (!payload) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  await countEvent(payload.event, payload.game);
  if (!isFunnelEvent(payload.event)) {
    console.error(`[client-telemetry] ${JSON.stringify(payload)}`);
  }
  return new NextResponse(null, { status: 202 });
}
