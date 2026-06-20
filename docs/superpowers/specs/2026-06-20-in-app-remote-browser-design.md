# In-App Remote Browser (Hybrid) — Design

**Date:** 2026-06-20
**Status:** Approved (design); pending implementation plan
**Author:** brainstorming session
**Supersedes:** the open-in-new-tab fallback of
`2026-06-20-embedded-browser-window-design.md` (v1). v1's `embed-url`,
`ssrf-guard`, and `/api/embed-check` are **reused**, not removed.

## 1. Goal

Let players browse **any** site *inside* the XP Arcade "Internet" window — not
open a new tab. Sites that allow framing render in a free iframe; sites that
refuse framing (YouTube, logged-in services, JS-heavy apps) render through a
real cloud browser (Browserbase) whose interactive live view is embedded in the
window. The user sees one window with a URL bar; the rendering path is chosen
automatically.

### Non-goals

- Not building a custom WebSocket pixel-streamer — Browserbase's live view URL
  is iframe-embeddable and already interactive.
- No multi-tab, bookmarks, or history in this iteration (YAGNI).
- No persistence of remote sessions across window closes.

## 2. Approach (chosen: A — Hybrid)

On navigation:

1. `normalizeUrl` the URL-bar input.
2. `GET /api/embed-check` (from v1) → **embeddable?**
3. **Embeddable** → render in a plain sandboxed iframe (free; no session).
4. **Blocked / check fails** → create a Browserbase session and embed its
   interactive live-view URL (paid; one session at a time).

Rationale: every site renders in-app, and a paid cloud session is only spun up
for sites that genuinely cannot be framed — aligned with the "auto-close chặt"
cost preference.

## 3. Components

Each unit has one responsibility and a defined interface.

### Environment

- `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` — added to
  `frontend/.env.example` and required Vercel env (documented in
  `environment-quirks.md`). When **absent**, the remote path degrades gracefully
  (see §5) to v1 behavior (iframe + "open in new tab").

### `lib/browserbase.ts` (server-only)

Wraps `@browserbasehq/sdk` + `playwright-core`. Never imported by client code.

- `createSession(): Promise<{ sessionId: string; liveViewUrl: string }>` —
  `bb.sessions.create({ projectId, keepAlive: true, timeout: 300 })`, then
  `bb.sessions.debug(id).debuggerFullscreenUrl` for the live view.
- `navigate(sessionId: string, url: string): Promise<{ title: string }>` —
  reconstruct the CDP URL server-side
  (`wss://connect.browserbase.com?apiKey=<key>&sessionId=<id>`),
  `chromium.connectOverCDP(connectUrl)`, `page.goto(url, { waitUntil: "domcontentloaded" })`,
  read `page.title()`, then `browser.close()` (disconnects CDP; `keepAlive`
  keeps the remote session alive).
- `endSession(sessionId: string): Promise<void>` —
  `bb.sessions.update(id, { projectId, status: "REQUEST_RELEASE" })`.
- `isConfigured(): boolean` — both env vars present.

`connectUrl` and the API key never leave the server.

### `app/api/browser/session/route.ts`

`POST` → if `!isConfigured()` return `503 { error: "remote-browser-unconfigured" }`;
else `createSession()` → `{ sessionId, liveViewUrl }`, `Cache-Control: no-store`.

### `app/api/browser/navigate/route.ts`

`POST { sessionId, url }` → validate `url` via `normalizeUrl` (400 on bad input);
`navigate(sessionId, normalized.url)` → `{ ok: true, title }`. On Browserbase
error → `{ ok: false, reason }` (the UI keeps the live view; user can retry).

### `app/api/browser/end/route.ts`

`POST { sessionId }` → `endSession(sessionId)` → `{ ok: true }`. Designed to be
called via `navigator.sendBeacon` on window unmount (best-effort; the Browserbase
`timeout` is the backstop).

### `components/windows/BrowserWindow.tsx` (extends v1)

Adds a `remote` rendering mode and session lifecycle on top of v1's states.

- States: `idle | checking | embedded(iframe) | remote(liveView) | blocked | error`.
- One session at a time, held in component state (`sessionId`, `liveViewUrl`).
- On a `blocked` verdict: POST `/api/browser/session`; on success switch to
  `remote` and embed `liveViewUrl` in an iframe; on 503 → fall back to v1
  `blocked` panel ("open in new tab"); on other error → `error`.
- In `remote` mode the URL bar's Go posts to `/api/browser/navigate`.
- "Stop session" button shown in `remote` mode → ends the session, returns to
  idle.
- **Auto-close (strict):** end the session when any of these occur — window
  closed/unmounted (sendBeacon), navigating to an embeddable (iframe) site,
  returning to idle, "Stop session", or the idle timer below. All timers cleared
  on unmount.
- **Idle timer caveat (cross-origin iframe):** the parent page cannot observe
  pointer/key events *inside* the live-view iframe (it is cross-origin). So
  "activity" is inferred conservatively: (a) any interaction with our own window
  chrome (URL bar, buttons) resets the timer; (b) while the iframe holds focus —
  detected via the window `blur` event with `document.activeElement === <the
  iframe>` — the idle countdown is **paused** (treated as active). The countdown
  only runs when focus is outside the iframe and the chrome is idle. The
  Browserbase server-side `timeout` (~300s) is the authoritative hard cap; the
  client idle timer is a best-effort cost saver, deliberately biased against
  killing a focused session.

### Dependencies

- `@browserbasehq/sdk`, `playwright-core` (server-only; `connectOverCDP` does
  **not** download a Chromium binary).

## 4. Data flow

```
type URL → normalizeUrl → GET /api/embed-check
  ├─ embeddable        → <iframe sandbox src=url>           (free)
  └─ blocked/uncertain → POST /api/browser/session
        → { sessionId, liveViewUrl } → <iframe src=liveViewUrl>  (paid, interactive)
        → later Go      → POST /api/browser/navigate {sessionId,url}
        → close/idle/switch → POST /api/browser/end (sendBeacon)
```

## 5. Error handling & security

- **Cost safety:** single session; Browserbase `timeout` ≈300s; auto-end on
  close/idle/mode-switch; explicit "Stop session" control.
- **Secret isolation:** API key + `connectUrl` are server-only; the client only
  ever sees `sessionId` + `liveViewUrl`.
- **Unconfigured env:** every `/api/browser/*` route returns `503` and the UI
  degrades to v1 behavior (iframe for embeddable sites, "open in new tab"
  otherwise) — the feature never hard-crashes without Browserbase.
- **Session create / navigate failure:** fall back to the v1 "open in new tab"
  panel (create) or keep the live view and surface a retry message (navigate).
- **Input validation:** `normalizeUrl` rejects non-http(s) and junk before any
  session or navigation.

## 6. Testing

- `lib/browserbase.test.ts` — mock `@browserbasehq/sdk` + `playwright-core`:
  `createSession` passes `keepAlive` + `timeout` + `projectId` and returns the
  fullscreen live-view URL; `navigate` connects with the reconstructed CDP URL,
  calls `goto`, and closes; `endSession` issues `REQUEST_RELEASE`; assert the
  API key / connectUrl never appear in any returned value; `isConfigured`
  reflects env presence.
- `app/api/browser/session/route.test.ts` — `503` when unconfigured; happy path
  returns `{ sessionId, liveViewUrl }` with `no-store`.
- `app/api/browser/navigate/route.test.ts` — bad/missing url → `400`; happy path
  calls `navigate` and returns `{ ok, title }`.
- `app/api/browser/end/route.test.ts` — calls `endSession`; returns `{ ok }`.
- `BrowserWindow` — light/manual coverage (iframe + live view depend on
  runtime); unit-test any pure helper extracted for the idle timer if practical.

## 7. Defaults locked in

- Strict auto-close: one session, ~300s server timeout, ~2-minute idle close,
  close on window close / mode switch.
- Provider: Browserbase, behind `lib/browserbase.ts` so a future provider swap
  touches one file.
- Missing env degrades silently to v1 behavior.
