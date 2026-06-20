# Embedded Browser Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Win95-styled "Internet" window to XP Arcade with a URL bar + Go button that embeds embeddable sites in a sandboxed iframe and falls back to "open in new tab" for sites that refuse framing.

**Architecture:** A new `"browser"` window type in the existing Zustand window-manager. The window component (`BrowserWindow`) normalizes the typed URL (`lib/embed-url`), asks a header-only API route (`/api/embed-check`) whether the URL is embeddable, then renders a sandboxed `<iframe>` or an "open in new tab" fallback. The API route is SSRF-guarded (`lib/ssrf-guard`) and never proxies page bodies.

**Tech Stack:** Next.js 16 App Router (route handler), React 19 + TypeScript, Zustand 5, `98.css`, Vitest 3.

## Global Constraints

- Path must not contain spaces (Vitest breaks on `%20`). Keep `Desktop/xp-snake/`.
- Frontend is **Next.js 16 with breaking changes** — read the relevant guide in `node_modules/next/dist/docs/` before writing the route handler (`frontend/AGENTS.md`).
- This window never touches the contract / never mints NFTs.
- Conventional commit prefixes; small green commits; stage explicit files; no `Co-Authored-By`.
- Run the actual test command and read output before claiming a step passed.
- All work happens under `frontend/`. Run commands from `frontend/`.

---

### Task 1: `lib/embed-url.ts` — normalize user input into a safe URL

**Files:**
- Create: `frontend/lib/embed-url.ts`
- Test: `frontend/lib/embed-url.test.ts`

**Interfaces:**
- Consumes: nothing (pure, no deps).
- Produces:
  ```ts
  export type NormalizedUrl =
    | { ok: true; url: string }
    | { ok: false; reason: string };
  export function normalizeUrl(input: string): NormalizedUrl;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/embed-url.test.ts
import { describe, it, expect } from "vitest";
import { normalizeUrl } from "./embed-url";

describe("normalizeUrl", () => {
  it("adds https:// to a bare domain", () => {
    expect(normalizeUrl("example.com")).toEqual({
      ok: true,
      url: "https://example.com/",
    });
  });

  it("keeps an explicit https URL", () => {
    expect(normalizeUrl("https://example.com/path?q=1")).toEqual({
      ok: true,
      url: "https://example.com/path?q=1",
    });
  });

  it("keeps an explicit http URL", () => {
    expect(normalizeUrl("http://example.com/")).toEqual({
      ok: true,
      url: "http://example.com/",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeUrl("  example.com  ")).toEqual({
      ok: true,
      url: "https://example.com/",
    });
  });

  it("rejects an empty string", () => {
    expect(normalizeUrl("   ")).toEqual({
      ok: false,
      reason: "Empty address",
    });
  });

  it("rejects javascript: scheme", () => {
    const r = normalizeUrl("javascript:alert(1)");
    expect(r.ok).toBe(false);
  });

  it("rejects file: scheme", () => {
    const r = normalizeUrl("file:///etc/passwd");
    expect(r.ok).toBe(false);
  });

  it("rejects data: scheme", () => {
    const r = normalizeUrl("data:text/html,<h1>x</h1>");
    expect(r.ok).toBe(false);
  });

  it("rejects an unparseable address", () => {
    const r = normalizeUrl("ht!tp://%%%");
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/embed-url.test.ts`
Expected: FAIL — `normalizeUrl` not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/lib/embed-url.ts
export type NormalizedUrl =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/**
 * Turn raw URL-bar input into a validated http(s) URL string.
 * Adds https:// when no scheme is present; rejects non-http(s) schemes
 * (javascript:, file:, data:, …) and unparseable input.
 */
export function normalizeUrl(input: string): NormalizedUrl {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "Empty address" };

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, reason: "Not a valid address" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: `Unsupported scheme: ${parsed.protocol}` };
  }

  return { ok: true, url: parsed.toString() };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/embed-url.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/embed-url.ts frontend/lib/embed-url.test.ts
git commit -m "feat(browser): normalizeUrl helper for the address bar"
```

---

### Task 2: `lib/ssrf-guard.ts` — block internal/private hosts before fetch

**Files:**
- Create: `frontend/lib/ssrf-guard.ts`
- Test: `frontend/lib/ssrf-guard.test.ts`

**Interfaces:**
- Consumes: nothing (pure, no deps).
- Produces:
  ```ts
  export type SsrfVerdict = { safe: true } | { safe: false; reason: string };
  export function checkSsrf(url: string): SsrfVerdict;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/ssrf-guard.test.ts
import { describe, it, expect } from "vitest";
import { checkSsrf } from "./ssrf-guard";

describe("checkSsrf", () => {
  it("allows a public https domain", () => {
    expect(checkSsrf("https://example.com/")).toEqual({ safe: true });
  });

  it("allows a public http domain", () => {
    expect(checkSsrf("http://example.com/")).toEqual({ safe: true });
  });

  it.each([
    "http://localhost/",
    "http://127.0.0.1/",
    "http://127.5.5.5/",
    "http://0.0.0.0/",
    "http://10.0.0.1/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://printer.local/",
  ])("blocks internal host %s", (url) => {
    expect(checkSsrf(url).safe).toBe(false);
  });

  it("allows a public IP (8.8.8.8)", () => {
    expect(checkSsrf("http://8.8.8.8/")).toEqual({ safe: true });
  });

  it("blocks non-http(s) schemes", () => {
    expect(checkSsrf("ftp://example.com/").safe).toBe(false);
  });

  it("rejects unparseable input", () => {
    expect(checkSsrf("not a url").safe).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/ssrf-guard.test.ts`
Expected: FAIL — `checkSsrf` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/lib/ssrf-guard.ts
export type SsrfVerdict = { safe: true } | { safe: false; reason: string };

function ipv4Octets(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const octets = m.slice(1).map(Number);
  if (octets.some((o) => o > 255)) return null;
  return octets;
}

function isPrivateIpv4([a, b]: number[]): boolean {
  if (a === 10) return true;
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/**
 * Decide whether `url` is safe to fetch server-side. Only http(s) public
 * hosts pass; loopback, private ranges, link-local (incl. 169.254.169.254
 * cloud metadata), *.local, and IPv6 loopback are blocked. Pure, so it can
 * be unit-tested without network.
 */
export function checkSsrf(url: string): SsrfVerdict {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: "Not a valid address" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, reason: "Only http(s) allowed" };
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".local")) {
    return { safe: false, reason: "Internal host blocked" };
  }
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") {
    return { safe: false, reason: "Internal host blocked" };
  }

  const octets = ipv4Octets(host);
  if (octets && isPrivateIpv4(octets)) {
    return { safe: false, reason: "Internal host blocked" };
  }

  return { safe: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/ssrf-guard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/ssrf-guard.ts frontend/lib/ssrf-guard.test.ts
git commit -m "feat(browser): ssrf-guard for the embed-check endpoint"
```

---

### Task 3: `app/api/embed-check/route.ts` — header-only embeddability check

**Files:**
- Create: `frontend/app/api/embed-check/route.ts`
- Test: `frontend/app/api/embed-check/route.test.ts`

**Interfaces:**
- Consumes: `normalizeUrl` (Task 1), `checkSsrf` (Task 2).
- Produces: `GET(req: Request): Promise<Response>`.
  Response body: `{ embeddable: boolean; reason: string; finalUrl: string }`.
  Error body: `{ error: string }` with status 400.

**Pre-step:** Read `node_modules/next/dist/docs/` for the current route-handler API before writing this file (per `frontend/AGENTS.md`). Use `NextResponse.json` as the other routes do (`app/api/health/route.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// frontend/app/api/embed-check/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function req(url: string) {
  return new Request(`http://localhost/api/embed-check?url=${encodeURIComponent(url)}`);
}

function headersOf(map: Record<string, string>) {
  return { status: 200, headers: new Headers(map) };
}

describe("GET /api/embed-check", () => {
  it("400s when url param is missing", async () => {
    const res = await GET(new Request("http://localhost/api/embed-check"));
    expect(res.status).toBe(400);
  });

  it("400s on an internal host (ssrf)", async () => {
    const res = await GET(req("http://127.0.0.1/"));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400s on a javascript: scheme", async () => {
    const res = await GET(req("javascript:alert(1)"));
    expect(res.status).toBe(400);
  });

  it("returns embeddable:false when X-Frame-Options is set", async () => {
    fetchMock.mockResolvedValue(headersOf({ "x-frame-options": "DENY" }));
    const res = await GET(req("https://example.com/"));
    const body = await res.json();
    expect(body.embeddable).toBe(false);
  });

  it("returns embeddable:false when CSP frame-ancestors excludes us", async () => {
    fetchMock.mockResolvedValue(
      headersOf({ "content-security-policy": "frame-ancestors 'none'" }),
    );
    const res = await GET(req("https://example.com/"));
    const body = await res.json();
    expect(body.embeddable).toBe(false);
  });

  it("returns embeddable:true for clean headers", async () => {
    fetchMock.mockResolvedValue(headersOf({}));
    const res = await GET(req("https://example.com/"));
    const body = await res.json();
    expect(body.embeddable).toBe(true);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns embeddable:false on fetch error (fail-safe)", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    const res = await GET(req("https://example.com/"));
    const body = await res.json();
    expect(body.embeddable).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run app/api/embed-check/route.test.ts`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/app/api/embed-check/route.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run app/api/embed-check/route.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/api/embed-check/route.ts frontend/app/api/embed-check/route.test.ts
git commit -m "feat(browser): /api/embed-check header-only embeddability route"
```

---

### Task 4: Register the `"browser"` window type

**Files:**
- Modify: `frontend/state/window-manager.ts` (the `WindowType` union ~line 5; the `maximized` default ~line 73)
- Test: `frontend/state/window-manager.test.ts`

**Interfaces:**
- Consumes: existing `useWindows` store.
- Produces: `"browser"` as a valid `WindowType`; `open("browser")` creates a maximized entry.

- [ ] **Step 1: Write the failing test**

Append to `frontend/state/window-manager.test.ts`:

```ts
describe("browser window", () => {
  beforeEach(() => {
    useWindows.setState({ windows: [], topZ: 10 });
  });

  it("opens a maximized browser window", () => {
    useWindows.getState().open("browser");
    const win = useWindows.getState().windows.find((w) => w.type === "browser");
    expect(win).toBeDefined();
    expect(win?.maximized).toBe(true);
  });

  it("is single-instance (re-open focuses the existing one)", () => {
    useWindows.getState().open("browser");
    useWindows.getState().open("browser");
    const count = useWindows
      .getState()
      .windows.filter((w) => w.type === "browser").length;
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run state/window-manager.test.ts`
Expected: FAIL — `"browser"` not assignable to `WindowType` (type error) / `maximized` is `false`.

- [ ] **Step 3: Write minimal implementation**

In `frontend/state/window-manager.ts`, add `"browser"` to the union:

```ts
export type WindowType =
  | `game-${GameId}`
  | "highscore"
  | "hall-of-fame"
  | "mynfts"
  | "season-admin"
  | "player-profile"
  | "browser";
```

And extend the maximize-on-open default (the line currently reading
`maximized: type === "game-solitaire",`):

```ts
          // Solitaire's Klondike board and the browser both need the room —
          // open them maximized.
          maximized: type === "game-solitaire" || type === "browser",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run state/window-manager.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/state/window-manager.ts frontend/state/window-manager.test.ts
git commit -m "feat(browser): register browser window type (maximized on open)"
```

---

### Task 5: `BrowserWindow` component + mount + taskbar label

**Files:**
- Create: `frontend/components/windows/BrowserWindow.tsx`
- Modify: `frontend/app/page.tsx` (import + render, alongside the other windows)
- Modify: `frontend/components/desktop/Taskbar.tsx` (`TYPE_LABEL` map ~line 11)

**Interfaces:**
- Consumes: `normalizeUrl` (Task 1), `useWindows` + `"browser"` type (Task 4), `Window` component, `/api/embed-check` (Task 3).
- Produces: `export function BrowserWindow(): JSX.Element | null`.

- [ ] **Step 1: Write the component**

```tsx
// frontend/components/windows/BrowserWindow.tsx
"use client";
import { useState } from "react";
import { useWindows } from "@/state/window-manager";
import { Window } from "./Window";
import { normalizeUrl } from "@/lib/embed-url";

type Status = "idle" | "checking" | "embedded" | "blocked" | "error";

export function BrowserWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "browser"));
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [embedUrl, setEmbedUrl] = useState("");
  const [message, setMessage] = useState("");

  if (!w) return null;

  async function go() {
    const normalized = normalizeUrl(input);
    if (!normalized.ok) {
      setStatus("error");
      setMessage(normalized.reason);
      return;
    }
    setStatus("checking");
    setMessage("");
    try {
      const res = await fetch(
        `/api/embed-check?url=${encodeURIComponent(normalized.url)}`,
      );
      const body = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(body.error ?? "Could not load address");
        return;
      }
      setEmbedUrl(body.finalUrl);
      if (body.embeddable) {
        setStatus("embedded");
      } else {
        setStatus("blocked");
        setMessage(body.reason ?? "This site can't be shown here");
      }
    } catch {
      setStatus("error");
      setMessage("Network error");
    }
  }

  return (
    <Window id={w.id} title="Internet">
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ display: "flex", gap: 4, padding: 4 }}>
          <input
            type="text"
            value={input}
            placeholder="Type an address and press Go"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") go();
            }}
            style={{ flex: 1 }}
            aria-label="Address"
          />
          <button onClick={go}>Go</button>
        </div>

        <div style={{ flex: 1, minHeight: 320, position: "relative" }}>
          {status === "idle" && (
            <p style={{ padding: 8 }}>
              Type an address above and press <b>Go</b> to browse while you play.
            </p>
          )}
          {status === "checking" && <p style={{ padding: 8 }}>Loading…</p>}
          {status === "embedded" && (
            <iframe
              title="Embedded page"
              src={embedUrl}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              style={{ width: "100%", height: "100%", border: 0 }}
            />
          )}
          {(status === "blocked" || status === "error") && (
            <div style={{ padding: 8 }}>
              <p>{message}</p>
              {embedUrl && (
                <button onClick={() => window.open(embedUrl, "_blank", "noopener,noreferrer")}>
                  Open in new tab
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Window>
  );
}
```

- [ ] **Step 2: Mount it in `app/page.tsx`**

Add the import next to the other window imports:

```tsx
import { BrowserWindow } from "@/components/windows/BrowserWindow";
```

And render it inside `<Desktop>`, after `<PlayerProfileWindow />`:

```tsx
        <PlayerProfileWindow />
        <BrowserWindow />
```

- [ ] **Step 3: Add the Taskbar label**

In `frontend/components/desktop/Taskbar.tsx`, add to the `TYPE_LABEL` map:

```ts
const TYPE_LABEL: Record<string, string> = {
  highscore: "High Scores",
  mynfts: "My NFTs",
  "season-admin": "Season Admin",
  "player-profile": "Player Profile",
  browser: "Internet",
};
```

- [ ] **Step 4: Type-check and build**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/windows/BrowserWindow.tsx frontend/app/page.tsx frontend/components/desktop/Taskbar.tsx
git commit -m "feat(browser): BrowserWindow with URL bar, iframe + open-in-tab fallback"
```

---

### Task 6: Launch entry points (Desktop icon + Start menu)

**Files:**
- Modify: `frontend/components/desktop/Desktop.tsx` (icon list, after the "My NFTs" `DesktopIcon` ~line 138)
- Modify: `frontend/components/desktop/StartMenu.tsx` (after the "My NFTs" `MenuItem` ~line 159)

**Interfaces:**
- Consumes: `open("browser")` from the window-manager (Task 4); existing `DesktopIcon` / `MenuItem` components.
- Produces: user-visible ways to open the browser window.

- [ ] **Step 1: Add the Desktop icon**

In `frontend/components/desktop/Desktop.tsx`, after the `My NFTs` `DesktopIcon`:

```tsx
        <DesktopIcon
          label="Internet"
          emoji="🌐"
          onOpen={() => open("browser")}
        />
```

- [ ] **Step 2: Add the Start menu item**

In `frontend/components/desktop/StartMenu.tsx`, after the `My NFTs` `MenuItem`:

```tsx
          <MenuItem
            icon="🌐"
            label="Internet"
            onClick={() => { openWin("browser"); onClose(); }}
          />
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Run: `cd frontend && npm run dev`
Then in the browser: open the **Internet** icon → type `example.com` → Go (should embed); type `google.com` → Go (should show "Open in new tab" fallback).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/desktop/Desktop.tsx frontend/components/desktop/StartMenu.tsx
git commit -m "feat(browser): desktop icon + start-menu entry for the Internet window"
```

---

### Task 7: Full gate (final verification)

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `cd frontend && npm test`
Expected: all tests pass, including the new `embed-url`, `ssrf-guard`, `embed-check`, and `window-manager` tests.

- [ ] **Step 2: Type-check + lint**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

(No commit — verification only. If anything fails, fix in the relevant task and re-run.)
