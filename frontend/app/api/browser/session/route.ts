import { NextResponse } from "next/server";
import { isConfigured, createSession } from "@/lib/browserbase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  if (!isConfigured()) {
    return noStore({ error: "remote-browser-unconfigured" }, 503);
  }
  try {
    const session = await createSession();
    return noStore(session);
  } catch {
    return noStore({ error: "Could not start remote browser" }, 502);
  }
}
