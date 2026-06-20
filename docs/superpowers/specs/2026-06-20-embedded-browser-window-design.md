# Embedded Browser Window — Design

**Date:** 2026-06-20
**Status:** Approved (design); pending implementation plan
**Author:** brainstorming session

## 1. Goal

Let players keep something on screen alongside a game — e.g. listen to music,
read a page — via a Win95-styled "Internet" window inside XP Arcade. The window
behaves like a minimal Internet Explorer: a URL bar and a **Go** button.

### Non-goals (explicitly out of scope)

- **Not** a general-purpose web proxy. We do not fetch/rewrite page bodies.
- **Not** a real Chrome. A web app is sandboxed by the browser; sites that
  refuse framing (most logged-in services, SPAs, anti-bot) cannot be embedded.
  This is a hard platform limit, accepted by design.
- No bookmarks, history, back/forward, or tabs in v1 (YAGNI — may follow later).
- No NFT / contract interaction. This window never touches the chain.

## 2. Approach (chosen: "hybrid web window")

On navigation:

1. Normalize the user's input into a valid URL.
2. Ask an internal API (`/api/embed-check`) whether the URL is **embeddable**
   (header-only check — no body proxying).
3. If embeddable → render it in a sandboxed `<iframe>` inside the window.
4. If blocked (or the check fails/times out) → show a Win95 notice with an
   **"Open in new tab"** button (`window.open`).

Rationale: no body proxying ⇒ no ToS/bandwidth/SSRF-body exposure; embeddable
sites work in-window; everything else still opens reliably next to the game.

## 3. Components

Each unit has one clear purpose, a defined interface, and minimal dependencies.

### `state/window-manager.ts` (small edit)

Add `"browser"` to the `WindowType` union. No payload needed. Opening uses the
existing `open("browser")`; the window follows the same single-instance,
focus/minimize/maximize behavior as every other window.

### `lib/embed-url.ts` (pure, unit-tested)

- **Input:** raw user string from the URL bar.
- **Output:** `{ ok: true, url: string } | { ok: false, reason: string }`.
- Adds `https://` when no scheme is present; validates via `URL`; rejects
  non-`http(s)` schemes (`javascript:`, `file:`, `data:`, etc.).
- No React/DOM dependency.

### `lib/ssrf-guard.ts` (pure, unit-tested)

- **Input:** a URL string (already syntactically valid).
- **Output:** `{ safe: true } | { safe: false, reason: string }`.
- Allows only `http`/`https`.
- Blocks `localhost`, `*.local`, loopback (`127.0.0.0/8`, `::1`), private ranges
  (`10/8`, `172.16/12`, `192.168/16`), link-local (`169.254/16`, incl. cloud
  metadata `169.254.169.254`), and `0.0.0.0`.
- Used by the API route before any `fetch`.

### `app/api/embed-check/route.ts`

- `GET /api/embed-check?url=<encoded>`.
- Validate with `embed-url` + `ssrf-guard`; on failure → `400`.
- `fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(~3000) })`.
  Read **headers only**; do not consume/forward the body.
- If the response is a redirect (3xx), read `Location`, re-run `ssrf-guard`
  against the resolved URL, and base the verdict on the redirect target's
  reachability — never auto-follow into an unchecked host.
- Verdict logic:
  - `X-Frame-Options` present (`DENY`/`SAMEORIGIN`) ⇒ **not embeddable**.
  - CSP `frame-ancestors` that excludes our origin ⇒ **not embeddable**.
  - Otherwise ⇒ **embeddable**.
- Response: `{ embeddable: boolean, reason: string, finalUrl: string }`,
  `Cache-Control: no-store`.
- Any error/timeout ⇒ respond `embeddable: false` (fail safe to "open in tab").
- **Next.js 16 note:** read `node_modules/next/dist/docs/` for the current
  route-handler API before writing this file (per `frontend/AGENTS.md`).

### `components/windows/BrowserWindow.tsx`

- Subscribes to its own entry (`type === "browser"`), mirroring the other
  window components; rendered in `app/page.tsx`.
- Local component state only (current URL, status) — **no new Zustand store**.
- States: `idle` (homepage), `checking`, `embedded`, `blocked`, `error`.
- **Homepage (idle):** a simple Win95 start page — short hint text ("Type an
  address and press Go"). No external content loaded on open.
- Iframe attributes:
  `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"`.
  (`allow-same-origin` kept so framed sites function; documented trade-off.)
- `blocked`/`error` state shows the URL + an **"Open in new tab"** button.

### Launch entry points

Add, following existing patterns:
- A Desktop icon ("Internet") that calls `open("browser")`.
- A Start menu item.
- A Taskbar label entry for `"browser"` → "Internet".

## 4. Data flow

```
user types URL
  → embed-url.normalize()        (client)
  → BrowserWindow GET /api/embed-check?url=…
      → ssrf-guard.check()       (server)
      → fetch headers (timeout, manual redirect)
      → verdict {embeddable, finalUrl}
  → embeddable ? <iframe sandbox src=finalUrl> : "Open in new tab" fallback
```

## 5. Error handling & security

- **SSRF:** scheme allowlist + internal-host/IP blocklist; hard timeout; no
  auto-redirect into unchecked hosts. The endpoint only ever reads headers.
- **iframe isolation:** always `sandbox`. Fail-safe default is "not embeddable".
- **Bad input:** `embed-url` rejects non-http(s) schemes before any request.
- **Network/timeout:** treated as not-embeddable → fallback to open-in-tab.

## 6. Testing

- `lib/embed-url.test.ts` — adds https, rejects `javascript:`/`file:`/`data:`,
  trims/validates, handles bare domains and full URLs.
- `lib/ssrf-guard.test.ts` — blocks localhost/127.0.0.1/10.x/172.16.x/192.168.x/
  169.254.169.254/::1/0.0.0.0/`*.local`; allows public domains.
- `app/api/embed-check/route.test.ts` — mock fetch: `X-Frame-Options` present →
  `embeddable:false`; CSP `frame-ancestors` excluding origin → false; clean
  headers → true; dirty/blocked URL → `400`; timeout → `embeddable:false`.
- `BrowserWindow` — light/manual coverage only (iframe-dependent).

## 7. Open items resolved as defaults

- **Homepage:** local Win95 start page with a hint (no remote content on open).
- **Sandbox:** keep `allow-same-origin` (broader site compatibility) — noted as
  a deliberate trade-off; can tighten later if abuse appears.
