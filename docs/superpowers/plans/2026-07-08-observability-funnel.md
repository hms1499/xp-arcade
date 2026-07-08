# Observability Funnel Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent event-counting pipeline (emit → Upstash Redis → aggregate → public `/admin/metrics` page) so the live arcade's play→mint→claim funnels and error rates are visible.

**Architecture:** Client emits funnel/error events through the existing `lib/telemetry.ts` helper to the existing `POST /api/telemetry` route, which now increments Redis counters (per-event, per-game, per-day) with a 90-day TTL. A server-only `GET /api/metrics/summary` reads the counters and a pure aggregator computes totals + conversion %. A Win95-styled page renders it. All Redis calls are wrapped so telemetry never breaks the app, and a no-op fallback means local dev/tests need no Redis.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zustand 5, `@upstash/redis`, Vitest 3, `98.css`.

## Global Constraints

- Path must not contain spaces (Vitest breaks on `%20`) — do not move the repo.
- Frontend-only. **No contract change.** No new public contract functions.
- Privacy: never store wallet addresses or txids — counts only. The existing
  `redactSensitiveText` must keep redacting error messages.
- Telemetry must **never break the app**: every Redis call is wrapped in
  try/catch; missing env / Redis outage → no-op, request still returns 202.
- Game slugs are the real `GameId` union from `lib/game-registry.ts`:
  `snake | tetris | pacman | breakout | minesweeper | solitaire`. Reuse
  `GAME_IDS`; do **not** invent new slugs (it is `breakout`, not `bricks`).
- Test runner: `npm test` (= `vitest run`) run from `frontend/`. Type-check:
  `npm run typecheck` (= `tsc --noEmit`). Run both from `frontend/`.
- Follow the repo convention: pure functions in `lib/*.ts` each with a 1-1
  `*.test.ts`; keep I/O (Redis) behind a thin, mockable wrapper.
- Commit conventions: conventional prefixes, small green commits, stage explicit
  files, **no `Co-Authored-By`**.

---

### Task 1: Redis wrapper with no-op fallback

Thin, mockable Upstash wrapper. Missing env (local/CI) → no-op so nothing else
needs a live Redis. Uses a test-injection hook mirroring `rate-limit.ts`'s
`_resetRateLimitForTests`.

**Files:**
- Modify: `frontend/package.json` (add `@upstash/redis` dependency)
- Modify: `frontend/.env.example` (document the two Upstash env vars)
- Create: `frontend/lib/redis.ts`
- Test: `frontend/lib/redis.test.ts`

**Interfaces:**
- Produces:
  - `incrWithTtl(key: string, ttlSeconds?: number): Promise<void>`
  - `mget(keys: string[]): Promise<(number | null)[]>`
  - `_setRedisForTests(client: MinimalRedis | null): void` (test hook)
  - `type MinimalRedis = { incr(key: string): Promise<number>; expire(key: string, seconds: number): Promise<unknown>; mget<T = string>(...keys: string[]): Promise<(T | null)[]> }`

- [ ] **Step 1: Install the dependency**

Run from `frontend/`:
```bash
npm install @upstash/redis
```
Expected: `@upstash/redis` appears under `dependencies` in `frontend/package.json`.

- [ ] **Step 2: Document env vars in `.env.example`**

Append to `frontend/.env.example`:
```bash
# Observability (optional). Provisioned automatically by the Upstash Redis
# integration in the Vercel Marketplace. When unset, metrics counting is a no-op.
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

- [ ] **Step 3: Write the failing test**

Create `frontend/lib/redis.test.ts`:
```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { incrWithTtl, mget, _setRedisForTests } from "./redis";

afterEach(() => {
  _setRedisForTests(null);
});

describe("redis wrapper", () => {
  it("no-ops when no client is configured", async () => {
    _setRedisForTests(null);
    await expect(incrWithTtl("ev:x:2026-07-08", 100)).resolves.toBeUndefined();
    await expect(mget(["ev:x:2026-07-08"])).resolves.toEqual([null]);
  });

  it("incrs then sets ttl when a client is configured", async () => {
    const incr = vi.fn().mockResolvedValue(1);
    const expire = vi.fn().mockResolvedValue(1);
    _setRedisForTests({ incr, expire, mget: vi.fn() });
    await incrWithTtl("ev:mint_confirmed:2026-07-08", 200);
    expect(incr).toHaveBeenCalledWith("ev:mint_confirmed:2026-07-08");
    expect(expire).toHaveBeenCalledWith("ev:mint_confirmed:2026-07-08", 200);
  });

  it("skips expire when ttl is omitted", async () => {
    const incr = vi.fn().mockResolvedValue(1);
    const expire = vi.fn().mockResolvedValue(1);
    _setRedisForTests({ incr, expire, mget: vi.fn() });
    await incrWithTtl("ev:mint_confirmed:total");
    expect(incr).toHaveBeenCalledOnce();
    expect(expire).not.toHaveBeenCalled();
  });

  it("coerces mget string values to numbers", async () => {
    const mgetFn = vi.fn().mockResolvedValue(["3", null, 5]);
    _setRedisForTests({ incr: vi.fn(), expire: vi.fn(), mget: mgetFn });
    await expect(mget(["a", "b", "c"])).resolves.toEqual([3, null, 5]);
  });

  it("swallows client errors and returns safe defaults", async () => {
    _setRedisForTests({
      incr: vi.fn().mockRejectedValue(new Error("boom")),
      expire: vi.fn(),
      mget: vi.fn().mockRejectedValue(new Error("boom")),
    });
    await expect(incrWithTtl("k", 10)).resolves.toBeUndefined();
    await expect(mget(["k"])).resolves.toEqual([null]);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run from `frontend/`: `npm test -- lib/redis.test.ts`
Expected: FAIL — `Cannot find module './redis'`.

- [ ] **Step 5: Implement `lib/redis.ts`**

Create `frontend/lib/redis.ts`:
```typescript
import { Redis } from "@upstash/redis";

export type MinimalRedis = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  mget<T = string>(...keys: string[]): Promise<(T | null)[]>;
};

let override: MinimalRedis | null | undefined;
let cached: MinimalRedis | null | undefined;

/** Test hook: force a specific client (or null for the no-op path). */
export function _setRedisForTests(client: MinimalRedis | null): void {
  override = client;
  cached = undefined;
}

function client(): MinimalRedis | null {
  if (override !== undefined) return override;
  if (cached !== undefined) return cached;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  cached = url && token ? (new Redis({ url, token }) as unknown as MinimalRedis) : null;
  return cached;
}

export async function incrWithTtl(key: string, ttlSeconds?: number): Promise<void> {
  const redis = client();
  if (!redis) return;
  try {
    await redis.incr(key);
    if (ttlSeconds) await redis.expire(key, ttlSeconds);
  } catch {
    // Telemetry must never break the app.
  }
}

export async function mget(keys: string[]): Promise<(number | null)[]> {
  const redis = client();
  if (!redis || keys.length === 0) return keys.map(() => null);
  try {
    const raw = await redis.mget<string | number>(...keys);
    return raw.map((v) => (v == null ? null : Number(v)));
  } catch {
    return keys.map(() => null);
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run from `frontend/`: `npm test -- lib/redis.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/.env.example frontend/lib/redis.ts frontend/lib/redis.test.ts
git commit -m "feat(metrics): add mockable Upstash redis wrapper with no-op fallback"
```

---

### Task 2: Metrics key builder (pure)

**Files:**
- Create: `frontend/lib/metrics-keys.ts`
- Test: `frontend/lib/metrics-keys.test.ts`

**Interfaces:**
- Produces:
  - `EVENT_TTL_SECONDS: number` (90 days)
  - `utcDay(d?: Date): string` → `"YYYY-MM-DD"`
  - `dailyKey(event: string, day: string): string` → `ev:<event>:<day>`
  - `dailyGameKey(event: string, game: string, day: string): string` → `ev:<event>:<game>:<day>`
  - `totalKey(event: string): string` → `ev:<event>:total`
  - `keysForRange(event: string, days: number, now?: Date): string[]` (daily-total keys, most-recent first, length = days)

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/metrics-keys.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import {
  EVENT_TTL_SECONDS,
  utcDay,
  dailyKey,
  dailyGameKey,
  totalKey,
  keysForRange,
} from "./metrics-keys";

describe("metrics-keys", () => {
  it("ttl is 90 days in seconds", () => {
    expect(EVENT_TTL_SECONDS).toBe(90 * 24 * 60 * 60);
  });

  it("utcDay formats a UTC date", () => {
    expect(utcDay(new Date("2026-07-08T23:30:00Z"))).toBe("2026-07-08");
    expect(utcDay(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });

  it("builds flat keys", () => {
    expect(dailyKey("mint_confirmed", "2026-07-08")).toBe(
      "ev:mint_confirmed:2026-07-08",
    );
    expect(dailyGameKey("mint_confirmed", "snake", "2026-07-08")).toBe(
      "ev:mint_confirmed:snake:2026-07-08",
    );
    expect(totalKey("mint_confirmed")).toBe("ev:mint_confirmed:total");
  });

  it("keysForRange returns N daily keys, most recent first", () => {
    const keys = keysForRange("game_over", 3, new Date("2026-07-08T12:00:00Z"));
    expect(keys).toEqual([
      "ev:game_over:2026-07-08",
      "ev:game_over:2026-07-07",
      "ev:game_over:2026-07-06",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `frontend/`: `npm test -- lib/metrics-keys.test.ts`
Expected: FAIL — `Cannot find module './metrics-keys'`.

- [ ] **Step 3: Implement `lib/metrics-keys.ts`**

Create `frontend/lib/metrics-keys.ts`:
```typescript
export const EVENT_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function dailyKey(event: string, day: string): string {
  return `ev:${event}:${day}`;
}

export function dailyGameKey(event: string, game: string, day: string): string {
  return `ev:${event}:${game}:${day}`;
}

export function totalKey(event: string): string {
  return `ev:${event}:total`;
}

export function keysForRange(
  event: string,
  days: number,
  now: Date = new Date(),
): string[] {
  const keys: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    keys.push(dailyKey(event, utcDay(d)));
  }
  return keys;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `frontend/`: `npm test -- lib/metrics-keys.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/metrics-keys.ts frontend/lib/metrics-keys.test.ts
git commit -m "feat(metrics): add pure redis key builder"
```

---

### Task 3: Aggregation + conversion (pure)

**Files:**
- Create: `frontend/lib/metrics-summary.ts`
- Test: `frontend/lib/metrics-summary.test.ts`

**Interfaces:**
- Consumes: `keysForRange`, `dailyGameKey`, `totalKey`, `utcDay` from Task 2;
  `GAME_IDS`, `type GameId` from `lib/game-registry`.
- Produces:
  - `type EventCounts = { total: number; byDay: Record<string, number>; byGame: Record<string, number> }`
  - `conversionPct(numerator: number, denominator: number): number` (0 when denom 0; rounded to 1 decimal)
  - `summarizeEvent(event: string, days: number, counts: Record<string, number>, now?: Date): EventCounts`

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/metrics-summary.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { conversionPct, summarizeEvent } from "./metrics-summary";

describe("conversionPct", () => {
  it("returns 0 when denominator is 0", () => {
    expect(conversionPct(5, 0)).toBe(0);
  });
  it("rounds to one decimal", () => {
    expect(conversionPct(1, 3)).toBe(33.3);
    expect(conversionPct(31, 40)).toBe(77.5);
  });
});

describe("summarizeEvent", () => {
  const now = new Date("2026-07-08T12:00:00Z");

  it("sums daily totals across the range", () => {
    const counts = {
      "ev:game_over:2026-07-08": 10,
      "ev:game_over:2026-07-07": 4,
      "ev:game_over:total": 999,
    };
    const s = summarizeEvent("game_over", 2, counts, now);
    expect(s.byDay).toEqual({ "2026-07-08": 10, "2026-07-07": 4 });
    expect(s.total).toBe(999); // prefers the all-time total key when present
  });

  it("falls back to summed days when no total key", () => {
    const counts = { "ev:game_over:2026-07-08": 10, "ev:game_over:2026-07-07": 4 };
    const s = summarizeEvent("game_over", 2, counts, now);
    expect(s.total).toBe(14);
  });

  it("collects per-game counts within the range", () => {
    const counts = {
      "ev:mint_confirmed:snake:2026-07-08": 3,
      "ev:mint_confirmed:snake:2026-07-07": 2,
      "ev:mint_confirmed:tetris:2026-07-08": 1,
    };
    const s = summarizeEvent("mint_confirmed", 2, counts, now);
    expect(s.byGame).toEqual({ snake: 5, tetris: 1 });
  });

  it("treats missing keys as 0", () => {
    const s = summarizeEvent("mint_failed", 2, {}, now);
    expect(s.total).toBe(0);
    expect(s.byDay).toEqual({ "2026-07-08": 0, "2026-07-07": 0 });
    expect(s.byGame).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `frontend/`: `npm test -- lib/metrics-summary.test.ts`
Expected: FAIL — `Cannot find module './metrics-summary'`.

- [ ] **Step 3: Implement `lib/metrics-summary.ts`**

Create `frontend/lib/metrics-summary.ts`:
```typescript
import { GAME_IDS } from "./game-registry";
import {
  dailyGameKey,
  dailyKey,
  totalKey,
  utcDay,
} from "./metrics-keys";

export type EventCounts = {
  total: number;
  byDay: Record<string, number>;
  byGame: Record<string, number>;
};

export function conversionPct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function summarizeEvent(
  event: string,
  days: number,
  counts: Record<string, number>,
  now: Date = new Date(),
): EventCounts {
  const byDay: Record<string, number> = {};
  const byGame: Record<string, number> = {};
  let summedDays = 0;

  for (let i = 0; i < days; i += 1) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const day = utcDay(d);
    const n = counts[dailyKey(event, day)] ?? 0;
    byDay[day] = n;
    summedDays += n;
    for (const game of GAME_IDS) {
      const g = counts[dailyGameKey(event, game, day)] ?? 0;
      if (g > 0) byGame[game] = (byGame[game] ?? 0) + g;
    }
  }

  const totalKeyValue = counts[totalKey(event)];
  const total = totalKeyValue != null ? totalKeyValue : summedDays;
  return { total, byDay, byGame };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `frontend/`: `npm test -- lib/metrics-summary.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/metrics-summary.ts frontend/lib/metrics-summary.test.ts
git commit -m "feat(metrics): add pure funnel aggregation + conversion"
```

---

### Task 4: Extend telemetry — funnel events + `trackFunnel`

Extend the existing emitter to carry funnel events with a `game` dimension,
keeping `reportClientError`'s signature unchanged.

**Files:**
- Modify: `frontend/lib/telemetry.ts`
- Create: `frontend/lib/telemetry.test.ts`

**Interfaces:**
- Consumes: `GAME_IDS`, `type GameId` from `lib/game-registry`.
- Produces:
  - `FUNNEL_EVENTS: readonly string[]` = `["game_over","mint_attempted","mint_confirmed","mint_failed","claim_attempted","claim_confirmed","claim_failed"]`
  - `type FunnelEvent`
  - `ALL_EVENTS: readonly string[]` (errors ∪ funnel)
  - `isFunnelEvent(event: string): boolean`
  - updated `sanitizeTelemetryPayload` returning `{ event, message, path?, game? }`
  - `trackFunnel(event: FunnelEvent, opts?: { game?: GameId }): void`
  - unchanged `reportClientError(event: TelemetryEvent, error: unknown): void`

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/telemetry.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import {
  sanitizeTelemetryPayload,
  isFunnelEvent,
  FUNNEL_EVENTS,
} from "./telemetry";

describe("sanitizeTelemetryPayload", () => {
  it("accepts an error event and redacts the message", () => {
    const p = sanitizeTelemetryPayload({
      event: "wallet_connect_error",
      message: "boom SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV",
    });
    expect(p?.event).toBe("wallet_connect_error");
    expect(p?.message).toContain("[address]");
    expect(p?.game).toBeUndefined();
  });

  it("accepts a funnel event with a valid game and drops the message", () => {
    const p = sanitizeTelemetryPayload({
      event: "mint_confirmed",
      game: "snake",
      message: "should be ignored",
    });
    expect(p?.event).toBe("mint_confirmed");
    expect(p?.game).toBe("snake");
    expect(p?.message).toBe("");
  });

  it("accepts a funnel event without a game", () => {
    const p = sanitizeTelemetryPayload({ event: "game_over" });
    expect(p?.event).toBe("game_over");
    expect(p?.game).toBeUndefined();
  });

  it("rejects an invalid game slug", () => {
    const p = sanitizeTelemetryPayload({ event: "mint_confirmed", game: "bricks" });
    expect(p?.game).toBeUndefined();
  });

  it("rejects an unknown event", () => {
    expect(sanitizeTelemetryPayload({ event: "nope" })).toBeNull();
  });

  it("catalogs the seven funnel events", () => {
    expect(FUNNEL_EVENTS).toHaveLength(7);
    expect(isFunnelEvent("mint_attempted")).toBe(true);
    expect(isFunnelEvent("wallet_connect_error")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `frontend/`: `npm test -- lib/telemetry.test.ts`
Expected: FAIL — `isFunnelEvent`/`FUNNEL_EVENTS` are not exported.

- [ ] **Step 3: Rewrite `lib/telemetry.ts`**

Replace the contents of `frontend/lib/telemetry.ts` with:
```typescript
import { GAME_IDS, type GameId } from "./game-registry";

export const TELEMETRY_EVENTS = [
  "wallet_connect_error",
  "tx_confirmation_timeout",
  "holdings_total_failure",
] as const;

export const FUNNEL_EVENTS = [
  "game_over",
  "mint_attempted",
  "mint_confirmed",
  "mint_failed",
  "claim_attempted",
  "claim_confirmed",
  "claim_failed",
] as const;

export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number];
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];
export type AnyEvent = TelemetryEvent | FunnelEvent;

export const ALL_EVENTS: readonly string[] = [
  ...TELEMETRY_EVENTS,
  ...FUNNEL_EVENTS,
];

export function isFunnelEvent(event: string): event is FunnelEvent {
  return (FUNNEL_EVENTS as readonly string[]).includes(event);
}

type TelemetryPayload = {
  event: AnyEvent;
  message: string;
  path?: string;
  game?: GameId;
};

const ADDRESS_PATTERN = /\b(?:SP|ST)[A-Z0-9]{20,}\b/g;
const TX_PATTERN = /\b0x[a-fA-F0-9]{32,}\b/g;

export function redactSensitiveText(value: string): string {
  return value
    .replace(ADDRESS_PATTERN, "[address]")
    .replace(TX_PATTERN, "[txid]");
}

function isValidGame(value: unknown): value is GameId {
  return typeof value === "string" && (GAME_IDS as string[]).includes(value);
}

export function sanitizeTelemetryPayload(
  value: unknown,
): TelemetryPayload | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.event !== "string" ||
    !ALL_EVENTS.includes(input.event)
  ) {
    return null;
  }
  const event = input.event as AnyEvent;
  const game = isValidGame(input.game) ? input.game : undefined;
  // Funnel events carry a game dimension, not a free-text message.
  const message = isFunnelEvent(event)
    ? ""
    : redactSensitiveText(
        typeof input.message === "string" ? input.message : "Unknown client error",
      ).slice(0, 300);
  const path =
    typeof input.path === "string"
      ? redactSensitiveText(input.path).slice(0, 120)
      : undefined;
  return { event, message, path, game };
}

function send(body: string): void {
  if (typeof window === "undefined") return;
  if (navigator.sendBeacon?.("/api/telemetry", body)) return;
  void fetch("/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export function reportClientError(
  event: TelemetryEvent,
  error: unknown,
): void {
  if (typeof window === "undefined") return;
  const message = error instanceof Error ? error.message : String(error);
  const payload = sanitizeTelemetryPayload({
    event,
    message,
    path: window.location.pathname,
  });
  if (!payload) return;
  send(JSON.stringify(payload));
}

export function trackFunnel(
  event: FunnelEvent,
  opts: { game?: GameId } = {},
): void {
  if (typeof window === "undefined") return;
  const payload = sanitizeTelemetryPayload({
    event,
    game: opts.game,
    path: window.location.pathname,
  });
  if (!payload) return;
  send(JSON.stringify(payload));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `frontend/`: `npm test -- lib/telemetry.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/telemetry.ts frontend/lib/telemetry.test.ts
git commit -m "feat(metrics): extend telemetry with funnel events + trackFunnel"
```

---

### Task 5: Count events in the ingest route

Wire Redis counting into the existing `POST /api/telemetry`, keeping the error
log path intact.

**Files:**
- Modify: `frontend/app/api/telemetry/route.ts`
- Modify: `frontend/app/api/telemetry/route.test.ts`

**Interfaces:**
- Consumes: `sanitizeTelemetryPayload`, `isFunnelEvent` (Task 4);
  `incrWithTtl` (Task 1); `dailyKey`, `dailyGameKey`, `totalKey`,
  `utcDay`, `EVENT_TTL_SECONDS` (Task 2); `_setRedisForTests` (Task 1) in tests.

- [ ] **Step 1: Add failing tests**

Add to `frontend/app/api/telemetry/route.test.ts` (keep the existing tests; add
these inside the same `describe`):
```typescript
import { _setRedisForTests } from "@/lib/redis";

// ...existing tests unchanged...

  it("increments counters for a funnel event", async () => {
    const incr = vi.fn().mockResolvedValue(1);
    const expire = vi.fn().mockResolvedValue(1);
    _setRedisForTests({ incr, expire, mget: vi.fn() });

    const response = await POST(
      new Request("http://localhost/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.1" },
        body: JSON.stringify({ event: "mint_confirmed", game: "snake" }),
      }),
    );

    expect(response.status).toBe(202);
    const keys = incr.mock.calls.map((c) => c[0]);
    expect(keys).toContain("ev:mint_confirmed:total");
    expect(keys.some((k) => k.startsWith("ev:mint_confirmed:2026") || /ev:mint_confirmed:\d{4}-\d{2}-\d{2}$/.test(k))).toBe(true);
    expect(keys.some((k) => k.startsWith("ev:mint_confirmed:snake:"))).toBe(true);
    _setRedisForTests(null);
  });

  it("still returns 202 when redis throws", async () => {
    _setRedisForTests({
      incr: vi.fn().mockRejectedValue(new Error("down")),
      expire: vi.fn(),
      mget: vi.fn(),
    });
    const response = await POST(
      new Request("http://localhost/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.2" },
        body: JSON.stringify({ event: "game_over", game: "tetris" }),
      }),
    );
    expect(response.status).toBe(202);
    _setRedisForTests(null);
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run from `frontend/`: `npm test -- app/api/telemetry/route.test.ts`
Expected: FAIL — funnel event currently 202s but never calls `incr`.

- [ ] **Step 3: Update the route**

Replace `frontend/app/api/telemetry/route.ts` with:
```typescript
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { isFunnelEvent, sanitizeTelemetryPayload } from "@/lib/telemetry";
import { incrWithTtl } from "@/lib/redis";
import {
  EVENT_TTL_SECONDS,
  dailyGameKey,
  dailyKey,
  totalKey,
  utcDay,
} from "@/lib/metrics-keys";

// Play emits more events than errors do, so allow a more generous window.
const LIMIT = 60;
const WINDOW_MS = 60_000;

async function countEvent(event: string, game?: string): Promise<void> {
  const day = utcDay();
  await incrWithTtl(dailyKey(event, day), EVENT_TTL_SECONDS);
  await incrWithTtl(totalKey(event));
  if (game) await incrWithTtl(dailyGameKey(event, game, day), EVENT_TTL_SECONDS);
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anon";
  const limit = rateLimit(`telemetry:${ip}`, LIMIT, WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const payload = sanitizeTelemetryPayload(
    await request.json().catch(() => null),
  );
  if (!payload) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  await countEvent(payload.event, payload.game);
  if (!isFunnelEvent(payload.event)) {
    console.error(`[client-telemetry] ${JSON.stringify(payload)}`);
  }
  return new NextResponse(null, { status: 202 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run from `frontend/`: `npm test -- app/api/telemetry/route.test.ts`
Expected: PASS (existing 2 + new 2). Note: the existing "logs a sanitized
allowed event" test still passes because `wallet_connect_error` is not a funnel
event, so `console.error` still fires.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/api/telemetry/route.ts frontend/app/api/telemetry/route.test.ts
git commit -m "feat(metrics): count funnel + error events in ingest route"
```

---

### Task 6: Summary read endpoint

**Files:**
- Create: `frontend/app/api/metrics/summary/route.ts`
- Test: `frontend/app/api/metrics/summary/route.test.ts`

**Interfaces:**
- Consumes: `mget` (Task 1); `ALL_EVENTS` (Task 4); `keysForRange`,
  `dailyGameKey`, `totalKey`, `utcDay` (Task 2); `summarizeEvent`,
  `type EventCounts` (Task 3); `GAME_IDS` (game-registry).
- Produces: `GET(request: Request): Promise<Response>` returning
  `{ days: number, generatedAt: string, events: Record<string, EventCounts> }`.

- [ ] **Step 1: Write the failing test**

Create `frontend/app/api/metrics/summary/route.test.ts`:
```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { _setRedisForTests } from "@/lib/redis";
import { GET } from "./route";

afterEach(() => _setRedisForTests(null));

describe("GET /api/metrics/summary", () => {
  it("returns per-event counts and a cache header", async () => {
    // mget echoes 1 for any requested key so totals are deterministic.
    _setRedisForTests({
      incr: vi.fn(),
      expire: vi.fn(),
      mget: vi.fn((...keys: string[]) => Promise.resolve(keys.map(() => "1"))),
    });

    const response = await GET(
      new Request("http://localhost/api/metrics/summary?days=7"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage");
    const body = await response.json();
    expect(body.days).toBe(7);
    expect(body.events.mint_confirmed).toBeDefined();
    expect(body.events.game_over).toBeDefined();
  });

  it("clamps days to the max", async () => {
    _setRedisForTests({
      incr: vi.fn(),
      expire: vi.fn(),
      mget: vi.fn((...keys: string[]) => Promise.resolve(keys.map(() => null))),
    });
    const response = await GET(
      new Request("http://localhost/api/metrics/summary?days=9999"),
    );
    const body = await response.json();
    expect(body.days).toBe(90);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `frontend/`: `npm test -- app/api/metrics/summary/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement the route**

Create `frontend/app/api/metrics/summary/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { mget } from "@/lib/redis";
import { ALL_EVENTS } from "@/lib/telemetry";
import { GAME_IDS } from "@/lib/game-registry";
import {
  dailyGameKey,
  keysForRange,
  totalKey,
  utcDay,
} from "@/lib/metrics-keys";
import { summarizeEvent, type EventCounts } from "@/lib/metrics-summary";

export const dynamic = "force-dynamic";

const MAX_DAYS = 90;
const DEFAULT_DAYS = 30;

function parseDays(value: string | null): number {
  const n = Number(value ?? DEFAULT_DAYS);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_DAYS;
  return Math.min(Math.floor(n), MAX_DAYS);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = parseDays(url.searchParams.get("days"));
  const now = new Date();

  // Build every key we need across all events, fetch once, then aggregate.
  const keySet = new Set<string>();
  for (const event of ALL_EVENTS) {
    keysForRange(event, days, now).forEach((k) => keySet.add(k));
    keySet.add(totalKey(event));
    for (let i = 0; i < days; i += 1) {
      const day = utcDay(new Date(now.getTime() - i * 86_400_000));
      for (const game of GAME_IDS) keySet.add(dailyGameKey(event, game, day));
    }
  }
  const keys = [...keySet];
  const values = await mget(keys);
  const counts: Record<string, number> = {};
  keys.forEach((k, i) => {
    const v = values[i];
    if (v != null) counts[k] = v;
  });

  const events: Record<string, EventCounts> = {};
  for (const event of ALL_EVENTS) {
    events[event] = summarizeEvent(event, days, counts, now);
  }

  return NextResponse.json(
    { days, generatedAt: now.toISOString(), events },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `frontend/`: `npm test -- app/api/metrics/summary/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/api/metrics/summary/route.ts frontend/app/api/metrics/summary/route.test.ts
git commit -m "feat(metrics): add public summary read endpoint"
```

---

### Task 7: `/admin/metrics` Win95 page

Public-read page that fetches the summary and renders the funnels + golden
ratios. UI-only; logic is already tested in Tasks 3/6, so verification here is a
manual dev-server check.

**Files:**
- Create: `frontend/app/admin/metrics/page.tsx`

**Interfaces:**
- Consumes: `GET /api/metrics/summary`; `conversionPct` (Task 3);
  `type EventCounts` (Task 3).

- [ ] **Step 1: Implement the page**

Create `frontend/app/admin/metrics/page.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { conversionPct, type EventCounts } from "@/lib/metrics-summary";

type Summary = {
  days: number;
  generatedAt: string;
  events: Record<string, EventCounts>;
};

const FMT = new Intl.NumberFormat("en-US");

function n(e: Record<string, EventCounts>, k: string): number {
  return e[k]?.total ?? 0;
}

export default function MetricsPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/metrics/summary?days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Summary) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [days]);

  const e = data?.events ?? {};
  const played = n(e, "game_over");
  const attempted = n(e, "mint_attempted");
  const confirmed = n(e, "mint_confirmed");
  const failed = n(e, "mint_failed");

  return (
    <div className="window" style={{ maxWidth: 720, margin: "24px auto" }}>
      <div className="title-bar">
        <div className="title-bar-text">Metrics — Product Funnel</div>
      </div>
      <div className="window-body">
        <div style={{ marginBottom: 12 }}>
          <label>
            Range:{" "}
            <select value={days} onChange={(ev) => setDays(Number(ev.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </label>
          {data && (
            <span style={{ marginLeft: 12, color: "#555" }}>
              as of {new Date(data.generatedAt).toLocaleString()}
            </span>
          )}
        </div>

        {error && <p style={{ color: "red" }}>Failed to load: {error}</p>}
        {!data && !error && <p>Loading…</p>}

        {data && (
          <>
            <fieldset>
              <legend>Money funnel</legend>
              <table style={{ width: "100%" }}>
                <tbody>
                  <tr><td>Played (game_over)</td><td align="right">{FMT.format(played)}</td></tr>
                  <tr><td>Mint attempted</td><td align="right">{FMT.format(attempted)}</td></tr>
                  <tr><td>Mint confirmed</td><td align="right">{FMT.format(confirmed)}</td></tr>
                  <tr><td>Mint failed</td><td align="right">{FMT.format(failed)}</td></tr>
                </tbody>
              </table>
              <p><b>Played → attempted:</b> {conversionPct(attempted, played)}%</p>
              <p><b>Attempted → confirmed:</b> {conversionPct(confirmed, attempted)}%</p>
            </fieldset>

            <fieldset style={{ marginTop: 12 }}>
              <legend>Claim funnel</legend>
              <table style={{ width: "100%" }}>
                <tbody>
                  <tr><td>Claim attempted</td><td align="right">{FMT.format(n(e, "claim_attempted"))}</td></tr>
                  <tr><td>Claim confirmed</td><td align="right">{FMT.format(n(e, "claim_confirmed"))}</td></tr>
                  <tr><td>Claim failed</td><td align="right">{FMT.format(n(e, "claim_failed"))}</td></tr>
                </tbody>
              </table>
            </fieldset>

            <fieldset style={{ marginTop: 12 }}>
              <legend>Errors</legend>
              <table style={{ width: "100%" }}>
                <tbody>
                  <tr><td>Wallet connect errors</td><td align="right">{FMT.format(n(e, "wallet_connect_error"))}</td></tr>
                  <tr><td>Tx confirmation timeouts</td><td align="right">{FMT.format(n(e, "tx_confirmation_timeout"))}</td></tr>
                  <tr><td>Holdings load failures</td><td align="right">{FMT.format(n(e, "holdings_total_failure"))}</td></tr>
                </tbody>
              </table>
            </fieldset>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run from `frontend/`: `npm run typecheck`
Expected: clean (no errors).

- [ ] **Step 3: Manual verification**

Run from `frontend/`: `npm run dev`, open `http://localhost:3000/admin/metrics`.
Expected: the window renders with all three fieldsets; with no Redis configured
every number is 0 and the two ratios show `0%` (no crash, no "Failed to load").
Toggling the range re-fetches without error.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/admin/metrics/page.tsx
git commit -m "feat(metrics): add public /admin/metrics funnel page"
```

---

### Task 8: Instrument `game_over`

**Files:**
- Modify: `frontend/lib/record-run.ts`

**Interfaces:**
- Consumes: `trackFunnel` (Task 4).

- [ ] **Step 1: Add the emit**

In `frontend/lib/record-run.ts`, add the import and one call. Final file:
```typescript
import { type GameId } from "./game-registry";
import { useSessionStats } from "@/state/session-stats";
import { useDailyChallenge } from "@/state/daily-challenge";
import { usePlayXp } from "@/state/play-xp";
import { trackFunnel } from "./telemetry";

/**
 * Record a single finished run across every client-side stat store: the
 * in-memory session stats, the persisted lifetime play-XP, and the daily
 * challenge streak. Called from the one game-over chokepoint in useGameSession.
 */
export function recordFinishedRun(gameId: GameId, score: number): void {
  useSessionStats.getState().recordResult(gameId, score);
  usePlayXp.getState().addPlay(gameId, score);
  useDailyChallenge.getState().recordPlay(gameId, score);
  trackFunnel("game_over", { game: gameId });
}
```

- [ ] **Step 2: Type-check + full test**

Run from `frontend/`: `npm run typecheck && npm test -- lib/record-run.test.ts`
Expected: type-check clean; `record-run.test.ts` passes (the emit is a no-op
in the jsdom/no-window test environment — `trackFunnel` returns early when
`window`/`sendBeacon` are absent, so existing assertions are unaffected).

> If `record-run.test.ts` fails because `window` exists in the test env and a
> real `fetch` is attempted, stub it at the top of that test file:
> `vi.stubGlobal("navigator", { sendBeacon: () => true });` — but do not modify
> production code to accommodate tests.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/record-run.ts
git commit -m "feat(metrics): emit game_over at the run chokepoint"
```

---

### Task 9: Instrument `mint_attempted`

**Files:**
- Modify: `frontend/components/shared/SharedMintDialog.tsx` (add import; add one
  call at the start of `handleMint`, currently line 198-219)

**Interfaces:**
- Consumes: `trackFunnel` (Task 4); `gameId: GameId` (already in scope).

- [ ] **Step 1: Add the import**

At the top of `frontend/components/shared/SharedMintDialog.tsx`, alongside the
existing imports, add:
```typescript
import { trackFunnel } from "@/lib/telemetry";
```

- [ ] **Step 2: Emit at the start of `handleMint`**

Change the start of `handleMint` from:
```typescript
  async function handleMint() {
    if (!address) return;
    setBusy(true);
    setError(null);
```
to:
```typescript
  async function handleMint() {
    if (!address) return;
    trackFunnel("mint_attempted", { game: gameId });
    setBusy(true);
    setError(null);
```

- [ ] **Step 3: Type-check**

Run from `frontend/`: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/shared/SharedMintDialog.tsx
git commit -m "feat(metrics): emit mint_attempted on mint click"
```

---

### Task 10: Instrument `mint_confirmed` / `mint_failed`

Single chokepoint: the `watchTx` callback inside the mint store, which already
knows the game.

**Files:**
- Modify: `frontend/state/mint-tx.ts` (add import; emit in the terminal branches
  of the `watchTx` callback, currently lines 37-65)

**Interfaces:**
- Consumes: `trackFunnel` (Task 4); `gameId: GameId` (the `start` parameter).

- [ ] **Step 1: Add the import**

At the top of `frontend/state/mint-tx.ts`, add:
```typescript
import { trackFunnel } from "@/lib/telemetry";
```

- [ ] **Step 2: Emit in the terminal branches**

Inside `start`, change the `watchTx` callback body from:
```typescript
    stopFn = watchTx(txId, (s) => {
      set({ status: s });
      if (s === "pending") return;
      useWallet.getState().setMintPending(false);
      stopFn = null;
      if (s === "success") {
        playSuccess();
        useToasts.getState().push({
          title: "NFT confirmed!",
          body: `Score #${score} NFT is on-chain.`,
          type: "success",
          duration: 6000,
        });
      } else if (s === "timeout") {
```
to:
```typescript
    stopFn = watchTx(txId, (s) => {
      set({ status: s });
      if (s === "pending") return;
      useWallet.getState().setMintPending(false);
      stopFn = null;
      if (s === "success") {
        trackFunnel("mint_confirmed", { game: gameId });
        playSuccess();
        useToasts.getState().push({
          title: "NFT confirmed!",
          body: `Score #${score} NFT is on-chain.`,
          type: "success",
          duration: 6000,
        });
      } else if (s === "timeout") {
        trackFunnel("mint_failed", { game: gameId });
```

Then add a `trackFunnel("mint_failed", ...)` to the final `else` branch. Change:
```typescript
      } else {
        useToasts.getState().push({
          title: "Mint failed",
          body: "Transaction was rejected on-chain.",
          type: "error",
          duration: 5000,
        });
      }
```
to:
```typescript
      } else {
        trackFunnel("mint_failed", { game: gameId });
        useToasts.getState().push({
          title: "Mint failed",
          body: "Transaction was rejected on-chain.",
          type: "error",
          duration: 5000,
        });
      }
```

- [ ] **Step 3: Type-check + test**

Run from `frontend/`: `npm run typecheck && npm test -- state/mint-tx`
Expected: type-check clean; any existing mint-tx tests still pass (`trackFunnel`
no-ops without a browser `sendBeacon`).

- [ ] **Step 4: Commit**

```bash
git add frontend/state/mint-tx.ts
git commit -m "feat(metrics): emit mint_confirmed/mint_failed from the mint watcher"
```

---

### Task 11: Instrument `claim_*`

**Files:**
- Modify: `frontend/components/windows/HighScoreWindow.tsx` (add import; emit in
  the claim `onClick`, currently lines 286-330)

**Interfaces:**
- Consumes: `trackFunnel` (Task 4); `gameId: GameId` (in scope); the
  `outcome` from `classifyClaimTx` (`"confirmed" | "failed" | "pending" | "timeout"`).

- [ ] **Step 1: Add the import**

At the top of `frontend/components/windows/HighScoreWindow.tsx`, add:
```typescript
import { trackFunnel } from "@/lib/telemetry";
```

- [ ] **Step 2: Emit `claim_attempted`**

Change:
```typescript
              onClick={async (e) => {
                e.stopPropagation();
                setClaimingSeason(c.season);
```
to:
```typescript
              onClick={async (e) => {
                e.stopPropagation();
                trackFunnel("claim_attempted", { game: gameId });
                setClaimingSeason(c.season);
```

- [ ] **Step 3: Emit `claim_confirmed` / `claim_failed`**

In the `watchTx` callback, change:
```typescript
                  if (outcome === "confirmed") {
                    setClaimState((prev) => ({
                      ...prev,
                      claims: prev.claims.filter((x) => x.season !== c.season),
                    }));
```
to:
```typescript
                  if (outcome === "confirmed") {
                    trackFunnel("claim_confirmed", { game: gameId });
                    setClaimState((prev) => ({
                      ...prev,
                      claims: prev.claims.filter((x) => x.season !== c.season),
                    }));
```

Then find the closing of the `outcome === "timeout"` branch and add a final
`else` that emits `claim_failed`. The existing structure is:
```typescript
                  } else if (outcome === "timeout") {
                    useToasts.getState().push({
                      title: "Confirmation delayed",
                      // ...existing body...
                    });
                  }
```
Change it to append a failed branch (covers `classifyClaimTx` → `"failed"`):
```typescript
                  } else if (outcome === "timeout") {
                    trackFunnel("claim_failed", { game: gameId });
                    useToasts.getState().push({
                      title: "Confirmation delayed",
                      // ...existing body unchanged...
                    });
                  } else {
                    trackFunnel("claim_failed", { game: gameId });
                  }
```

> Read lines 308-335 of the file first to confirm the exact closing braces of
> the timeout branch before editing; match the surrounding indentation.

- [ ] **Step 4: Type-check + test**

Run from `frontend/`: `npm run typecheck && npm test -- components/windows/HighScoreWindow`
Expected: type-check clean; existing HighScoreWindow tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/windows/HighScoreWindow.tsx
git commit -m "feat(metrics): emit claim_attempted/confirmed/failed"
```

---

### Task 12: Full gate + docs

**Files:**
- Modify: `HANDOFF.md` (add an observability section)

- [ ] **Step 1: Run the full gate**

Run from `frontend/`:
```bash
npm run typecheck && npm test && npm run build
```
Expected: type-check clean; all tests pass (new + existing); production build
succeeds.

- [ ] **Step 2: Document in HANDOFF**

Add a section to `HANDOFF.md` under the to-do area:
```markdown
### Observability — funnel metrics (phase 1) — shipped 2026-07-08

Client emits play→mint→claim funnel events (+ the 3 existing error events)
through `lib/telemetry.ts` → `POST /api/telemetry`, which counts them in Upstash
Redis (per-event/per-game/per-day, 90-day TTL). `GET /api/metrics/summary` +
`/admin/metrics` (public-read, Win95) show the two golden ratios
(played→attempted, attempted→confirmed). No contract change. Redis calls are
guarded; with no `KV_REST_API_*` env the whole pipeline is a no-op.

- [ ] **User action:** install "Upstash for Redis" in the Vercel Marketplace
      (free tier) so `KV_REST_API_URL` / `KV_REST_API_TOKEN` are injected, then
      redeploy. Counters start filling after that.
- [ ] After a day of traffic, read `/admin/metrics` and use the ratios to inform
      the retention work.
- [ ] Future phase 2: economic/on-chain invariant alerting (reuses this store);
      optional password/wallet gate on the page; charts once history exists.
```

- [ ] **Step 3: Commit**

```bash
git add HANDOFF.md
git commit -m "docs: record observability funnel metrics (phase 1)"
```

---

## Self-Review

**Spec coverage:**
- §4 event catalog → Tasks 4 (definitions), 8-11 (emit sites). ✓ (game slug
  corrected to `breakout`; noted in Global Constraints).
- §5 architecture / §6 data model → Tasks 1 (redis), 2 (keys), 5 (counting). ✓
- §7.1 redis wrapper → Task 1. §7.2 emitter → Task 4. §7.3 ingest → Task 5.
  §7.4 keys → Task 2. §7.5 aggregation → Task 3. §7.6 summary endpoint → Task 6
  (public-read + `s-maxage=30` cache). §7.7 page → Task 7. ✓
- §8 public-read (no auth) → Task 6/7. ✓
- §9 instrumentation table → Tasks 8-11 (exact anchors verified against source). ✓
- §10 error handling (never break app) → Task 1 try/catch + no-op; Task 5 "still
  202 when redis throws" test. ✓
- §11 testing → each pure module + both routes have tests. ✓ (page is UI, manual
  verify in Task 7 — logic it uses is tested in Tasks 3/6.)
- §12 env/setup → Task 1 `.env.example`; Task 12 HANDOFF user-action. ✓
- §7.3 generous rate limit (60/60s) → Task 5. ✓

**Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N". All
code shown in full. The one "read lines first" note (Task 11 Step 3) is a
safety instruction for an edit in a large file, not a placeholder — the exact
before/after text is still given.

**Type consistency:** `trackFunnel(event, { game })`, `EventCounts`,
`conversionPct`, `summarizeEvent`, `incrWithTtl`/`mget`, `_setRedisForTests`,
`sanitizeTelemetryPayload` (now returns `game?`), `isFunnelEvent`, `ALL_EVENTS`,
`FUNNEL_EVENTS`, `EVENT_TTL_SECONDS`, key builders — names/signatures match
across producing and consuming tasks. `GameId` union reused from
game-registry throughout.
