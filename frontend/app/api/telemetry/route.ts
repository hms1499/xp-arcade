import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeTelemetryPayload } from "@/lib/telemetry";

const LIMIT = 20;
const WINDOW_MS = 60_000;

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

  console.error(`[client-telemetry] ${JSON.stringify(payload)}`);
  return new NextResponse(null, { status: 202 });
}
