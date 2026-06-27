import { NextResponse } from "next/server";

// Same-origin proxy for Bitflow's read APIs. The browser talks only to this
// route (same origin), so ad-blockers / Brave Shields that block third-party
// crypto domains (e.g. *.gateway.dev) can't break quotes. The server then
// reaches Bitflow, which has no such restriction. Swaps still execute in the
// browser via the wallet — only read calls are proxied.
export const dynamic = "force-dynamic";

// Upstreams map to the two hosts the Bitflow SDK reads from:
//  - sdk  → quote/route gateway (/getAllTokensAndPools, /getAllRoutes)
//  - node → Stacks node read API (/v2/contracts/interface, /v2/contracts/call-read)
const UPSTREAMS: Record<string, { base: string; apiKey?: string }> = {
  sdk: {
    base: process.env.BITFLOW_SDK_UPSTREAM ||
      "https://bitflow-sdk-api-gateway-7owjsmt8.uc.gateway.dev",
    apiKey: process.env.BITFLOW_API_KEY,
  },
  node: {
    base: process.env.BITFLOW_NODE_UPSTREAM ||
      "https://node.bitflowapis.finance",
    apiKey: process.env.BITFLOW_READONLY_API_KEY,
  },
};

async function proxy(
  req: Request,
  ctx: { params: Promise<{ target: string; path: string[] }> },
): Promise<NextResponse> {
  const { target, path } = await ctx.params;
  const upstream = UPSTREAMS[target];
  if (!upstream) {
    return NextResponse.json({ error: "Unknown proxy target" }, { status: 404 });
  }

  const search = new URL(req.url).search; // "" or "?a=b"
  const url = `${upstream.base}/${path.join("/")}${search}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": req.headers.get("content-type") || "application/json",
  };
  // Optional server-side key (never exposed to the browser). Keyless by default.
  if (upstream.apiKey) headers["x-api-key"] = upstream.apiKey;

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }

  try {
    const res = await fetch(url, init);
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
