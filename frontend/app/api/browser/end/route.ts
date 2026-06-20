import { NextResponse } from "next/server";
import { isConfigured, endSession } from "@/lib/browserbase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) return noStore({ error: "Missing sessionId" }, 400);
  if (isConfigured()) {
    try {
      await endSession(sessionId);
    } catch {
      // best-effort: the Browserbase timeout is the backstop
    }
  }
  return noStore({ ok: true });
}
