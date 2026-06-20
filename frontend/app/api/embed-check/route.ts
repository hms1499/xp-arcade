import { lookup } from "node:dns/promises";
import { NextResponse } from "next/server";
import { normalizeUrl } from "@/lib/embed-url";
import { checkSsrf, isBlockedIp } from "@/lib/ssrf-guard";

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

  // DNS-rebinding guard: a public hostname can resolve to a private IP.
  // Reject if any resolved address is internal.
  const hostname = new URL(normalized.url).hostname.replace(/^\[|\]$/g, "");
  try {
    const resolved = await lookup(hostname, { all: true });
    if (resolved.some((addr) => isBlockedIp(addr.address))) {
      return noStore({ error: "Internal host blocked" }, 400);
    }
  } catch {
    // Cannot resolve → cannot fetch; fail safe to open-in-tab.
    return noStore({
      embeddable: false,
      reason: "Could not resolve site",
      finalUrl: normalized.url,
    });
  }

  try {
    const res = await fetch(normalized.url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel();
      return noStore({
        embeddable: false,
        reason: "Site redirects — open in a new tab",
        finalUrl: normalized.url,
      });
    }
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
