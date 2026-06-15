# Leaderboard Proxy + Cache + Client Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Hiro 429s by serving shared leaderboard data from one cached Next.js route (so the browser hits our server + CDN, not Hiro directly), and harden the remaining client-direct reads with dedupe + short TTL cache + 429 backoff. No Hiro API key, no contract change.

**Architecture:** A server-safe reads module + an in-memory TTL snapshot cache feed a `GET /api/leaderboard` route (CDN `s-maxage=30`). A client `fetchLeaderboardSnapshot()` (dedupe + ~30s cache) replaces the 15-call showcase burst. A `cachedRead` utility (dedupe + TTL + `retryWithBackoff`) wraps wallet-specific direct reads.

**Tech Stack:** Next.js 16 App Router (route handlers), React 19, TypeScript 5, Zustand 5, Vitest 3, `@stacks/transactions`.

**Reference spec:** `docs/superpowers/specs/2026-06-15-leaderboard-proxy-cache-design.md`

**Working directory for all frontend commands:** `frontend/`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `frontend/lib/retry.ts` | `retryWithBackoff` + `isRateLimitError` (shared) | Create |
| `frontend/lib/retry.test.ts` | Tests | Create |
| `frontend/lib/read-cache.ts` | `cachedRead` (client dedupe + TTL + backoff) | Create |
| `frontend/lib/read-cache.test.ts` | Tests | Create |
| `frontend/lib/leaderboard-reads.ts` | Server-safe per-game reads + `readGameLeaderboard` + types | Create (moves 4 read fns + `gameBase` + `TopEntry` here) |
| `frontend/lib/leaderboard-reads.test.ts` | Tests for `readGameLeaderboard` | Create |
| `frontend/lib/leaderboard-cache.ts` | In-memory TTL snapshot cache + single-flight + serve-stale | Create |
| `frontend/lib/leaderboard-cache.test.ts` | Tests | Create |
| `frontend/app/api/leaderboard/route.ts` | Thin GET → snapshot + CDN headers | Create |
| `frontend/app/api/leaderboard/route.test.ts` | Tests | Create |
| `frontend/lib/leaderboard-snapshot.ts` | Client fetch of `/api/leaderboard` (dedupe + TTL) | Create |
| `frontend/lib/leaderboard-snapshot.test.ts` | Tests | Create |
| `frontend/lib/contract-calls.ts` | Re-export moved reads; wrap wallet reads in `cachedRead` | Modify |
| `frontend/hooks/useLeaderboardShowcase.ts` | Use snapshot instead of 15 direct calls | Modify |
| `frontend/hooks/useLeaderboardShowcase.test.ts` | Update to mock snapshot | Modify |
| `frontend/components/windows/HighScoreWindow.tsx` | Top-ten/season/pool from snapshot | Modify |
| `frontend/components/windows/HallOfFameWindow.tsx` | Live season/top-ten from snapshot | Modify |
| `HANDOFF.md` | Note the feature | Modify |

---

## Task 1: retry helper (pure, TDD)

**Files:**
- Create: `frontend/lib/retry.ts`
- Test: `frontend/lib/retry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/retry.test.ts
import { describe, it, expect, vi } from "vitest";
import { retryWithBackoff, isRateLimitError } from "./retry";

const noSleep = () => Promise.resolve();

describe("isRateLimitError", () => {
  it("detects 429 by status, statusCode, or message; rejects others", () => {
    expect(isRateLimitError({ status: 429 })).toBe(true);
    expect(isRateLimitError({ statusCode: 429 })).toBe(true);
    expect(isRateLimitError(new Error("HTTP 429 Too Many Requests"))).toBe(true);
    expect(isRateLimitError(new Error("rate limit exceeded"))).toBe(true);
    expect(isRateLimitError(new Error("boom"))).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
  });
});

describe("retryWithBackoff", () => {
  it("returns immediately on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(retryWithBackoff(fn, { sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a rate-limit error then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValue("ok");
    await expect(retryWithBackoff(fn, { sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("gives up after `attempts` rate-limit errors", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 429 });
    await expect(
      retryWithBackoff(fn, { attempts: 3, sleep: noSleep }),
    ).rejects.toEqual({ status: 429 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-rate-limit error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(retryWithBackoff(fn, { sleep: noSleep })).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run lib/retry.test.ts`
Expected: FAIL — `Cannot find module './retry'`.

- [ ] **Step 3: Implement**

```ts
// frontend/lib/retry.ts
/** True for HTTP 429 / rate-limit-class errors. Errs toward NOT retrying
 *  unknown errors. */
export function isRateLimitError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const e = err as { status?: number; statusCode?: number; message?: unknown };
    if (e.status === 429 || e.statusCode === 429) return true;
    if (typeof e.message === "string" && /429|rate.?limit|too many requests/i.test(e.message)) {
      return true;
    }
    return false;
  }
  if (typeof err === "string") return /429|rate.?limit|too many requests/i.test(err);
  return false;
}

export type RetryOpts = {
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  isRetryable?: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Run `fn`, retrying rate-limit failures with exponential backoff + jitter. */
export async function retryWithBackoff<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const baseMs = opts.baseMs ?? 300;
  const maxMs = opts.maxMs ?? 4_000;
  const isRetryable = opts.isRetryable ?? isRateLimitError;
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !isRetryable(err)) throw err;
      const backoff = Math.min(maxMs, baseMs * 2 ** i);
      await sleep(backoff + Math.random() * backoff * 0.25);
    }
  }
  throw lastErr;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run lib/retry.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/retry.ts frontend/lib/retry.test.ts
git commit -m "feat(reads): retryWithBackoff + rate-limit detector"
```

---

## Task 2: cachedRead (client dedupe + TTL + backoff)

**Files:**
- Create: `frontend/lib/read-cache.ts`
- Test: `frontend/lib/read-cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/read-cache.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cachedRead, clearReadCache } from "./read-cache";

beforeEach(() => {
  clearReadCache();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("cachedRead", () => {
  it("dedupes concurrent calls for the same key into one underlying call", async () => {
    let calls = 0;
    const fn = () => {
      calls++;
      return Promise.resolve(calls);
    };
    const [a, b] = await Promise.all([
      cachedRead("k", 1000, fn),
      cachedRead("k", 1000, fn),
    ]);
    expect(calls).toBe(1);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("serves from cache within TTL, refetches after expiry", async () => {
    let calls = 0;
    const fn = () => Promise.resolve(++calls);
    await cachedRead("k", 1000, fn);
    await cachedRead("k", 1000, fn);
    expect(calls).toBe(1);
    vi.advanceTimersByTime(1001);
    await cachedRead("k", 1000, fn);
    expect(calls).toBe(2);
  });

  it("retries a rate-limit error via backoff", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValue(7);
    const result = await cachedRead("k", 1000, fn, { sleep: () => Promise.resolve() });
    expect(result).toBe(7);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run lib/read-cache.test.ts`
Expected: FAIL — `Cannot find module './read-cache'`.

- [ ] **Step 3: Implement**

```ts
// frontend/lib/read-cache.ts
import { retryWithBackoff, type RetryOpts } from "./retry";

type Entry<T> = { value: T; expiresAt: number };

const cache = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

/** Test/reset helper — clears all cached + in-flight reads. */
export function clearReadCache(): void {
  cache.clear();
  inFlight.clear();
}

/** Memoized read: serves a fresh cached value, dedupes concurrent calls for the
 *  same key, and runs the fetch through retryWithBackoff. */
export async function cachedRead<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  retryOpts?: RetryOpts,
): Promise<T> {
  const hit = cache.get(key) as Entry<T> | undefined;
  if (hit && Date.now() < hit.expiresAt) return hit.value;

  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const p = retryWithBackoff(fn, retryOpts)
    .then((value) => {
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, p);
  return p;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run lib/read-cache.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/read-cache.ts frontend/lib/read-cache.test.ts
git commit -m "feat(reads): cachedRead dedupe + TTL + backoff"
```

---

## Task 3: Move shared reads into a server-safe module

**Files:**
- Create: `frontend/lib/leaderboard-reads.ts`
- Modify: `frontend/lib/contract-calls.ts`

`contract-calls.ts` starts with `"use client"` (it uses `@stacks/connect`). The
route handler can't import a client module, so move the four **read** functions
and their shared helpers into a server-safe module, then re-export them from
`contract-calls.ts` so every existing client import keeps working. **No behavior
change** — verified by the existing test suite + build.

- [ ] **Step 1: Create the server-safe module with the moved code**

Create `frontend/lib/leaderboard-reads.ts` (note: **no** `"use client"`):
```ts
import {
  uintCV,
  cvToValue,
  fetchCallReadOnlyFunction,
} from "@stacks/transactions";
import { stacks } from "./stacks";
import { unwrap } from "./cv-unwrap";
import { GAMES, onchainIdFor, type GameId } from "./game-registry";

export type TopEntry = { player: string; score: number };

/** Per-game contract coordinates for a read-only call. */
export function gameBase(gameId: GameId) {
  const g = GAMES[gameId];
  return {
    network: stacks.network,
    contractAddress: g.contractAddress,
    contractName: g.contractName,
  };
}

export async function getTopTenForGame(gameId: GameId): Promise<TopEntry[]> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-top-ten",
    functionArgs: [uintCV(onchainIdFor(gameId))],
    senderAddress: GAMES[gameId].contractAddress,
  });
  const v = unwrap<Array<{ player: string; score: string }>>(cvToValue(res));
  return v.map((e) => ({ player: String(e.player), score: Number(e.score) }));
}

export async function getCurrentSeasonForGame(gameId: GameId): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-current-season",
    functionArgs: [uintCV(onchainIdFor(gameId))],
    senderAddress: GAMES[gameId].contractAddress,
  });
  return Number(unwrap(cvToValue(res)));
}

export async function getSeasonEndBlockForGame(gameId: GameId): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-season-end-block",
    functionArgs: [uintCV(onchainIdFor(gameId))],
    senderAddress: GAMES[gameId].contractAddress,
  });
  return Number(unwrap(cvToValue(res)));
}

export async function getPrizePoolBalanceForGame(gameId: GameId): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-prize-pool-balance",
    functionArgs: [uintCV(onchainIdFor(gameId))],
    senderAddress: GAMES[gameId].contractAddress,
  });
  return Number(unwrap(cvToValue(res)));
}
```

- [ ] **Step 2: Update `contract-calls.ts` to use + re-export the moved code**

In `frontend/lib/contract-calls.ts`:

2a. Remove the **local** `function gameBase(gameId: GameId)` definition and the
four moved functions (`getTopTenForGame`, `getCurrentSeasonForGame`,
`getSeasonEndBlockForGame`, `getPrizePoolBalanceForGame`) and the
`export type TopEntry = …` line.

2b. Add an import + re-export near the top imports (after the existing
`import { GAMES, onchainIdFor, type GameId } from "./game-registry";`):
```ts
import {
  gameBase,
  getTopTenForGame,
  getCurrentSeasonForGame,
  getSeasonEndBlockForGame,
  getPrizePoolBalanceForGame,
  type TopEntry,
} from "./leaderboard-reads";

export {
  getTopTenForGame,
  getCurrentSeasonForGame,
  getSeasonEndBlockForGame,
  getPrizePoolBalanceForGame,
  type TopEntry,
};
```
The remaining functions in `contract-calls.ts` (e.g. `getBestScoreForGame`,
`getMintsRemaining`, write paths) already call `gameBase(...)` — they now use the
imported one. Leave them otherwise unchanged for this task.

- [ ] **Step 3: Verify no behavior change (typecheck + existing tests + build)**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean — every existing `import { getTopTenForGame, … } from "@/lib/contract-calls"` still resolves via the re-export.

Run: `cd frontend && npm test`
Expected: all existing tests still pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/leaderboard-reads.ts frontend/lib/contract-calls.ts
git commit -m "refactor(reads): move shared reads to server-safe module"
```

---

## Task 4: readGameLeaderboard (server-side per-game combiner, TDD)

**Files:**
- Modify: `frontend/lib/leaderboard-reads.ts`
- Test: `frontend/lib/leaderboard-reads.test.ts`

Combine the four reads into one per-game result, each wrapped in
`retryWithBackoff` and falling back to a null/`[]` value on failure (so one bad
field never throws). Use dependency injection for the readers so the combiner is
testable without network.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/leaderboard-reads.test.ts
import { describe, it, expect } from "vitest";
import { readGameLeaderboard, type Readers } from "./leaderboard-reads";

const ok: Readers = {
  topTen: async () => [{ player: "SP1", score: 5 }],
  currentSeason: async () => 1,
  prizePool: async () => 1000,
  seasonEndBlock: async () => 8470355,
};

describe("readGameLeaderboard", () => {
  it("returns all four fields on success", async () => {
    const r = await readGameLeaderboard("snake", ok);
    expect(r).toEqual({
      topTen: [{ player: "SP1", score: 5 }],
      currentSeason: 1,
      prizePool: 1000,
      seasonEndBlock: 8470355,
    });
  });

  it("falls back per field on failure (null, and [] for topTen)", async () => {
    const partial: Readers = {
      ...ok,
      currentSeason: async () => {
        throw new Error("boom");
      },
      topTen: async () => {
        throw new Error("boom");
      },
    };
    const r = await readGameLeaderboard("snake", partial);
    expect(r.topTen).toEqual([]);
    expect(r.currentSeason).toBeNull();
    expect(r.prizePool).toBe(1000);
    expect(r.seasonEndBlock).toBe(8470355);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run lib/leaderboard-reads.test.ts`
Expected: FAIL — `readGameLeaderboard is not a function`.

- [ ] **Step 3: Append the combiner + types to `leaderboard-reads.ts`**

```ts
// add to frontend/lib/leaderboard-reads.ts
import { retryWithBackoff } from "./retry";

export type GameLeaderboard = {
  topTen: TopEntry[];
  currentSeason: number | null;
  prizePool: number | null;
  seasonEndBlock: number | null;
};

export type Readers = {
  topTen: (g: GameId) => Promise<TopEntry[]>;
  currentSeason: (g: GameId) => Promise<number>;
  prizePool: (g: GameId) => Promise<number>;
  seasonEndBlock: (g: GameId) => Promise<number>;
};

const defaultReaders: Readers = {
  topTen: getTopTenForGame,
  currentSeason: getCurrentSeasonForGame,
  prizePool: getPrizePoolBalanceForGame,
  seasonEndBlock: getSeasonEndBlockForGame,
};

async function safeRead<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await retryWithBackoff(fn);
  } catch {
    return fallback;
  }
}

/** Read one game's leaderboard fields; a failed field falls back, never throws. */
export async function readGameLeaderboard(
  gameId: GameId,
  readers: Readers = defaultReaders,
): Promise<GameLeaderboard> {
  const [topTen, currentSeason, prizePool, seasonEndBlock] = await Promise.all([
    safeRead<TopEntry[]>(() => readers.topTen(gameId), []),
    safeRead<number | null>(() => readers.currentSeason(gameId), null),
    safeRead<number | null>(() => readers.prizePool(gameId), null),
    safeRead<number | null>(() => readers.seasonEndBlock(gameId), null),
  ]);
  return { topTen, currentSeason, prizePool, seasonEndBlock };
}
```

> Move the `import { retryWithBackoff } from "./retry";` line to the top with the
> other imports if your linter requires imports-first; the code is otherwise as
> shown.

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run lib/leaderboard-reads.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/leaderboard-reads.ts frontend/lib/leaderboard-reads.test.ts
git commit -m "feat(reads): readGameLeaderboard per-game combiner"
```

---

## Task 5: leaderboard-cache (TTL snapshot + single-flight + serve-stale, TDD)

**Files:**
- Create: `frontend/lib/leaderboard-cache.ts`
- Test: `frontend/lib/leaderboard-cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/leaderboard-cache.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GAME_IDS } from "./game-registry";

// Mock the per-game reader so the cache logic is tested in isolation.
const readGameLeaderboard = vi.fn();
vi.mock("./leaderboard-reads", () => ({
  readGameLeaderboard: (...args: unknown[]) => readGameLeaderboard(...args),
}));

import {
  getLeaderboardSnapshot,
  resetLeaderboardCacheForTest,
} from "./leaderboard-cache";

const good = {
  topTen: [{ player: "SP1", score: 9 }],
  currentSeason: 1,
  prizePool: 500,
  seasonEndBlock: 8470355,
};

beforeEach(() => {
  resetLeaderboardCacheForTest();
  readGameLeaderboard.mockReset();
  readGameLeaderboard.mockResolvedValue(good);
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("getLeaderboardSnapshot", () => {
  it("returns a result for every game", async () => {
    const snap = await getLeaderboardSnapshot();
    for (const id of GAME_IDS) expect(snap.games[id]).toEqual(good);
    expect(typeof snap.updatedAt).toBe("string");
  });

  it("serves from cache within TTL (no extra reads)", async () => {
    await getLeaderboardSnapshot();
    const callsAfterFirst = readGameLeaderboard.mock.calls.length;
    await getLeaderboardSnapshot();
    expect(readGameLeaderboard.mock.calls.length).toBe(callsAfterFirst);
  });

  it("dedupes concurrent rebuilds (single-flight)", async () => {
    resetLeaderboardCacheForTest();
    const [a, b] = await Promise.all([getLeaderboardSnapshot(), getLeaderboardSnapshot()]);
    expect(a).toBe(b);
    expect(readGameLeaderboard.mock.calls.length).toBe(GAME_IDS.length);
  });

  it("keeps the previous good value when a later read fails (serve-stale)", async () => {
    await getLeaderboardSnapshot(); // seed good
    vi.advanceTimersByTime(31_000);
    readGameLeaderboard.mockResolvedValue({
      topTen: [],
      currentSeason: null,
      prizePool: null,
      seasonEndBlock: null,
    });
    const snap = await getLeaderboardSnapshot();
    expect(snap.games[GAME_IDS[0]]).toEqual(good); // previous values retained
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run lib/leaderboard-cache.test.ts`
Expected: FAIL — `Cannot find module './leaderboard-cache'`.

- [ ] **Step 3: Implement**

```ts
// frontend/lib/leaderboard-cache.ts
import { GAME_IDS, type GameId } from "./game-registry";
import { readGameLeaderboard, type GameLeaderboard } from "./leaderboard-reads";

export type LeaderboardSnapshot = {
  updatedAt: string;
  games: Record<GameId, GameLeaderboard>;
};

const TTL_MS = 30_000;
const BATCH = 2; // limit concurrency against Hiro on a rebuild

let cache: { data: LeaderboardSnapshot; expiresAt: number } | null = null;
let inFlight: Promise<LeaderboardSnapshot> | null = null;

export function resetLeaderboardCacheForTest(): void {
  cache = null;
  inFlight = null;
}

function emptyGame(): GameLeaderboard {
  return { topTen: [], currentSeason: null, prizePool: null, seasonEndBlock: null };
}

/** Keep the previous good value where a fresh read came back empty/null. */
function mergeGame(fresh: GameLeaderboard, prev: GameLeaderboard | undefined): GameLeaderboard {
  if (!prev) return fresh;
  return {
    topTen: fresh.topTen.length ? fresh.topTen : prev.topTen,
    currentSeason: fresh.currentSeason ?? prev.currentSeason,
    prizePool: fresh.prizePool ?? prev.prizePool,
    seasonEndBlock: fresh.seasonEndBlock ?? prev.seasonEndBlock,
  };
}

async function rebuild(prev: LeaderboardSnapshot | null): Promise<LeaderboardSnapshot> {
  const games = {} as Record<GameId, GameLeaderboard>;
  for (let i = 0; i < GAME_IDS.length; i += BATCH) {
    const slice = GAME_IDS.slice(i, i + BATCH);
    const results = await Promise.all(slice.map((g) => readGameLeaderboard(g)));
    slice.forEach((g, idx) => {
      games[g] = mergeGame(results[idx], prev?.games[g]);
    });
  }
  return { updatedAt: new Date().toISOString(), games };
}

/** Cached leaderboard snapshot: fresh-within-TTL, single-flight rebuild,
 *  serve-stale on failure, never throws. */
export async function getLeaderboardSnapshot(): Promise<LeaderboardSnapshot> {
  if (cache && Date.now() < cache.expiresAt) return cache.data;
  if (inFlight) return inFlight;

  const prev = cache?.data ?? null;
  inFlight = rebuild(prev)
    .then((data) => {
      cache = { data, expiresAt: Date.now() + TTL_MS };
      return data;
    })
    .catch(() => {
      if (cache) return cache.data;
      const games = GAME_IDS.reduce((acc, g) => {
        acc[g] = emptyGame();
        return acc;
      }, {} as Record<GameId, GameLeaderboard>);
      return { updatedAt: new Date().toISOString(), games };
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run lib/leaderboard-cache.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/leaderboard-cache.ts frontend/lib/leaderboard-cache.test.ts
git commit -m "feat(leaderboard): cached snapshot with single-flight + serve-stale"
```

---

## Task 6: GET /api/leaderboard route (TDD)

**Files:**
- Create: `frontend/app/api/leaderboard/route.ts`
- Test: `frontend/app/api/leaderboard/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/app/api/leaderboard/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GAME_IDS } from "@/lib/game-registry";

const getLeaderboardSnapshot = vi.fn();
vi.mock("@/lib/leaderboard-cache", () => ({
  getLeaderboardSnapshot: () => getLeaderboardSnapshot(),
}));

import { GET } from "./route";

const snapshot = {
  updatedAt: new Date().toISOString(),
  games: GAME_IDS.reduce((acc, g) => {
    acc[g] = { topTen: [], currentSeason: 1, prizePool: 0, seasonEndBlock: 1 };
    return acc;
  }, {} as Record<string, unknown>),
};

beforeEach(() => {
  getLeaderboardSnapshot.mockReset();
  getLeaderboardSnapshot.mockResolvedValue(snapshot);
});

describe("GET /api/leaderboard", () => {
  it("returns 200 with the snapshot for every game and a cache header", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=30");
    const body = await res.json();
    for (const id of GAME_IDS) expect(body.games[id]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run app/api/leaderboard/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement the thin route**

```ts
// frontend/app/api/leaderboard/route.ts
import { NextResponse } from "next/server";
import { getLeaderboardSnapshot } from "@/lib/leaderboard-cache";

export async function GET() {
  const snapshot = await getLeaderboardSnapshot();
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run app/api/leaderboard/route.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/app/api/leaderboard/route.ts frontend/app/api/leaderboard/route.test.ts
git commit -m "feat(leaderboard): GET /api/leaderboard cached route"
```

---

## Task 7: client fetchLeaderboardSnapshot (dedupe + TTL, TDD)

**Files:**
- Create: `frontend/lib/leaderboard-snapshot.ts`
- Test: `frontend/lib/leaderboard-snapshot.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/leaderboard-snapshot.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GAME_IDS } from "./game-registry";
import {
  fetchLeaderboardSnapshot,
  resetSnapshotCacheForTest,
} from "./leaderboard-snapshot";

const snapshot = {
  updatedAt: new Date().toISOString(),
  games: GAME_IDS.reduce((acc, g) => {
    acc[g] = { topTen: [], currentSeason: 1, prizePool: 0, seasonEndBlock: 1 };
    return acc;
  }, {} as Record<string, unknown>),
};

beforeEach(() => {
  resetSnapshotCacheForTest();
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchLeaderboardSnapshot", () => {
  it("dedupes concurrent calls into one fetch", async () => {
    const [a, b] = await Promise.all([fetchLeaderboardSnapshot(), fetchLeaderboardSnapshot()]);
    expect(a).toEqual(b);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("serves from cache within TTL", async () => {
    await fetchLeaderboardSnapshot();
    await fetchLeaderboardSnapshot();
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    vi.advanceTimersByTime(31_000);
    await fetchLeaderboardSnapshot();
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it("returns the last cached snapshot when a later fetch fails", async () => {
    await fetchLeaderboardSnapshot(); // seed cache
    vi.advanceTimersByTime(31_000);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 429 });
    const snap = await fetchLeaderboardSnapshot();
    expect(snap.games[GAME_IDS[0]]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run lib/leaderboard-snapshot.test.ts`
Expected: FAIL — `Cannot find module './leaderboard-snapshot'`.

- [ ] **Step 3: Implement**

```ts
// frontend/lib/leaderboard-snapshot.ts
"use client";
import { GAME_IDS, type GameId } from "./game-registry";
import type { LeaderboardSnapshot, GameLeaderboard } from "./leaderboard-cache";

export type { LeaderboardSnapshot, GameLeaderboard };

const TTL_MS = 30_000;
let cache: { data: LeaderboardSnapshot; expiresAt: number } | null = null;
let inFlight: Promise<LeaderboardSnapshot> | null = null;

export function resetSnapshotCacheForTest(): void {
  cache = null;
  inFlight = null;
}

function emptySnapshot(): LeaderboardSnapshot {
  const games = GAME_IDS.reduce((acc, g) => {
    acc[g] = { topTen: [], currentSeason: null, prizePool: null, seasonEndBlock: null };
    return acc;
  }, {} as Record<GameId, GameLeaderboard>);
  return { updatedAt: new Date().toISOString(), games };
}

/** Fetch the shared leaderboard snapshot from our cached route, with in-flight
 *  dedupe + a short client TTL cache. Falls back to the last good snapshot. */
export async function fetchLeaderboardSnapshot(): Promise<LeaderboardSnapshot> {
  if (cache && Date.now() < cache.expiresAt) return cache.data;
  if (inFlight) return inFlight;

  inFlight = fetch("/api/leaderboard")
    .then((res) => {
      if (!res.ok) throw new Error(`leaderboard ${res.status}`);
      return res.json() as Promise<LeaderboardSnapshot>;
    })
    .then((data) => {
      cache = { data, expiresAt: Date.now() + TTL_MS };
      return data;
    })
    .catch((err) => {
      if (cache) return cache.data;
      throw err;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
```

> The third test relies on the cache from the first call surviving; since the
> failed fetch returns `cache.data`, it resolves. (If there were no prior cache,
> the function rethrows — callers handle that, see Task 8.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run lib/leaderboard-snapshot.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/leaderboard-snapshot.ts frontend/lib/leaderboard-snapshot.test.ts
git commit -m "feat(leaderboard): client snapshot fetch with dedupe + cache"
```

---

## Task 8: useLeaderboardShowcase uses the snapshot

**Files:**
- Modify: `frontend/hooks/useLeaderboardShowcase.ts`
- Modify: `frontend/hooks/useLeaderboardShowcase.test.ts`

- [ ] **Step 1: Update the test to mock the snapshot**

Open `frontend/hooks/useLeaderboardShowcase.test.ts`. The existing tests for
`mergeWithFallback` stay. Add/replace the data-source mock so the hook reads the
snapshot instead of `contract-calls`. At the top of the file add:
```ts
import { GAME_IDS } from "@/lib/game-registry";

vi.mock("@/lib/leaderboard-snapshot", () => ({
  fetchLeaderboardSnapshot: vi.fn().mockResolvedValue({
    updatedAt: new Date().toISOString(),
    games: GAME_IDS.reduce((acc, g) => {
      acc[g] = { topTen: [{ player: "SP1", score: 7 }], currentSeason: 2, prizePool: 100, seasonEndBlock: 9 };
      return acc;
    }, {} as Record<string, unknown>),
  }),
}));
```
If the existing file already mocks `@/lib/contract-calls` for the refresh path,
remove that mock (the hook no longer calls those directly). Keep any
`mergeWithFallback` unit tests unchanged.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run hooks/useLeaderboardShowcase.test.ts`
Expected: FAIL — the hook still imports/uses `contract-calls`, mock unused / shape mismatch.

- [ ] **Step 3: Rewrite `refresh()` to use the snapshot**

In `frontend/hooks/useLeaderboardShowcase.ts`:

3a. Replace the contract-calls import block:
```ts
import { type TopEntry } from "@/lib/contract-calls";
import { fetchLeaderboardSnapshot } from "@/lib/leaderboard-snapshot";
```

3b. Replace the entire `refresh` callback body with:
```ts
  const refresh = useCallback(async () => {
    let snapshot;
    try {
      snapshot = await fetchLeaderboardSnapshot();
    } catch {
      setError("Leaderboard refresh failed");
      return;
    }
    const rowEntries = GAME_IDS.map(
      (gameId) => [gameId, snapshot.games[gameId]?.topTen ?? null] as const,
    );
    const seasonEntries = GAME_IDS.map(
      (gameId) => [gameId, snapshot.games[gameId]?.currentSeason ?? null] as const,
    );
    const poolEntries = GAME_IDS.map(
      (gameId) => [gameId, snapshot.games[gameId]?.prizePool ?? null] as const,
    );

    setRowsByGame((prev) => mergeWithFallback(prev, rowEntries));
    setSeasonsByGame((prev) => mergeWithFallback(prev, seasonEntries));
    setPoolsByGame((prev) => mergeWithFallback(prev, poolEntries));
    setLastUpdated(new Date());
    const allFailed = rowEntries.every(([, value]) => value === null);
    setError(allFailed ? "Leaderboard refresh failed" : null);
  }, []);
```

The hook's returned shape (`rowsByGame`/`seasonsByGame`/`poolsByGame`/`summaries`/
`lastUpdated`/`error`/`refresh`) is unchanged, so `PrizePoolHero`,
`LeaderboardTicker`, and `DesktopLeaderboardShowcase` need no edits.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run hooks/useLeaderboardShowcase.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/hooks/useLeaderboardShowcase.ts frontend/hooks/useLeaderboardShowcase.test.ts
git commit -m "feat(leaderboard): showcase reads cached snapshot (1 call, not 15)"
```

---

## Task 9: HighScoreWindow reads the snapshot

**Files:**
- Modify: `frontend/components/windows/HighScoreWindow.tsx`

No new test (window is integration-level; covered by typecheck + build). Top-ten,
season, and pool come from the snapshot; `best-score` stays client-direct
(it routes through `cachedRead` after Task 11).

- [ ] **Step 1: Update the imports**

In `frontend/components/windows/HighScoreWindow.tsx`, remove
`getTopTenForGame`, `getCurrentSeasonForGame`, `getPrizePoolBalanceForGame`
from the `@/lib/contract-calls` import (keep `getBestScoreForGame` and any others
still used), and add:
```tsx
import { fetchLeaderboardSnapshot } from "@/lib/leaderboard-snapshot";
```

- [ ] **Step 2: Replace the `load()` fetch block**

Replace the `Promise.all([...])` and its `.then(([data, season, playerBest, poolUstx]) => {…})`
(the block at `HighScoreWindow.tsx:90`) with:
```tsx
      Promise.all([
        fetchLeaderboardSnapshot(),
        address
          ? getBestScoreForGame(gameId, address)
              .then((best) => best?.score ?? 0)
              .catch(() => null)
          : Promise.resolve(null),
      ])
        .then(([snap, playerBest]) => {
          const game = snap.games[gameId];
          const data = game?.topTen ?? [];
          const season = game?.currentSeason ?? null;
          const poolUstx = game?.prizePool ?? null;
          const sorted = [...data].sort((a, b) => b.score - a.score);
          const previousSnapshot = loadSnapshot(gameId);
          saveSnapshot(gameId, sorted);
          setLoadState({
            gameId,
            rows: sorted,
            season,
            playerBest,
            poolUstx,
            snapshot: previousSnapshot,
            error: null,
            lastUpdated: new Date(),
          });
        })
```
Leave the existing `.catch((e) => {…})` block unchanged.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/windows/HighScoreWindow.tsx
git commit -m "feat(leaderboard): High Scores reads cached snapshot"
```

---

## Task 10: HallOfFameWindow reads the snapshot for live data

**Files:**
- Modify: `frontend/components/windows/HallOfFameWindow.tsx`

Live `current-season` + `top-ten` come from the snapshot; historical
`getSeasonPrizeForGame` stays (it routes through `cachedRead` after Task 11).

- [ ] **Step 1: Update imports**

Remove `getCurrentSeasonForGame` and `getTopTenForGame` from the
`@/lib/contract-calls` import (keep `getSeasonPrizeForGame`), and add:
```tsx
import { fetchLeaderboardSnapshot } from "@/lib/leaderboard-snapshot";
```

- [ ] **Step 2: Replace the head of `loadHallOfFame`**

Replace the start of `loadHallOfFame` (the `const byGame = await Promise.all(` and
the two direct calls at `HallOfFameWindow.tsx:46-47`) so it fetches the snapshot
once, then sources live values from it:
```tsx
async function loadHallOfFame(): Promise<SeasonSnapshot[]> {
  const snapshot = await fetchLeaderboardSnapshot();
  const byGame = await Promise.all(
    GAME_IDS.map(async (gameId) => {
      const game = snapshot.games[gameId];
      const currentSeason = game?.currentSeason ?? 0;
      const liveRows = game?.topTen ?? [];
```
Leave the rest of the function (the `closedSeasonIds` computation, the
`getSeasonPrizeForGame` loop, and the returned `current` + closed snapshots)
exactly as it is. `currentSeason` is now `number` (0 when unavailable), so
`closedSeasonIds`'s `Math.max(0, currentSeason - 1)` still behaves correctly.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/windows/HallOfFameWindow.tsx
git commit -m "feat(leaderboard): Hall of Fame reads cached snapshot for live data"
```

---

## Task 11: Wrap wallet-specific reads in cachedRead

**Files:**
- Modify: `frontend/lib/contract-calls.ts`

Route the per-address reads through `cachedRead` (dedupe + ~30s TTL + 429
backoff). Keys include game + address (+ season). Write paths stay untouched.

- [ ] **Step 1: Add the import**

In `frontend/lib/contract-calls.ts`, after the existing imports add:
```ts
import { cachedRead } from "./read-cache";

const READ_TTL_MS = 30_000;
```

- [ ] **Step 2: Wrap the four wallet-specific read functions**

For each function below, wrap its existing body in a `cachedRead(key, READ_TTL_MS, () => …)`
call. Replace each function with the version shown (the inner logic is the current
body verbatim):

```ts
export async function getBestScoreForGame(gameId: GameId, addr: string) {
  return cachedRead(`best:${gameId}:${addr}`, READ_TTL_MS, async () => {
    const res = await fetchCallReadOnlyFunction({
      ...gameBase(gameId),
      functionName: "get-best-score",
      functionArgs: [uintCV(onchainIdFor(gameId)), principalCV(addr)],
      senderAddress: addr,
    });
    const v = unwrap<null | { score: string; "token-id": string }>(cvToValue(res));
    return v ? { score: Number(v.score), tokenId: Number(v["token-id"]) } : null;
  });
}

export async function getMintsRemaining(gameId: GameId, player: string): Promise<number> {
  return cachedRead(`mints:${gameId}:${player}`, READ_TTL_MS, async () => {
    const res = await fetchCallReadOnlyFunction({
      ...gameBase(gameId),
      functionName: "get-mints-remaining",
      functionArgs: [uintCV(onchainIdFor(gameId)), principalCV(player)],
      senderAddress: player,
    });
    return Number(unwrap(cvToValue(res)));
  });
}

export async function getClaimableAmount(
  gameId: GameId,
  season: number,
  address: string,
): Promise<number> {
  return cachedRead(`claimable:${gameId}:${season}:${address}`, READ_TTL_MS, async () => {
    const res = await fetchCallReadOnlyFunction({
      ...gameBase(gameId),
      functionName: "get-claimable-amount",
      functionArgs: [uintCV(onchainIdFor(gameId)), uintCV(season), principalCV(address)],
      senderAddress: gameBase(gameId).contractAddress,
    });
    return Number(unwrap(cvToValue(res)));
  });
}

export async function hasClaimedPrizeForGame(
  gameId: GameId,
  player: string,
  season: number,
): Promise<boolean> {
  return cachedRead(`claimed:${gameId}:${season}:${player}`, READ_TTL_MS, async () => {
    const res = await fetchCallReadOnlyFunction({
      ...gameBase(gameId),
      functionName: "has-claimed-prize",
      functionArgs: [principalCV(player), uintCV(onchainIdFor(gameId)), uintCV(season)],
      senderAddress: player,
    });
    return Boolean(cvToValue(res));
  });
}
```

> Use the current bodies of these functions as the source of truth for the inner
> calls — if any `senderAddress`/arg differs from the snippet above, keep the
> existing value and only add the `cachedRead(...)` wrapper. Do not wrap
> `getSeasonPrizeForGame`, `isClaimOpen`, `endSeasonForGame`, mint, or claim.

- [ ] **Step 3: Typecheck + tests**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: clean + all pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/contract-calls.ts
git commit -m "feat(reads): wallet-specific reads via cachedRead (dedupe + backoff)"
```

---

## Task 12: HANDOFF note

**Files:**
- Modify: `HANDOFF.md`

- [ ] **Step 1: Add a feature note**

In `HANDOFF.md`, under the "To-do for next session" area (near the other recent
feature notes), add:
```markdown
### Leaderboard proxy + cache — shipped client-side (2026-06-15)

Shared leaderboard reads (top-ten/current-season/prize-pool/season-end-block for
all 5 games) now come from one cached route `GET /api/leaderboard`
(`lib/leaderboard-cache.ts`, in-memory TTL ~30s + single-flight + serve-stale;
CDN `s-maxage=30`). The desktop showcase's 15-call burst collapses to one cached
GET. Wallet-specific reads stay client-direct but go through `cachedRead`
(`lib/read-cache.ts`: dedupe + ~30s TTL + `retryWithBackoff` on 429). No Hiro API
key, no contract change. Fixes the High Scores / desktop 429s.

- [ ] Optional: tune TTLs or add Vercel Runtime Cache if multi-region misses show up.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add HANDOFF.md
git commit -m "docs(leaderboard): handoff note"
```

---

## Task 13: Full verification gate

**Files:** none (gate before done).

- [ ] **Step 1: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 3: Unit tests**

Run: `cd frontend && npm test`
Expected: all pass, including the new retry / read-cache / leaderboard-reads /
leaderboard-cache / route / snapshot tests and the updated showcase test.

- [ ] **Step 4: Production build**

Run: `cd frontend && npm run build`
Expected: build succeeds; `/api/leaderboard` appears in the route list.

- [ ] **Step 5: Manual smoke (record result, do not fake)**

`cd frontend && npm run dev`, then in the browser DevTools Network tab:
- On desktop load, confirm a single `GET /api/leaderboard` (not 15 direct
  `call-read` POSTs to `api.hiro.so`) drives the showcase.
- Open High Scores → switch tabs: leaderboard data renders; opening within ~30s
  reuses the cached snapshot (no new `/api/leaderboard` each tab switch beyond TTL).
- Open Hall of Fame: live rows render from the snapshot; historical seasons still load.
- No 429s in the console under normal navigation.

- [ ] **Step 6: Commit (if any lint/tsc fixups were needed)**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add -A frontend
git commit -m "chore(leaderboard): verification fixups" || echo "nothing to commit"
```

---

## Self-Review notes (reconciled against the spec)

- **§5.1 retry:** Task 1 (`retryWithBackoff` + `isRateLimitError`, injectable `sleep`).
- **§5.2 server reads:** Task 3 moves the 4 reads + `gameBase` + `TopEntry` to a
  server-safe module (re-exported for back-compat); Task 4 adds `readGameLeaderboard`
  (DI, per-field fallback).
- **§5.3 route + cache:** Task 5 (`leaderboard-cache.ts` — TTL + single-flight +
  serve-stale; extracted from the route for testability, a noted improvement over
  the spec's "cache in route"); Task 6 (thin `GET` + CDN header).
- **§5.4 client snapshot:** Task 7 (`fetchLeaderboardSnapshot`, dedupe + TTL + fallback).
- **§5.5 cachedRead:** Task 2 + Task 11 (wallet reads wrapped).
- **§6 wiring:** Task 8 (showcase), Task 9 (High Scores), Task 10 (Hall of Fame).
  Showcase return shape unchanged → PrizePoolHero/ticker/DesktopLeaderboardShowcase untouched.
- **§7 error/staleness:** serve-stale in Task 5; client fallback in Task 7; backoff
  everywhere via Tasks 1–2.
- **§8 testing:** Tasks 1,2,4,5,6,7,8 are TDD; Task 13 runs the full gate.
- **Naming consistency:** `retryWithBackoff`/`isRateLimitError`/`RetryOpts`,
  `cachedRead`/`clearReadCache`, `readGameLeaderboard`/`Readers`/`GameLeaderboard`,
  `getLeaderboardSnapshot`/`resetLeaderboardCacheForTest`/`LeaderboardSnapshot`,
  `fetchLeaderboardSnapshot`/`resetSnapshotCacheForTest` — identical everywhere used.
- **No contract change, no API key:** confirmed — frontend + one route only.
```
