import { NextResponse } from "next/server";
import { isConfigured, navigate } from "@/lib/browserbase";
import { normalizeUrl } from "@/lib/embed-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!isConfigured()) {
    return noStore({ error: "remote-browser-unconfigured" }, 503);
  }
  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) return noStore({ error: "Missing sessionId" }, 400);

  const normalized = normalizeUrl(typeof body.url === "string" ? body.url : "");
  if (!normalized.ok) return noStore({ error: normalized.reason }, 400);

  try {
    const { title } = await navigate(sessionId, normalized.url);
    return noStore({ ok: true, title });
  } catch {
    return noStore({ ok: false, reason: "Navigation failed" });
  }
}
