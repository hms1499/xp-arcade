import { NextResponse } from "next/server";
import { normalizeUrl } from "@/lib/embed-url";
import { checkSsrf } from "@/lib/ssrf-guard";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 3000;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** True when CSP frame-ancestors forbids our origin (conservative: any value
 * other than a permissive '*' is treated as blocking). */
function cspBlocksFraming(csp: string | null): boolean {
  if (!csp) return false;
  const directive = csp
    .split(";")
    .map((d) => d.trim().toLowerCase())
    .find((d) => d.startsWith("frame-ancestors"));
  if (!directive) return false;
  const value = directive.replace("frame-ancestors", "").trim();
  return value !== "*";
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("url");
  if (!raw) return noStore({ error: "Missing url" }, 400);

  const normalized = normalizeUrl(raw);
  if (!normalized.ok) return noStore({ error: normalized.reason }, 400);

  const ssrf = checkSsrf(normalized.url);
  if (!ssrf.safe) return noStore({ error: ssrf.reason }, 400);

  try {
    const res = await fetch(normalized.url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const xfo = res.headers.get("x-frame-options");
    const csp = res.headers.get("content-security-policy");
    // Headers-only check: we never forward the body, so release the stream
    // instead of leaving the socket checked out until GC.
    await res.body?.cancel();
    const embeddable = !xfo && !cspBlocksFraming(csp);
    return noStore({
      embeddable,
      reason: embeddable ? "ok" : "Site refuses framing",
      finalUrl: normalized.url,
    });
  } catch {
    // Fail safe: if we cannot determine, treat as not embeddable.
    return noStore({
      embeddable: false,
      reason: "Could not reach site",
      finalUrl: normalized.url,
    });
  }
}
