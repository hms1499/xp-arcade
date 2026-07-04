# Unclaimed Prize Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a connected wallet has unclaimed prizes in any closed season of any game, surface a once-per-day Win95 balloon (via the existing retention-nudge system) plus a persistent system-tray badge, both leading to the High Scores claim tab.

**Architecture:** One new Zustand store (`state/unclaimed-prizes.ts`) scans all six games with the existing `findClaimablePrizes` + cached leaderboard snapshot and is the single source of truth. The balloon is a new highest-priority nudge kind in `lib/retention-nudge.ts`; the badge is a new tray component reading the same store. A confirmed claim invalidates the relevant `cachedRead` keys and re-scans.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zustand 5, Vitest 3, @testing-library/react. Spec: `docs/superpowers/specs/2026-07-04-unclaimed-prize-notification-design.md`.

## Global Constraints

- Frontend only — no changes under `contract/`; `xp-arcade-v4` stays untouched.
- Working dir for all commands: `frontend/` (`cd /Users/vanhuy/Desktop/xp-snake/frontend`).
- Repo path must contain no spaces (Vitest breaks on `%20`).
- This Next.js version differs from training data — if unsure about an API, read `node_modules/next/dist/docs/` (per `frontend/AGENTS.md`). These tasks touch no Next-specific APIs beyond existing patterns.
- Git: conventional prefixes, small green commits, **no Co-Authored-By**, stage explicit files only.
- Copy (user-approved): balloon title `Unclaimed prize!`, icon `💰`, CTA label `Claim now`; aggregate body `You have <X.XX> STX waiting across <N> games. Claim before the window closes.`; single-game body `You have <X.XX> STX waiting in <Game>. Claim before the window closes.`
- Balloon shows at most once per day (existing `markNudgeShown`); badge is persistent while unclaimed total > 0.
- Every task: run the named tests AND read their output before moving on.

---

### Task 1: `invalidateReadCache(keyPrefix)` in read-cache

**Files:**
- Modify: `lib/read-cache.ts`
- Test: `lib/read-cache.test.ts` (exists — append)

**Interfaces:**
- Produces: `export function invalidateReadCache(keyPrefix: string): void` — deletes every cached and in-flight entry whose key starts with `keyPrefix`. Task 3's `refresh` consumes it.

- [ ] **Step 1: Write the failing test** — append to `lib/read-cache.test.ts`:

```ts
import { invalidateReadCache } from "./read-cache";

describe("invalidateReadCache", () => {
  it("drops matching keys and keeps others", async () => {
    let aCalls = 0;
    let bCalls = 0;
    await cachedRead("claimed:snake:1:SP_A", 60_000, async () => ++aCalls);
    await cachedRead("best:snake:SP_A", 60_000, async () => ++bCalls);

    invalidateReadCache("claimed:snake:1");

    await cachedRead("claimed:snake:1:SP_A", 60_000, async () => ++aCalls);
    await cachedRead("best:snake:SP_A", 60_000, async () => ++bCalls);
    expect(aCalls).toBe(2); // refetched after invalidation
    expect(bCalls).toBe(1); // untouched key still cached
  });
});
```

(If the existing file imports `cachedRead`/`clearReadCache` already, extend the import; keep its `beforeEach(clearReadCache)` convention — add one if absent.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/read-cache.test.ts`
Expected: FAIL — `invalidateReadCache` is not exported.

- [ ] **Step 3: Implement** — add to `lib/read-cache.ts` after `clearReadCache`:

```ts
/** Drop cached + in-flight reads whose key starts with `keyPrefix` (e.g. after
 *  a confirmed claim makes `claimed:`/`claimable:` values stale). */
export function invalidateReadCache(keyPrefix: string): void {
  for (const key of cache.keys()) if (key.startsWith(keyPrefix)) cache.delete(key);
  for (const key of inFlight.keys()) if (key.startsWith(keyPrefix)) inFlight.delete(key);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/read-cache.test.ts`
Expected: PASS (all cases, old and new).

- [ ] **Step 5: Commit**

```bash
git add lib/read-cache.ts lib/read-cache.test.ts
git commit -m "feat(cache): add prefix-based invalidateReadCache"
```

---

### Task 2: Wrap `getSeasonPrizeForGame` + `isClaimOpen` in cachedRead

**Files:**
- Modify: `lib/contract-calls.ts:88-133`
- Test: `lib/contract-calls.test.ts` (exists — append)

**Interfaces:**
- Consumes: `cachedRead` (already imported in the file), `READ_TTL_MS = 30_000` (already defined).
- Produces: same signatures as today — `getSeasonPrizeForGame(gameId: GameId, season: number): Promise<SeasonPrize>`, `isClaimOpen(gameId: GameId, season: number): Promise<boolean>` — now memoized under keys `seasonprize:${gameId}:${season}` and `claimopen:${gameId}:${season}`.

- [ ] **Step 1: Write the failing test** — append to `lib/contract-calls.test.ts` (it already mocks `fetchCallReadOnlyFunction` into `readCalls` and should call `clearReadCache()` in `beforeEach`; if it doesn't, add `import { clearReadCache } from "./read-cache"` and a `beforeEach(() => { readCalls.length = 0; clearReadCache(); })`):

```ts
describe("claim-path read caching", () => {
  it("serves getSeasonPrizeForGame from cache on the second call", async () => {
    const before = readCalls.length;
    await getSeasonPrizeForGame("snake", 1);
    await getSeasonPrizeForGame("snake", 1);
    expect(readCalls.length).toBe(before + 1);
  });

  it("serves isClaimOpen from cache on the second call", async () => {
    const before = readCalls.length;
    await isClaimOpen("snake", 1);
    await isClaimOpen("snake", 1);
    expect(readCalls.length).toBe(before + 1);
  });
});
```

(Import `getSeasonPrizeForGame` in the test's existing import block if missing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/contract-calls.test.ts`
Expected: FAIL — `readCalls.length` is `before + 2` (no caching yet).

- [ ] **Step 3: Implement** — wrap each existing body, changing nothing inside it:

```ts
export async function getSeasonPrizeForGame(
  gameId: GameId,
  season: number,
): Promise<SeasonPrize> {
  return cachedRead(`seasonprize:${gameId}:${season}`, READ_TTL_MS, async () => {
    const res = await fetchCallReadOnlyFunction({
      ...gameBase(gameId),
      functionName: "get-season-prize",
      functionArgs: [uintCV(onchainIdFor(gameId)), uintCV(season)],
      senderAddress: GAMES[gameId].contractAddress,
    });
    const v = unwrap<null | {
      total: string;
      "top-ten": Array<{ player: string; score: string }>;
    }>(cvToValue(res));
    if (!v) return null;
    return {
      total: Number(v.total),
      topTen: v["top-ten"].map((e) => ({ player: String(e.player), score: Number(e.score) })),
    };
  });
}

export async function isClaimOpen(gameId: GameId, season: number): Promise<boolean> {
  return cachedRead(`claimopen:${gameId}:${season}`, READ_TTL_MS, async () => {
    const res = await fetchCallReadOnlyFunction({
      ...gameBase(gameId),
      functionName: "is-claim-open",
      functionArgs: [uintCV(onchainIdFor(gameId)), uintCV(season)],
      senderAddress: GAMES[gameId].contractAddress,
    });
    return Boolean(cvToValue(res));
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/contract-calls.test.ts lib/claimable-prizes.test.ts`
Expected: PASS (claimable-prizes uses injected deps, so it must stay green untouched).

- [ ] **Step 5: Commit**

```bash
git add lib/contract-calls.ts lib/contract-calls.test.ts
git commit -m "fix(reads): route season-prize and claim-open reads through cachedRead"
```

---

### Task 3: `state/unclaimed-prizes.ts` store

**Files:**
- Create: `state/unclaimed-prizes.ts`
- Test: `state/unclaimed-prizes.test.ts`

**Interfaces:**
- Consumes: `fetchLeaderboardSnapshot` (`lib/leaderboard-snapshot.ts`), `findClaimablePrizes` (`lib/claimable-prizes.ts`), `invalidateReadCache` (Task 1), `GAME_IDS`/`GameId` (`lib/game-registry.ts`).
- Produces (Tasks 6–9 rely on these exact names):

```ts
export type UnclaimedPrize = { gameId: GameId; season: number; amountUstx: number };
export type UnclaimedSummary = { totalUstx: number; gamesCount: number; topGame: GameId };
export type ScanDeps = {
  fetchSnapshot: typeof fetchLeaderboardSnapshot;
  findClaimable: typeof findClaimablePrizes;
};
export function summarize(claims: UnclaimedPrize[]): UnclaimedSummary | null;
export function resetUnclaimedForTest(): void;
export const useUnclaimedPrizes: UseBoundStore<StoreApi<{
  status: "idle" | "loading" | "done" | "error";
  scannedFor: string | null;
  claims: UnclaimedPrize[];
  totalUstx: number;
  gamesCount: number;
  topGame: GameId | null;
  scan: (address: string, deps?: ScanDeps) => Promise<void>;
  refresh: (claimed?: { gameId: GameId; season: number }, deps?: ScanDeps) => Promise<void>;
  reset: () => void;
}>>;
```

- [ ] **Step 1: Write the failing tests** — create `state/unclaimed-prizes.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  useUnclaimedPrizes, summarize, resetUnclaimedForTest,
  type ScanDeps, type UnclaimedPrize,
} from "./unclaimed-prizes";
import type { LeaderboardSnapshot } from "@/lib/leaderboard-snapshot";
import { cachedRead, clearReadCache } from "@/lib/read-cache";
import { GAME_IDS, type GameId } from "@/lib/game-registry";

function snapshot(seasons: Partial<Record<GameId, number>>): LeaderboardSnapshot {
  const games = Object.fromEntries(
    GAME_IDS.map((g) => [g, {
      topTen: [], currentSeason: seasons[g] ?? 1, prizePool: null, seasonEndBlock: null,
    }]),
  ) as LeaderboardSnapshot["games"];
  return { updatedAt: "t", games };
}

function deps(over: Partial<ScanDeps> = {}): ScanDeps {
  return {
    fetchSnapshot: vi.fn(async () => snapshot({ snake: 2, tetris: 2 })),
    findClaimable: vi.fn(async (gameId) =>
      gameId === "snake"
        ? [{ season: 1, amountUstx: 500_000, claimOpen: true }]
        : gameId === "tetris"
          ? [{ season: 1, amountUstx: 200_000, claimOpen: false }]
          : []),
    ...over,
  };
}

beforeEach(() => {
  resetUnclaimedForTest();
  clearReadCache();
});

describe("summarize", () => {
  it("returns null for no claims", () => {
    expect(summarize([])).toBeNull();
  });

  it("totals amounts, counts distinct games, picks the largest prize's game", () => {
    const claims: UnclaimedPrize[] = [
      { gameId: "snake", season: 1, amountUstx: 300_000 },
      { gameId: "snake", season: 2, amountUstx: 100_000 },
      { gameId: "tetris", season: 1, amountUstx: 900_000 },
    ];
    expect(summarize(claims)).toEqual({
      totalUstx: 1_300_000, gamesCount: 2, topGame: "tetris",
    });
  });
});

describe("scan", () => {
  it("keeps only claim-open prizes and fills the summary", async () => {
    const d = deps();
    await useUnclaimedPrizes.getState().scan("SP_A", d);
    const s = useUnclaimedPrizes.getState();
    expect(s.status).toBe("done");
    expect(s.claims).toEqual([{ gameId: "snake", season: 1, amountUstx: 500_000 }]);
    expect(s.totalUstx).toBe(500_000);
    expect(s.gamesCount).toBe(1);
    expect(s.topGame).toBe("snake");
    expect(s.scannedFor).toBe("SP_A");
  });

  it("skips games still on season 1 (nothing closed to scan)", async () => {
    const d = deps();
    await useUnclaimedPrizes.getState().scan("SP_A", d);
    expect(d.findClaimable).toHaveBeenCalledTimes(2); // snake + tetris only
  });

  it("dedupes: second scan for the same address does not re-fetch", async () => {
    const d = deps();
    await useUnclaimedPrizes.getState().scan("SP_A", d);
    await useUnclaimedPrizes.getState().scan("SP_A", d);
    expect(d.fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it("concurrent scans for the same address share one flight", async () => {
    const d = deps();
    await Promise.all([
      useUnclaimedPrizes.getState().scan("SP_A", d),
      useUnclaimedPrizes.getState().scan("SP_A", d),
    ]);
    expect(d.fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it("a snapshot failure yields error status and an empty result", async () => {
    const d = deps({ fetchSnapshot: vi.fn(async () => { throw new Error("down"); }) });
    await useUnclaimedPrizes.getState().scan("SP_A", d);
    const s = useUnclaimedPrizes.getState();
    expect(s.status).toBe("error");
    expect(s.claims).toEqual([]);
    expect(s.totalUstx).toBe(0);
  });

  it("one game's failure never hides another game's prize", async () => {
    const d = deps({
      findClaimable: vi.fn(async (gameId) => {
        if (gameId === "tetris") throw new Error("boom");
        return gameId === "snake"
          ? [{ season: 1, amountUstx: 500_000, claimOpen: true }] : [];
      }),
    });
    await useUnclaimedPrizes.getState().scan("SP_A", d);
    expect(useUnclaimedPrizes.getState().claims).toHaveLength(1);
  });
});

describe("refresh / reset", () => {
  it("refresh invalidates the claimed keys and re-scans the same address", async () => {
    const d = deps();
    await useUnclaimedPrizes.getState().scan("SP_A", d);

    // Warm two cache keys; refresh must only drop the claimed game+season ones.
    let claimedCalls = 0;
    let otherCalls = 0;
    await cachedRead("claimed:snake:1:SP_A", 60_000, async () => ++claimedCalls);
    await cachedRead("claimable:snake:1:SP_A", 60_000, async () => ++claimedCalls);
    await cachedRead("claimed:tetris:1:SP_A", 60_000, async () => ++otherCalls);

    const d2 = deps({ findClaimable: vi.fn(async () => []) });
    await useUnclaimedPrizes.getState().refresh({ gameId: "snake", season: 1 }, d2);

    await cachedRead("claimed:snake:1:SP_A", 60_000, async () => ++claimedCalls);
    await cachedRead("claimable:snake:1:SP_A", 60_000, async () => ++claimedCalls);
    await cachedRead("claimed:tetris:1:SP_A", 60_000, async () => ++otherCalls);
    expect(claimedCalls).toBe(4); // both snake keys refetched
    expect(otherCalls).toBe(1);   // tetris key untouched

    const s = useUnclaimedPrizes.getState();
    expect(s.status).toBe("done");
    expect(s.claims).toEqual([]); // re-scan saw nothing left
  });

  it("refresh without a prior scan is a no-op", async () => {
    const d = deps();
    await useUnclaimedPrizes.getState().refresh({ gameId: "snake", season: 1 }, d);
    expect(d.fetchSnapshot).not.toHaveBeenCalled();
  });

  it("reset clears everything", async () => {
    await useUnclaimedPrizes.getState().scan("SP_A", deps());
    useUnclaimedPrizes.getState().reset();
    const s = useUnclaimedPrizes.getState();
    expect(s).toMatchObject({
      status: "idle", scannedFor: null, claims: [], totalUstx: 0, gamesCount: 0, topGame: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run state/unclaimed-prizes.test.ts`
Expected: FAIL — module `./unclaimed-prizes` not found.

- [ ] **Step 3: Implement** — create `state/unclaimed-prizes.ts`:

```ts
"use client";
import { create } from "zustand";
import { GAME_IDS, type GameId } from "@/lib/game-registry";
import { fetchLeaderboardSnapshot } from "@/lib/leaderboard-snapshot";
import { findClaimablePrizes } from "@/lib/claimable-prizes";
import { invalidateReadCache } from "@/lib/read-cache";

export type UnclaimedPrize = { gameId: GameId; season: number; amountUstx: number };
export type UnclaimedSummary = { totalUstx: number; gamesCount: number; topGame: GameId };

export type ScanDeps = {
  fetchSnapshot: typeof fetchLeaderboardSnapshot;
  findClaimable: typeof findClaimablePrizes;
};

const defaultDeps: ScanDeps = {
  fetchSnapshot: fetchLeaderboardSnapshot,
  findClaimable: findClaimablePrizes,
};

/** Total, distinct-game count, and the game holding the single largest prize. */
export function summarize(claims: UnclaimedPrize[]): UnclaimedSummary | null {
  if (claims.length === 0) return null;
  let totalUstx = 0;
  let top = claims[0];
  const games = new Set<GameId>();
  for (const c of claims) {
    totalUstx += c.amountUstx;
    games.add(c.gameId);
    if (c.amountUstx > top.amountUstx) top = c;
  }
  return { totalUstx, gamesCount: games.size, topGame: top.gameId };
}

type S = {
  status: "idle" | "loading" | "done" | "error";
  scannedFor: string | null;
  claims: UnclaimedPrize[];
  totalUstx: number;
  gamesCount: number;
  topGame: GameId | null;
  scan: (address: string, deps?: ScanDeps) => Promise<void>;
  refresh: (claimed?: { gameId: GameId; season: number }, deps?: ScanDeps) => Promise<void>;
  reset: () => void;
};

const empty = {
  status: "idle" as const,
  scannedFor: null,
  claims: [],
  totalUstx: 0,
  gamesCount: 0,
  topGame: null,
};

// Module-level so concurrent scan calls (watcher + balloon) share one flight.
let inFlight: { address: string; promise: Promise<void> } | null = null;

export function resetUnclaimedForTest(): void {
  inFlight = null;
  useUnclaimedPrizes.setState(empty);
}

export const useUnclaimedPrizes = create<S>((set, get) => ({
  ...empty,

  scan: (address, deps = defaultDeps) => {
    if (get().scannedFor === address && get().status === "done") return Promise.resolve();
    if (inFlight?.address === address) return inFlight.promise;

    const promise = (async () => {
      set({ status: "loading", scannedFor: address });
      try {
        const snap = await deps.fetchSnapshot();
        const perGame = await Promise.all(
          GAME_IDS.map(async (gameId) => {
            const season = snap.games[gameId]?.currentSeason;
            if (!season || season <= 1) return [];
            const found = await deps.findClaimable(gameId, address, season).catch(() => []);
            return found
              .filter((c) => c.claimOpen)
              .map((c) => ({ gameId, season: c.season, amountUstx: c.amountUstx }));
          }),
        );
        if (get().scannedFor !== address) return; // wallet switched mid-scan
        const claims = perGame.flat();
        const sum = summarize(claims);
        set({
          status: "done",
          claims,
          totalUstx: sum?.totalUstx ?? 0,
          gamesCount: sum?.gamesCount ?? 0,
          topGame: sum?.topGame ?? null,
        });
      } catch {
        if (get().scannedFor !== address) return;
        set({ status: "error", claims: [], totalUstx: 0, gamesCount: 0, topGame: null });
      }
    })().finally(() => {
      if (inFlight?.address === address) inFlight = null;
    });
    inFlight = { address, promise };
    return promise;
  },

  refresh: async (claimed, deps = defaultDeps) => {
    const address = get().scannedFor;
    if (!address) return;
    if (claimed) {
      invalidateReadCache(`claimed:${claimed.gameId}:${claimed.season}`);
      invalidateReadCache(`claimable:${claimed.gameId}:${claimed.season}`);
    }
    set({ status: "idle" }); // defeat the done-dedupe so scan really re-runs
    await get().scan(address, deps);
  },

  reset: () => {
    inFlight = null;
    set(empty);
  },
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run state/unclaimed-prizes.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add state/unclaimed-prizes.ts state/unclaimed-prizes.test.ts
git commit -m "feat(prizes): unclaimed-prizes store scanning all games"
```

---

### Task 4: `prize-unclaimed` nudge kind (priority 0)

**Files:**
- Modify: `lib/retention-nudge.ts`
- Test: `lib/retention-nudge.test.ts` (exists — append + update helper)

**Interfaces:**
- Consumes: `UnclaimedSummary` from `state/unclaimed-prizes` (Task 3).
- Produces: `NudgeKind` union gains `"prize-unclaimed"`; `NudgeSignals` gains `unclaimed: UnclaimedSummary | null`; `export function prizeUnclaimedCandidate(signals: NudgeSignals): Nudge | null`; `selectNudge` tries it first.

- [ ] **Step 1: Write the failing tests** — append to `lib/retention-nudge.test.ts`. Also update the existing `baseSignals` helper to include the new field:

```ts
// in baseSignals(...) return object, add:
    unclaimed: null,
```

```ts
import { prizeUnclaimedCandidate, selectNudge } from "./retention-nudge";

describe("prizeUnclaimedCandidate", () => {
  it("returns null without a summary", () => {
    expect(prizeUnclaimedCandidate(baseSignals())).toBeNull();
  });

  it("aggregates multiple games", () => {
    const n = prizeUnclaimedCandidate(baseSignals({
      unclaimed: { totalUstx: 1_250_000, gamesCount: 3, topGame: "tetris" },
    }));
    expect(n).toMatchObject({
      kind: "prize-unclaimed",
      icon: "💰",
      title: "Unclaimed prize!",
      body: "You have 1.25 STX waiting across 3 games. Claim before the window closes.",
      cta: { label: "Claim now", target: { window: "highscore", gameId: "tetris" } },
    });
  });

  it("names the game when only one has a prize", () => {
    const n = prizeUnclaimedCandidate(baseSignals({
      unclaimed: { totalUstx: 590_000, gamesCount: 1, topGame: "minesweeper" },
    }));
    expect(n?.body).toBe(
      "You have 0.59 STX waiting in Minesweeper. Claim before the window closes.",
    );
  });

  it("outranks every other nudge in selectNudge", () => {
    const signals = baseSignals({
      address: "SP_A",
      unclaimed: { totalUstx: 500_000, gamesCount: 1, topGame: "snake" },
      // rank-drop signal present too:
      ranks: { snake: null, tetris: null, pacman: null, breakout: null, minesweeper: null, solitaire: null },
      lastSeenRanks: { snake: 1, tetris: null, pacman: null, breakout: null, minesweeper: null, solitaire: null },
    });
    expect(selectNudge(signals)?.kind).toBe("prize-unclaimed");
  });

  it("respects the once-per-day dedupe", () => {
    const signals = baseSignals({
      unclaimed: { totalUstx: 500_000, gamesCount: 1, topGame: "snake" },
      shownToday: { "prize-unclaimed": true },
    });
    expect(selectNudge(signals)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/retention-nudge.test.ts`
Expected: FAIL — type error on `unclaimed` / `prizeUnclaimedCandidate` not exported.

- [ ] **Step 3: Implement** in `lib/retention-nudge.ts`:

```ts
// import (type-only; the store module is "use client" but this stays pure):
import type { UnclaimedSummary } from "@/state/unclaimed-prizes";

// kind union:
export type NudgeKind = "prize-unclaimed" | "rank-drop" | "season-closing" | "streak-risk";

// NudgeSignals gains:
  unclaimed: UnclaimedSummary | null;

// new candidate (place above streakRiskCandidate):
export function prizeUnclaimedCandidate(signals: NudgeSignals): Nudge | null {
  const u = signals.unclaimed;
  if (!u || u.totalUstx <= 0) return null;
  const stx = (u.totalUstx / 1_000_000).toFixed(2);
  const body = u.gamesCount === 1
    ? `You have ${stx} STX waiting in ${GAMES[u.topGame].label}. Claim before the window closes.`
    : `You have ${stx} STX waiting across ${u.gamesCount} games. Claim before the window closes.`;
  return {
    kind: "prize-unclaimed",
    icon: "💰",
    title: "Unclaimed prize!",
    body,
    cta: { label: "Claim now", target: { window: "highscore", gameId: u.topGame } },
  };
}

// selectNudge candidate order becomes:
  const candidates: Array<(s: NudgeSignals) => Nudge | null> = [
    prizeUnclaimedCandidate, // priority 0 — real money beats re-engagement
    rankDropCandidate,       // priority 1
    seasonClosingCandidate,  // priority 2
    streakRiskCandidate,     // priority 3
  ];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/retention-nudge.test.ts`
Expected: PASS (existing cases too — `baseSignals` now carries `unclaimed: null`).

- [ ] **Step 5: Commit**

```bash
git add lib/retention-nudge.ts lib/retention-nudge.test.ts
git commit -m "feat(nudge): prize-unclaimed nudge kind at top priority"
```

---

### Task 5: `collect-nudge-signals` carries the unclaimed summary

**Files:**
- Modify: `lib/collect-nudge-signals.ts`
- Test: `lib/collect-nudge-signals.test.ts` (exists — append + update deps helper)

**Interfaces:**
- Consumes: `UnclaimedSummary` (Task 3), `NudgeSignals.unclaimed` (Task 4).
- Produces: `CollectDeps` gains `fetchUnclaimed: () => Promise<UnclaimedSummary | null>`; `collectNudgeSignals` populates `signals.unclaimed` (null when disconnected or on failure). Task 6 supplies the real dep.

- [ ] **Step 1: Write the failing tests** — append to `lib/collect-nudge-signals.test.ts`; update its existing deps-builder helper to include `fetchUnclaimed: async () => null` so current cases still compile:

```ts
it("populates unclaimed from the injected fetcher", async () => {
  const signals = await collectNudgeSignals(makeDeps({
    address: "SP_A",
    fetchUnclaimed: async () => ({ totalUstx: 500_000, gamesCount: 1, topGame: "snake" }),
  }));
  expect(signals.unclaimed).toEqual({ totalUstx: 500_000, gamesCount: 1, topGame: "snake" });
});

it("unclaimed stays null when disconnected", async () => {
  const fetchUnclaimed = vi.fn(async () => ({ totalUstx: 1, gamesCount: 1, topGame: "snake" as const }));
  const signals = await collectNudgeSignals(makeDeps({ address: null, fetchUnclaimed }));
  expect(signals.unclaimed).toBeNull();
  expect(fetchUnclaimed).not.toHaveBeenCalled();
});

it("a failing unclaimed fetch degrades to null without breaking other signals", async () => {
  const signals = await collectNudgeSignals(makeDeps({
    address: "SP_A",
    fetchUnclaimed: async () => { throw new Error("down"); },
  }));
  expect(signals.unclaimed).toBeNull();
  expect(signals.ranks).not.toBeUndefined(); // snapshot path unaffected
});
```

(Adapt `makeDeps` to whatever the existing helper is named in that file; keep its other defaults.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/collect-nudge-signals.test.ts`
Expected: FAIL — `fetchUnclaimed` not in `CollectDeps`.

- [ ] **Step 3: Implement** in `lib/collect-nudge-signals.ts`:

```ts
import type { UnclaimedSummary } from "@/state/unclaimed-prizes";

// CollectDeps gains:
  fetchUnclaimed: () => Promise<UnclaimedSummary | null>;

// base object gains:
    unclaimed: null,

// after the address guard, fetch snapshot and unclaimed in parallel:
  const [snap, unclaimed] = await Promise.all([
    deps.fetchSnapshot(),
    deps.fetchUnclaimed().catch(() => null),
  ]);
// (keep the rest of the body identical, and return:)
  return { ...base, ranks, countdowns, unclaimed };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/collect-nudge-signals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/collect-nudge-signals.ts lib/collect-nudge-signals.test.ts
git commit -m "feat(nudge): collect unclaimed-prize signal"
```

---

### Task 6: Wire `RetentionBalloon` to the store

**Files:**
- Modify: `components/desktop/RetentionBalloon.tsx`
- Test: `components/desktop/RetentionBalloon.test.tsx` (exists — append)

**Interfaces:**
- Consumes: `useUnclaimedPrizes` (Task 3), `CollectDeps.fetchUnclaimed` (Task 5).
- Produces: the balloon shows the prize nudge; CTA opens `highscore` at `topGame` (already handled by the existing `go()` since the target is a standard `NudgeTarget`).

- [ ] **Step 1: Write the failing test** — append to `components/desktop/RetentionBalloon.test.tsx`, following that file's existing mocking style (it already fakes `collectNudgeSignals` inputs or the fetchers; mirror the pattern used by its "shows a nudge" case). The new case:

```tsx
it("shows the unclaimed-prize balloon and opens High Scores at the top game", async () => {
  useUnclaimedPrizes.setState({
    status: "done", scannedFor: "SP_A",
    claims: [{ gameId: "tetris", season: 1, amountUstx: 1_250_000 }],
    totalUstx: 1_250_000, gamesCount: 1, topGame: "tetris",
  });
  // arrange wallet connected as the file's other cases do, advance the
  // SHOW_DELAY_MS timer, then:
  expect(await screen.findByText("Unclaimed prize!")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Claim now" }));
  expect(openSpy).toHaveBeenCalledWith("highscore", { initialTab: "tetris" });
});
```

(Reuse the file's established setup for `useWallet`, timers, and the `useWindows` open spy — do not invent a new harness.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/desktop/RetentionBalloon.test.tsx`
Expected: FAIL — `collectNudgeSignals` is called without `fetchUnclaimed` (type/compile error) or the balloon never appears.

- [ ] **Step 3: Implement** in `components/desktop/RetentionBalloon.tsx`:

```tsx
import { useUnclaimedPrizes } from "@/state/unclaimed-prizes";
import type { UnclaimedSummary } from "@/state/unclaimed-prizes";

/** Scan (deduped in the store) and reduce store state to the nudge signal. */
async function fetchUnclaimedSummary(address: string): Promise<UnclaimedSummary | null> {
  await useUnclaimedPrizes.getState().scan(address);
  const s = useUnclaimedPrizes.getState();
  if (s.status !== "done" || s.totalUstx <= 0 || !s.topGame) return null;
  return { totalUstx: s.totalUstx, gamesCount: s.gamesCount, topGame: s.topGame };
}

// inside the collectNudgeSignals({...}) call, add:
          fetchUnclaimed: () =>
            address ? fetchUnclaimedSummary(address) : Promise.resolve(null),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/desktop/RetentionBalloon.test.tsx components/desktop/RetentionBalloon.coordination.test.tsx`
Expected: PASS (coordination cases must stay green — the prize nudge rides the same single-balloon pipeline).

- [ ] **Step 5: Commit**

```bash
git add components/desktop/RetentionBalloon.tsx components/desktop/RetentionBalloon.test.tsx
git commit -m "feat(nudge): surface unclaimed prizes through the retention balloon"
```

---

### Task 7: `PrizeTrayBadge` in the system tray

**Files:**
- Create: `components/desktop/PrizeTrayBadge.tsx`
- Modify: `components/desktop/SystemTray.tsx` (mount before the wallet block)
- Test: `components/desktop/PrizeTrayBadge.test.tsx`

**Interfaces:**
- Consumes: `useUnclaimedPrizes` (Task 3), `useWindows.open` (`state/window-manager.ts`).
- Produces: `export function PrizeTrayBadge(): JSX.Element | null` — hidden at zero, otherwise `💰 <X.XX>` button.

- [ ] **Step 1: Write the failing test** — create `components/desktop/PrizeTrayBadge.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrizeTrayBadge } from "./PrizeTrayBadge";
import { useUnclaimedPrizes, resetUnclaimedForTest } from "@/state/unclaimed-prizes";
import { useWindows } from "@/state/window-manager";

beforeEach(() => resetUnclaimedForTest());

describe("PrizeTrayBadge", () => {
  it("renders nothing when there is no unclaimed prize", () => {
    const { container } = render(<PrizeTrayBadge />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the total and opens High Scores at the top game on click", () => {
    useUnclaimedPrizes.setState({
      status: "done", scannedFor: "SP_A",
      claims: [{ gameId: "pacman", season: 1, amountUstx: 590_000 }],
      totalUstx: 590_000, gamesCount: 1, topGame: "pacman",
    });
    const open = vi.fn();
    const prevOpen = useWindows.getState().open;
    useWindows.setState({ open });

    render(<PrizeTrayBadge />);
    const btn = screen.getByRole("button", {
      name: "Unclaimed prizes: 0.59 STX — open High Scores to claim",
    });
    expect(btn).toHaveTextContent("0.59");
    fireEvent.click(btn);
    expect(open).toHaveBeenCalledWith("highscore", { initialTab: "pacman" });

    useWindows.setState({ open: prevOpen });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/desktop/PrizeTrayBadge.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `components/desktop/PrizeTrayBadge.tsx`:

```tsx
"use client";
import type { CSSProperties } from "react";
import { useUnclaimedPrizes } from "@/state/unclaimed-prizes";
import { useWindows } from "@/state/window-manager";

const sunken: CSSProperties = {
  border: "1px solid",
  borderColor: "#808080 #ffffff #ffffff #808080",
  padding: "0 6px",
  height: 20,
  display: "flex",
  alignItems: "center",
  fontSize: 11,
  fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
  gap: 4,
  background: "#c0c0c0",
};

/** Persistent tray reminder: visible while the connected wallet has open,
 *  unclaimed prize money; click lands on the claim tab. */
export function PrizeTrayBadge() {
  const totalUstx = useUnclaimedPrizes((s) => s.totalUstx);
  const topGame = useUnclaimedPrizes((s) => s.topGame);
  const open = useWindows((s) => s.open);
  if (totalUstx <= 0 || !topGame) return null;
  const stx = (totalUstx / 1_000_000).toFixed(2);
  return (
    <button
      type="button"
      className="tray-prize-badge"
      title={`Unclaimed prizes: ${stx} STX`}
      aria-label={`Unclaimed prizes: ${stx} STX — open High Scores to claim`}
      onClick={() => open("highscore", { initialTab: topGame })}
      style={{ ...sunken, border: "1px solid", cursor: "default", color: "#7a5c00" }}
    >
      <span aria-hidden="true">💰</span>
      <span style={{ fontWeight: "bold" }}>{stx}</span>
    </button>
  );
}
```

Mount in `components/desktop/SystemTray.tsx`: import `{ PrizeTrayBadge } from "./PrizeTrayBadge"` and render `<PrizeTrayBadge />` immediately before the `<div ref={walletRef} ...>` wallet block.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/desktop/PrizeTrayBadge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/desktop/PrizeTrayBadge.tsx components/desktop/PrizeTrayBadge.test.tsx components/desktop/SystemTray.tsx
git commit -m "feat(tray): persistent unclaimed-prize badge"
```

---

### Task 8: `useUnclaimedPrizeScan` hook + `PrizeWatcher` mount

**Files:**
- Create: `hooks/useUnclaimedPrizeScan.ts`
- Create: `components/desktop/PrizeWatcher.tsx`
- Modify: `app/page.tsx` (render next to `<LevelUpWatcher />`)
- Test: `hooks/useUnclaimedPrizeScan.test.tsx`

**Interfaces:**
- Consumes: `useWallet` (`state/wallet.ts`), `useUnclaimedPrizes` (Task 3).
- Produces: `export function useUnclaimedPrizeScan(): void`; `export function PrizeWatcher()` (invisible, mirrors `LevelUpWatcher`).

- [ ] **Step 1: Write the failing test** — create `hooks/useUnclaimedPrizeScan.test.tsx` (renderHook pattern, as in `useLevelUpToast.test.tsx`):

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useUnclaimedPrizeScan } from "./useUnclaimedPrizeScan";
import { useWallet } from "@/state/wallet";
import { useUnclaimedPrizes, resetUnclaimedForTest } from "@/state/unclaimed-prizes";

beforeEach(() => {
  resetUnclaimedForTest();
  useWallet.setState({ address: null });
});

describe("useUnclaimedPrizeScan", () => {
  it("scans when a wallet is connected", () => {
    const scan = vi.fn(() => Promise.resolve());
    useUnclaimedPrizes.setState({ scan });
    useWallet.setState({ address: "SP_A" });
    renderHook(() => useUnclaimedPrizeScan());
    expect(scan).toHaveBeenCalledWith("SP_A");
  });

  it("resets when the wallet disconnects", () => {
    const reset = vi.fn();
    useUnclaimedPrizes.setState({ reset });
    renderHook(() => useUnclaimedPrizeScan());
    expect(reset).toHaveBeenCalled();
  });

  it("re-scans on address change", () => {
    const scan = vi.fn(() => Promise.resolve());
    useUnclaimedPrizes.setState({ scan });
    useWallet.setState({ address: "SP_A" });
    const { rerender } = renderHook(() => useUnclaimedPrizeScan());
    useWallet.setState({ address: "SP_B" });
    rerender();
    expect(scan).toHaveBeenLastCalledWith("SP_B");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run hooks/useUnclaimedPrizeScan.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`hooks/useUnclaimedPrizeScan.ts`:

```ts
"use client";
import { useEffect } from "react";
import { useWallet } from "@/state/wallet";
import { useUnclaimedPrizes } from "@/state/unclaimed-prizes";

/** Keep the unclaimed-prizes store in step with the connected wallet. */
export function useUnclaimedPrizeScan(): void {
  const address = useWallet((s) => s.address);
  useEffect(() => {
    if (!address) {
      useUnclaimedPrizes.getState().reset();
      return;
    }
    void useUnclaimedPrizes.getState().scan(address);
  }, [address]);
}
```

`components/desktop/PrizeWatcher.tsx`:

```tsx
"use client";
import { useUnclaimedPrizeScan } from "@/hooks/useUnclaimedPrizeScan";

/** Invisible: runs the unclaimed-prize scan inside a client boundary. */
export function PrizeWatcher() {
  useUnclaimedPrizeScan();
  return null;
}
```

`app/page.tsx`: import `{ PrizeWatcher } from "@/components/desktop/PrizeWatcher"` and render `<PrizeWatcher />` directly after `<LevelUpWatcher />`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run hooks/useUnclaimedPrizeScan.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hooks/useUnclaimedPrizeScan.ts hooks/useUnclaimedPrizeScan.test.tsx components/desktop/PrizeWatcher.tsx app/page.tsx
git commit -m "feat(prizes): mount unclaimed-prize watcher at app root"
```

---

### Task 9: Post-claim refresh in HighScoreWindow + full gate

**Files:**
- Modify: `components/windows/HighScoreWindow.tsx` (confirmed-claim branch, ~line 315)

**Interfaces:**
- Consumes: `useUnclaimedPrizes.getState().refresh({ gameId, season })` (Task 3).

- [ ] **Step 1: Implement** — in the claim button's `watchTx` callback, inside the `outcome === "confirmed"` branch (right after the `setClaimState` filter call), add:

```ts
void useUnclaimedPrizes.getState().refresh({ gameId, season: c.season });
```

with the import at the top of the file:

```ts
import { useUnclaimedPrizes } from "@/state/unclaimed-prizes";
```

(No dedicated component test: `HighScoreWindow.tsx` has no test harness today, the refresh/invalidations semantics are fully covered by Task 3's store tests, and this is a one-line fire-and-forget wiring. The full gate below plus the runtime verify step cover the integration.)

- [ ] **Step 2: Full gate — run and READ the output of each**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all green (test count rises from 654 by the new cases; zero type or lint errors; production build succeeds).

- [ ] **Step 3: Commit**

```bash
git add components/windows/HighScoreWindow.tsx
git commit -m "feat(prizes): drop tray badge immediately after a confirmed claim"
```

- [ ] **Step 4: Runtime verify** — run the verify skill / dev server: `npm run dev`, connect a wallet (or stub `useUnclaimedPrizes.setState` in the console), confirm: badge appears in the tray with the STX total, balloon shows once with the approved copy, clicking either lands on the High Scores tab of the top game, and no balloon/badge appears when disconnected.

---

## Self-Review Notes

- **Spec coverage:** store (§1) → Task 3; cachedRead wraps (§1 improvement) → Task 2; nudge kind + signals (§2) → Tasks 4–5; balloon wiring (§2) → Task 6; badge (§3) → Task 7; post-claim refresh + invalidation (§4) → Tasks 1, 3, 9; mount point (§5) → Task 8; error handling (spec §Error) → Task 3 error cases + Task 5 degrade case; testing (spec §Testing) → each task's test steps; full gate → Task 9.
- **Type consistency:** `UnclaimedSummary { totalUstx, gamesCount, topGame }` is defined once in Task 3 and used verbatim in Tasks 4, 5, 6. `refresh({ gameId, season })` signature matches Tasks 3 and 9. Copy strings in Task 4 tests match the Global Constraints copy exactly.
- The spec's indicative field name `count` was tightened to `gamesCount` (distinct games) everywhere — the balloon copy counts games, not claims.
