import { NextResponse } from "next/server";
import { isConfigured, createSession } from "@/lib/browserbase";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Remote sessions cost money (Browserbase bills per minute) and this route is
// public, so cap how many a single client can mint. The /navigate and /end
// routes intentionally do not authenticate the sessionId — this is a
// single-owner arcade and abuse is bounded by this limit plus per-session
// auto-close; revisit if the threat model changes.
const SESSION_LIMIT = 5;
const SESSION_WINDOW_MS = 5 * 60_000;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isConfigured()) {
    return noStore({ error: "remote-browser-unconfigured" }, 503);
  }
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anon";
  if (!rateLimit(`browser-session:${ip}`, SESSION_LIMIT, SESSION_WINDOW_MS).ok) {
    return noStore({ error: "rate limited" }, 429);
  }
  try {
    const session = await createSession();
    return noStore(session);
  } catch {
    return noStore({ error: "Could not start remote browser" }, 502);
  }
}
