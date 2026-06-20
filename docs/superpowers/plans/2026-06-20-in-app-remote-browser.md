# In-App Remote Browser (Hybrid) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render any site inside the "Internet" window — embeddable sites via a free iframe, framing-refusing sites via an embedded interactive Browserbase live view — with strict session auto-close to control cost.

**Architecture:** A hybrid `BrowserWindow`: `normalizeUrl` → `/api/embed-check` (reused from v1) decides iframe vs remote. The remote path uses a server-only `lib/browserbase.ts` (Browserbase SDK + `playwright-core` over CDP) behind three routes (`session`/`navigate`/`end`). The Browserbase API key and CDP connect URL never reach the client; the client only handles `{ sessionId, liveViewUrl }`.

**Tech Stack:** Next.js 16 route handlers (Node runtime), React 19 + TypeScript, `@browserbasehq/sdk`, `playwright-core`, Vitest 3.

## Global Constraints

- Path must not contain spaces (Vitest breaks on `%20`). Keep `Desktop/xp-snake/`.
- Frontend is **Next.js 16 with breaking changes** — read `node_modules/next/dist/docs/` before writing route handlers (`frontend/AGENTS.md`).
- All `/api/browser/*` routes run on the **Node.js runtime** (Browserbase SDK + playwright-core need Node) — never edge.
- The Browserbase **API key and CDP `connectUrl` are server-only** — never returned to the client or logged. The client sees only `sessionId` and `liveViewUrl`.
- Env names exactly: `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`. Server-side only (no `NEXT_PUBLIC_` prefix).
- When env is missing, every `/api/browser/*` route returns HTTP `503` and the UI degrades to v1 behavior (iframe for embeddable; "open in new tab" otherwise) — no hard crash.
- Strict cost control: one session at a time; server `timeout` 300s; client idle close ~120s; close on window close / mode switch / "Stop session".
- This window never touches the contract / never mints NFTs.
- Conventional commit prefixes; small green commits; stage explicit files; no `Co-Authored-By`.
- Run the actual test command and read output before claiming a step passed. Run all commands from `frontend/`.

---

### Task 1: `lib/browserbase.ts` — server-only Browserbase wrapper

**Files:**
- Create: `frontend/lib/browserbase.ts`
- Test: `frontend/lib/browserbase.test.ts`
- Modify: `frontend/.env.example` (append the two env vars)

**Interfaces:**
- Consumes: `@browserbasehq/sdk` (default export `Browserbase`), `playwright-core` (`chromium`).
- Produces:
  ```ts
  export function isConfigured(): boolean;
  export function createSession(): Promise<{ sessionId: string; liveViewUrl: string }>;
  export function navigate(sessionId: string, url: string): Promise<{ title: string }>;
  export function endSession(sessionId: string): Promise<void>;
  ```

- [ ] **Step 1: Install dependencies**

Run: `cd frontend && npm install @browserbasehq/sdk playwright-core`
Expected: both added to `package.json` dependencies, install succeeds.

- [ ] **Step 2: Write the failing test**

```ts
// frontend/lib/browserbase.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.hoisted(() => vi.fn());
const debugMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const connectOverCDPMock = vi.hoisted(() => vi.fn());

vi.mock("@browserbasehq/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    sessions: { create: createMock, debug: debugMock, update: updateMock },
  })),
}));
vi.mock("playwright-core", () => ({
  chromium: { connectOverCDP: connectOverCDPMock },
}));

import { isConfigured, createSession, navigate, endSession } from "./browserbase";

beforeEach(() => {
  vi.stubEnv("BROWSERBASE_API_KEY", "test-key");
  vi.stubEnv("BROWSERBASE_PROJECT_ID", "proj-1");
  createMock.mockReset();
  debugMock.mockReset();
  updateMock.mockReset();
  connectOverCDPMock.mockReset();
});

describe("isConfigured", () => {
  it("is true when both env vars are set", () => {
    expect(isConfigured()).toBe(true);
  });
  it("is false when the api key is missing", () => {
    vi.stubEnv("BROWSERBASE_API_KEY", "");
    expect(isConfigured()).toBe(false);
  });
});

describe("createSession", () => {
  it("creates a keepAlive session and returns the fullscreen live view url", async () => {
    createMock.mockResolvedValue({ id: "sess_1" });
    debugMock.mockResolvedValue({ debuggerFullscreenUrl: "https://debugger/sess_1/fullscreen" });
    const result = await createSession();
    expect(createMock).toHaveBeenCalledWith({
      projectId: "proj-1",
      keepAlive: true,
      timeout: 300,
    });
    expect(result).toEqual({
      sessionId: "sess_1",
      liveViewUrl: "https://debugger/sess_1/fullscreen",
    });
  });
});

describe("navigate", () => {
  it("connects over CDP, navigates, returns the title, and closes", async () => {
    const goto = vi.fn().mockResolvedValue(undefined);
    const title = vi.fn().mockResolvedValue("Example");
    const close = vi.fn().mockResolvedValue(undefined);
    const page = { goto, title };
    const browser = {
      contexts: () => [{ pages: () => [page], newPage: vi.fn() }],
      close,
    };
    connectOverCDPMock.mockResolvedValue(browser);

    const result = await navigate("sess_1", "https://example.com/");

    const connectArg = connectOverCDPMock.mock.calls[0][0] as string;
    expect(connectArg).toContain("sessionId=sess_1");
    expect(goto).toHaveBeenCalledWith("https://example.com/", { waitUntil: "domcontentloaded" });
    expect(close).toHaveBeenCalled();
    expect(result).toEqual({ title: "Example" });
  });

  it("does not leak the api key in its return value", async () => {
    const browser = {
      contexts: () => [{ pages: () => [{ goto: vi.fn(), title: vi.fn().mockResolvedValue("x") }], newPage: vi.fn() }],
      close: vi.fn(),
    };
    connectOverCDPMock.mockResolvedValue(browser);
    const result = await navigate("sess_1", "https://example.com/");
    expect(JSON.stringify(result)).not.toContain("test-key");
  });
});

describe("endSession", () => {
  it("requests release with the project id", async () => {
    updateMock.mockResolvedValue(undefined);
    await endSession("sess_1");
    expect(updateMock).toHaveBeenCalledWith("sess_1", {
      projectId: "proj-1",
      status: "REQUEST_RELEASE",
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/browserbase.test.ts`
Expected: FAIL — `./browserbase` module not found.

- [ ] **Step 4: Write the implementation**

```ts
// frontend/lib/browserbase.ts
import "server-only";
import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright-core";

const SESSION_TIMEOUT_S = 300;

function apiKey(): string | undefined {
  return process.env.BROWSERBASE_API_KEY;
}
function projectId(): string | undefined {
  return process.env.BROWSERBASE_PROJECT_ID;
}

/** Both required env vars present. When false, callers must degrade. */
export function isConfigured(): boolean {
  return Boolean(apiKey() && projectId());
}

function client(): Browserbase {
  return new Browserbase({ apiKey: apiKey()! });
}

/** Reconstruct the CDP URL server-side — it embeds the API key, so it must
 * never be returned to the client. */
function connectUrl(sessionId: string): string {
  return `wss://connect.browserbase.com?apiKey=${apiKey()}&sessionId=${sessionId}`;
}

export async function createSession(): Promise<{ sessionId: string; liveViewUrl: string }> {
  const bb = client();
  const session = await bb.sessions.create({
    projectId: projectId()!,
    keepAlive: true,
    timeout: SESSION_TIMEOUT_S,
  });
  const debug = await bb.sessions.debug(session.id);
  return { sessionId: session.id, liveViewUrl: debug.debuggerFullscreenUrl };
}

export async function navigate(sessionId: string, url: string): Promise<{ title: string }> {
  const browser = await chromium.connectOverCDP(connectUrl(sessionId));
  try {
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url, { waitUntil: "domcontentloaded" });
    return { title: await page.title() };
  } finally {
    // Disconnect the CDP client; keepAlive keeps the remote session alive.
    await browser.close();
  }
}

export async function endSession(sessionId: string): Promise<void> {
  const bb = client();
  await bb.sessions.update(sessionId, {
    projectId: projectId()!,
    status: "REQUEST_RELEASE",
  });
}
```

Note: `import "server-only"` guarantees a build error if this module is ever imported into client code. If the `server-only` package is not already a dependency, install it: `npm install server-only`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/browserbase.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5b: Type-check against the real SDK types**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. If the installed `@browserbasehq/sdk` types name the
`create`/`update` params differently (e.g. the release `status` enum value, or
`keepAlive`/`timeout` field names), adjust `browserbase.ts` to match the
installed types — keep the same exported function signatures and behavior, and
re-run Steps 5 and 5b. (Vitest does not type-check, so this step is what catches
SDK-shape drift.)

- [ ] **Step 6: Append env vars to `.env.example`**

Add to `frontend/.env.example`:

```bash
# Remote browser (Browserbase) for the in-app "Internet" window. Server-side
# only. Without these, the Internet window falls back to iframe + open-in-tab.
# keepAlive sessions require a paid Browserbase plan.
BROWSERBASE_API_KEY=
BROWSERBASE_PROJECT_ID=
```

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/browserbase.ts frontend/lib/browserbase.test.ts frontend/.env.example frontend/package.json frontend/package-lock.json
git commit -m "feat(browser): server-only Browserbase session wrapper"
```

---

### Task 2: `POST /api/browser/session` — create a remote session

**Files:**
- Create: `frontend/app/api/browser/session/route.ts`
- Test: `frontend/app/api/browser/session/route.test.ts`

**Interfaces:**
- Consumes: `isConfigured`, `createSession` from `@/lib/browserbase`.
- Produces: `POST(): Promise<Response>` → `{ sessionId, liveViewUrl }` (200) | `{ error }` (503/502).

**Pre-step:** Confirm the Next.js 16 route-handler + `NextResponse.json` API against `node_modules/next/dist/docs/` (follow `app/api/health/route.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// frontend/app/api/browser/session/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const isConfigured = vi.hoisted(() => vi.fn());
const createSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/browserbase", () => ({ isConfigured, createSession }));

import { POST } from "./route";

beforeEach(() => {
  isConfigured.mockReset();
  createSession.mockReset();
});

describe("POST /api/browser/session", () => {
  it("503s when unconfigured", async () => {
    isConfigured.mockReturnValue(false);
    const res = await POST();
    expect(res.status).toBe(503);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("returns sessionId + liveViewUrl on success", async () => {
    isConfigured.mockReturnValue(true);
    createSession.mockResolvedValue({ sessionId: "s1", liveViewUrl: "https://live/s1" });
    const res = await POST();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ sessionId: "s1", liveViewUrl: "https://live/s1" });
  });

  it("502s when session creation throws", async () => {
    isConfigured.mockReturnValue(true);
    createSession.mockRejectedValue(new Error("plan does not allow keepAlive"));
    const res = await POST();
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run app/api/browser/session/route.test.ts`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Write the implementation**

```ts
// frontend/app/api/browser/session/route.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run app/api/browser/session/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/api/browser/session/route.ts frontend/app/api/browser/session/route.test.ts
git commit -m "feat(browser): POST /api/browser/session to start a remote session"
```

---

### Task 3: `POST /api/browser/navigate` — drive the remote session

**Files:**
- Create: `frontend/app/api/browser/navigate/route.ts`
- Test: `frontend/app/api/browser/navigate/route.test.ts`

**Interfaces:**
- Consumes: `isConfigured`, `navigate` from `@/lib/browserbase`; `normalizeUrl` from `@/lib/embed-url`.
- Produces: `POST(req: Request): Promise<Response>` → `{ ok: true, title }` (200) | `{ ok: false, reason }` (200) | `{ error }` (400/503).

- [ ] **Step 1: Write the failing test**

```ts
// frontend/app/api/browser/navigate/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const isConfigured = vi.hoisted(() => vi.fn());
const navigateFn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/browserbase", () => ({ isConfigured, navigate: navigateFn }));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/browser/navigate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  isConfigured.mockReset().mockReturnValue(true);
  navigateFn.mockReset();
});

describe("POST /api/browser/navigate", () => {
  it("503s when unconfigured", async () => {
    isConfigured.mockReturnValue(false);
    const res = await POST(req({ sessionId: "s1", url: "https://example.com" }));
    expect(res.status).toBe(503);
  });

  it("400s when sessionId is missing", async () => {
    const res = await POST(req({ url: "https://example.com" }));
    expect(res.status).toBe(400);
    expect(navigateFn).not.toHaveBeenCalled();
  });

  it("400s when the url is junk", async () => {
    const res = await POST(req({ sessionId: "s1", url: "javascript:alert(1)" }));
    expect(res.status).toBe(400);
    expect(navigateFn).not.toHaveBeenCalled();
  });

  it("navigates and returns the title", async () => {
    navigateFn.mockResolvedValue({ title: "Example" });
    const res = await POST(req({ sessionId: "s1", url: "example.com" }));
    expect(res.status).toBe(200);
    expect(navigateFn).toHaveBeenCalledWith("s1", "https://example.com/");
    expect(await res.json()).toEqual({ ok: true, title: "Example" });
  });

  it("returns ok:false when navigation throws", async () => {
    navigateFn.mockRejectedValue(new Error("nav failed"));
    const res = await POST(req({ sessionId: "s1", url: "example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, reason: "Navigation failed" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run app/api/browser/navigate/route.test.ts`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Write the implementation**

```ts
// frontend/app/api/browser/navigate/route.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run app/api/browser/navigate/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/api/browser/navigate/route.ts frontend/app/api/browser/navigate/route.test.ts
git commit -m "feat(browser): POST /api/browser/navigate to drive the remote session"
```

---

### Task 4: `POST /api/browser/end` — release a remote session

**Files:**
- Create: `frontend/app/api/browser/end/route.ts`
- Test: `frontend/app/api/browser/end/route.test.ts`

**Interfaces:**
- Consumes: `isConfigured`, `endSession` from `@/lib/browserbase`.
- Produces: `POST(req: Request): Promise<Response>` → `{ ok: true }` (200) | `{ error }` (400).

- [ ] **Step 1: Write the failing test**

```ts
// frontend/app/api/browser/end/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const isConfigured = vi.hoisted(() => vi.fn());
const endSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/browserbase", () => ({ isConfigured, endSession }));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/browser/end", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  isConfigured.mockReset().mockReturnValue(true);
  endSession.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/browser/end", () => {
  it("400s when sessionId is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(endSession).not.toHaveBeenCalled();
  });

  it("releases the session and returns ok", async () => {
    const res = await POST(req({ sessionId: "s1" }));
    expect(res.status).toBe(200);
    expect(endSession).toHaveBeenCalledWith("s1");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("still returns ok when release throws (best-effort)", async () => {
    endSession.mockRejectedValue(new Error("already gone"));
    const res = await POST(req({ sessionId: "s1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns ok without calling endSession when unconfigured", async () => {
    isConfigured.mockReturnValue(false);
    const res = await POST(req({ sessionId: "s1" }));
    expect(res.status).toBe(200);
    expect(endSession).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run app/api/browser/end/route.test.ts`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Write the implementation**

```ts
// frontend/app/api/browser/end/route.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run app/api/browser/end/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/api/browser/end/route.ts frontend/app/api/browser/end/route.test.ts
git commit -m "feat(browser): POST /api/browser/end to release a remote session"
```

---

### Task 5: `BrowserWindow` hybrid remote mode + session lifecycle

**Files:**
- Modify (full rewrite): `frontend/components/windows/BrowserWindow.tsx`

**Interfaces:**
- Consumes: `useWindows` + `"browser"` type; `Window`; `normalizeUrl`; `/api/embed-check` (v1); `/api/browser/session`, `/api/browser/navigate`, `/api/browser/end` (Tasks 2-4).
- Produces: `export function BrowserWindow(): JSX.Element | null`.

This task has no unit test (iframe + cross-origin live view depend on the browser runtime); verification is `tsc --noEmit` + a manual smoke note. Replace the entire file with the code below.

- [ ] **Step 1: Replace `BrowserWindow.tsx` with the hybrid implementation**

```tsx
// frontend/components/windows/BrowserWindow.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { Window } from "./Window";
import { normalizeUrl } from "@/lib/embed-url";

type Status = "idle" | "checking" | "embedded" | "remote" | "blocked" | "error";

const IDLE_MS = 120_000;

export function BrowserWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "browser"));
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [embedUrl, setEmbedUrl] = useState("");
  const [liveViewUrl, setLiveViewUrl] = useState("");
  const [message, setMessage] = useState("");

  const sessionIdRef = useRef<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Best-effort release that survives unmount (sendBeacon, falls back to fetch).
  function releaseSession() {
    const id = sessionIdRef.current;
    if (!id) return;
    sessionIdRef.current = null;
    const payload = JSON.stringify({ sessionId: id });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/browser/end", new Blob([payload], { type: "application/json" }));
    } else {
      fetch("/api/browser/end", { method: "POST", body: payload, keepalive: true }).catch(() => {});
    }
  }

  function clearIdleTimer() {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }

  function stopRemote(next: Status) {
    clearIdleTimer();
    releaseSession();
    setLiveViewUrl("");
    setStatus(next);
  }

  function armIdleTimer() {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      // Idle close: drop the paid session and return to the homepage.
      stopRemote("idle");
      setMessage("");
    }, IDLE_MS);
  }

  // Idle handling while remote. The live view is a cross-origin iframe, so we
  // cannot see interaction inside it. Heuristic: while the iframe holds focus,
  // pause the countdown (treat as active); otherwise count down. The
  // Browserbase server timeout is the authoritative cap.
  useEffect(() => {
    if (status !== "remote") return;
    armIdleTimer();
    const onBlur = () => {
      if (document.activeElement === iframeRef.current) clearIdleTimer(); // active in iframe
    };
    const onFocus = () => armIdleTimer();
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      clearIdleTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Release the session if the window unmounts (closed).
  useEffect(() => {
    return () => {
      clearIdleTimer();
      releaseSession();
    };
  }, []);

  if (!w) return null;

  async function startRemote(url: string) {
    try {
      const res = await fetch("/api/browser/session", { method: "POST" });
      if (!res.ok) {
        // Unconfigured (503) or create error → degrade to v1 fallback.
        setStatus("blocked");
        setEmbedUrl(url);
        setMessage("This site can't be shown here.");
        return;
      }
      const body = await res.json();
      sessionIdRef.current = body.sessionId;
      setLiveViewUrl(body.liveViewUrl);
      setStatus("remote");
      // Point the fresh session at the requested page.
      await fetch("/api/browser/navigate", {
        method: "POST",
        body: JSON.stringify({ sessionId: body.sessionId, url }),
      }).catch(() => {});
    } catch {
      setStatus("blocked");
      setEmbedUrl(url);
      setMessage("This site can't be shown here.");
    }
  }

  async function navigateRemote(url: string) {
    setStatus("remote");
    armIdleTimer();
    await fetch("/api/browser/navigate", {
      method: "POST",
      body: JSON.stringify({ sessionId: sessionIdRef.current, url }),
    }).catch(() => {});
  }

  async function go() {
    setEmbedUrl("");
    const normalized = normalizeUrl(input);
    if (!normalized.ok) {
      setStatus("error");
      setMessage(normalized.reason);
      return;
    }
    setStatus("checking");
    setMessage("");

    let embeddable = false;
    let badInput = false;
    try {
      const res = await fetch(`/api/embed-check?url=${encodeURIComponent(normalized.url)}`);
      if (res.status === 400) {
        badInput = true;
      } else if (res.ok) {
        const body = await res.json();
        embeddable = Boolean(body.embeddable);
      }
    } catch {
      embeddable = false; // unreachable check → try remote
    }

    if (badInput) {
      setStatus("error");
      setMessage("Could not load address");
      return;
    }

    if (embeddable) {
      // Free path: drop any paid session and use a plain iframe.
      if (sessionIdRef.current) stopRemote("embedded");
      setEmbedUrl(normalized.url);
      setStatus("embedded");
      return;
    }

    // Remote path.
    if (sessionIdRef.current) {
      await navigateRemote(normalized.url);
    } else {
      await startRemote(normalized.url);
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
            onFocus={clearIdleTimer}
            style={{ flex: 1 }}
            aria-label="Address"
          />
          <button onClick={go}>Go</button>
          {status === "remote" && (
            <button onClick={() => stopRemote("idle")}>Stop session</button>
          )}
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
          {status === "remote" && (
            <iframe
              ref={iframeRef}
              title="Remote browser"
              src={liveViewUrl}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              allow="clipboard-read; clipboard-write"
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

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint (the idle effect uses an eslint-disable for exhaustive-deps)**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/windows/BrowserWindow.tsx
git commit -m "feat(browser): hybrid iframe + Browserbase remote mode with strict auto-close"
```

---

### Task 6: Full gate (final verification)

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `cd frontend && npm test`
Expected: all pass, including `browserbase`, `session`, `navigate`, `end` route tests.

- [ ] **Step 2: Type-check + lint**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `cd frontend && npm run build`
Expected: build succeeds; `/api/browser/session`, `/api/browser/navigate`, `/api/browser/end` listed as dynamic (ƒ) routes.

(No commit — verification only. If anything fails, fix in the relevant task and re-run.)

---

## Out-of-band (user action, not code)

The remote path is inert until these exist in the Vercel project env (and local `.env.local` for dev):
- `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` from a **paid** Browserbase account (keepAlive requires a paid plan).

Without them, the window degrades to v1 behavior (iframe for embeddable sites; "open in new tab" otherwise) — by design.
