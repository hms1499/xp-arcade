# Whole-Project Correctness Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix seven correctness/robustness bugs found in the 2026-06-09 whole-project audit (group A) — frontend only, no Clarity changes.

**Architecture:** Each fix is a self-contained unit. Pure libs/helpers are TDD'd directly with Vitest (jsdom env, `@testing-library/react` is NOT installed, so hooks are tested only via their pure helpers/`deriveCountdown`, never `renderHook`). Components are thin wiring over already-tested units, covered by `tsc` + build.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest 3, Zustand 5, `@stacks/connect`, `@stacks/transactions`.

**Spec:** `docs/superpowers/specs/2026-06-09-correctness-fixes-design.md`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `frontend/lib/high-score.ts` | Per-game personal-best in localStorage | Rewrite |
| `frontend/lib/high-score.test.ts` | Unit tests (per-game isolation, legacy fallback) | Rewrite |
| `frontend/components/shared/SharedMintDialog.tsx` | Call `recordScore(gameId, score)` for all games | Modify |
| `frontend/components/game/GameCanvas.tsx` | Call `getBestScore("snake")` (Snake canvas) | Modify |
| `frontend/lib/game-registry.ts` | Add non-throwing `gameIdFromOnchainOrNull` | Modify |
| `frontend/lib/game-registry.test.ts` | Test the null variant | Modify |
| `frontend/lib/metadata-route.ts` | 404 (not 500) on unknown game-id | Modify |
| `frontend/lib/metadata-route.test.ts` | Test unknown game-id → 404 | Modify |
| `frontend/hooks/useLeaderboardShowcase.ts` | Per-game fallback via pure `mergeWithFallback` | Modify |
| `frontend/hooks/useLeaderboardShowcase.test.ts` | Test the pure merge helper | Create |
| `frontend/lib/holdings.ts` | allSettled + concurrency-capped metadata fetch | Modify |
| `frontend/lib/holdings.test.ts` | Skip-on-failure + concurrency-cap tests | Modify |
| `frontend/state/wallet.ts` | `connect()` tolerates cancel | Modify |
| `frontend/state/wallet.test.ts` | Test connect-cancel does not throw | Create |
| `frontend/lib/season-countdown.ts` | `useSeasonCountdown(gameId)` + `endBlock` in types | Modify |
| `frontend/lib/season-countdown.test.ts` | Assert `endBlock` carried on `reached` | Modify |
| `frontend/components/windows/SeasonAdminWindow.tsx` | Pass selected `gameId` to countdown | Modify |
| `frontend/components/desktop/DesktopLeaderboardShowcase.tsx` | Pass `"snake"` to countdown | Modify |
| `frontend/lib/ended-seasons.ts` | Remember closed `(game, endBlock)` pairs | Create |
| `frontend/lib/ended-seasons.test.ts` | Round-trip + isolation + corrupt-safe | Create |
| `frontend/components/windows/HighScoreWindow.tsx` | Per-game countdown + S1 button gating | Modify |

---

## Task 1: C1 — Game-scoped personal best

**Files:**
- Rewrite: `frontend/lib/high-score.ts`
- Rewrite: `frontend/lib/high-score.test.ts`
- Modify: `frontend/components/shared/SharedMintDialog.tsx`
- Modify: `frontend/components/game/GameCanvas.tsx`

- [x] **Step 1: Rewrite the test**

```ts
// frontend/lib/high-score.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { getBestScore, recordScore } from "./high-score";

describe("high-score", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns 0 when no score has been stored for that game", () => {
    expect(getBestScore("snake")).toBe(0);
    expect(getBestScore("tetris")).toBe(0);
  });

  it("persists a higher score and reports a new record", () => {
    expect(recordScore("snake", 7)).toEqual({ best: 7, isNewRecord: true });
    expect(getBestScore("snake")).toBe(7);
  });

  it("does not lower the best for an equal or smaller score", () => {
    recordScore("snake", 10);
    expect(recordScore("snake", 10)).toEqual({ best: 10, isNewRecord: false });
    expect(recordScore("snake", 3)).toEqual({ best: 10, isNewRecord: false });
    expect(getBestScore("snake")).toBe(10);
  });

  it("keeps best scores isolated per game", () => {
    recordScore("snake", 400);
    recordScore("tetris", 9000);
    expect(getBestScore("snake")).toBe(400);
    expect(getBestScore("tetris")).toBe(9000);
  });

  it("treats a corrupt stored value as 0", () => {
    localStorage.setItem("xp-arcade:best-score:snake", "not-a-number");
    expect(getBestScore("snake")).toBe(0);
    expect(recordScore("snake", 1)).toEqual({ best: 1, isNewRecord: true });
  });

  it("falls back to the legacy global key for snake only", () => {
    localStorage.setItem("xp-arcade:best-score", "42");
    expect(getBestScore("snake")).toBe(42);
    expect(getBestScore("tetris")).toBe(0);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/high-score.test.ts`
Expected: FAIL — `getBestScore` now takes a `gameId` argument that the old impl ignores; per-game/legacy tests fail.

- [x] **Step 3: Rewrite `high-score.ts`**

```ts
// frontend/lib/high-score.ts
import type { GameId } from "./game-registry";

const LEGACY_KEY = "xp-arcade:best-score";
function keyFor(gameId: GameId): string {
  return `xp-arcade:best-score:${gameId}`;
}

function readKey(key: string): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(key);
  const n = Number(raw);
  return raw !== null && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Personal best for a game (localStorage). 0 if none / SSR / corrupt. Snake
 * falls back to the pre-multigame global key so returning players keep it. */
export function getBestScore(gameId: GameId): number {
  const scoped = readKey(keyFor(gameId));
  if (scoped > 0) return scoped;
  if (gameId === "snake") return readKey(LEGACY_KEY);
  return 0;
}

/** Records a finished game's score, persisting only if it beats the stored
 * best for that game. */
export function recordScore(
  gameId: GameId,
  score: number,
): { best: number; isNewRecord: boolean } {
  const prev = getBestScore(gameId);
  if (score > prev) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(keyFor(gameId), String(score));
    }
    return { best: score, isNewRecord: true };
  }
  return { best: prev, isNewRecord: false };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/high-score.test.ts`
Expected: PASS (6 tests).

- [x] **Step 5: Update `SharedMintDialog.tsx`**

Replace the Snake-only block (currently lines 121-125):

```tsx
  const [hs] = useState(() =>
    gameId === "snake"
      ? recordScore(score)
      : { isNewRecord: false, best: score }
  );
```

with (records for every game):

```tsx
  const [hs] = useState(() => recordScore(gameId, score));
```

- [x] **Step 6: Update `GameCanvas.tsx` (Snake canvas) call sites**

Line 55: change `getBestScore()` to `getBestScore("snake")`:

```tsx
  const [best] = useState(() => getBestScore("snake"));
```

Line ~313: change `gameOverBestRef.current = getBestScore();` to:

```tsx
          gameOverBestRef.current = getBestScore("snake");
```

- [x] **Step 7: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [x] **Step 8: Commit**

```bash
git add frontend/lib/high-score.ts frontend/lib/high-score.test.ts frontend/components/shared/SharedMintDialog.tsx frontend/components/game/GameCanvas.tsx
git commit -m "fix(high-score): scope personal best per game"
```

---

## Task 2: A2 — Metadata route guards unknown game-id

**Files:**
- Modify: `frontend/lib/game-registry.ts`
- Modify: `frontend/lib/game-registry.test.ts`
- Modify: `frontend/lib/metadata-route.ts`
- Modify: `frontend/lib/metadata-route.test.ts`

- [x] **Step 1: Add the failing registry test**

Append to `frontend/lib/game-registry.test.ts` (inside the top-level `describe`, or add a new one):

```ts
import { gameIdFromOnchain, gameIdFromOnchainOrNull } from "./game-registry";

describe("gameIdFromOnchainOrNull", () => {
  it("resolves a known on-chain id", () => {
    expect(gameIdFromOnchainOrNull(1)).toBe("snake");
  });
  it("returns null for an unknown on-chain id instead of throwing", () => {
    expect(gameIdFromOnchainOrNull(99)).toBeNull();
  });
  it("the throwing variant still throws for unknown ids", () => {
    expect(() => gameIdFromOnchain(99)).toThrow();
  });
});
```

> If `game-registry.test.ts` already imports from `./game-registry`, merge these
> named imports into the existing import line instead of adding a duplicate.

- [x] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/game-registry.test.ts`
Expected: FAIL — `gameIdFromOnchainOrNull` is not exported.

- [x] **Step 3: Add `gameIdFromOnchainOrNull` and reuse it**

In `frontend/lib/game-registry.ts`, replace the existing `gameIdFromOnchain` (lines 100-104):

```ts
export function gameIdFromOnchain(n: number): GameId {
  const found = GAME_IDS.find((id) => GAMES[id].onchainId === n);
  if (!found) throw new Error(`Unknown onchain id: ${n}`);
  return found;
}
```

with:

```ts
export function gameIdFromOnchainOrNull(n: number): GameId | null {
  return GAME_IDS.find((id) => GAMES[id].onchainId === n) ?? null;
}

export function gameIdFromOnchain(n: number): GameId {
  const found = gameIdFromOnchainOrNull(n);
  if (!found) throw new Error(`Unknown onchain id: ${n}`);
  return found;
}
```

- [x] **Step 4: Run registry test to verify it passes**

Run: `cd frontend && npx vitest run lib/game-registry.test.ts`
Expected: PASS.

- [x] **Step 5: Add the failing metadata-route test**

Append inside the `describe("scoreMetadataResponseV3", ...)` block in `frontend/lib/metadata-route.test.ts`:

```ts
  it("returns 404 for a token whose game-id is not registered", async () => {
    fetchReadOnly.mockResolvedValueOnce(readOnlyResult({
      score: "10",
      "player-name": "x",
      rarity: "Common",
      season: "1",
      "game-id": "99",
    }));

    const res = await scoreMetadataResponseV3(
      new Request("http://x/api/metadata/score/7"),
      Promise.resolve({ id: "7" }),
    );

    expect(res.status).toBe(404);
  });
```

- [x] **Step 6: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/metadata-route.test.ts`
Expected: FAIL — current code throws → 500, not 404.

- [x] **Step 7: Guard the route**

In `frontend/lib/metadata-route.ts`, change the import on line 7 to also pull the null variant:

```ts
import { GAMES, gameIdFromOnchainOrNull } from "@/lib/game-registry";
```

Replace lines 64-65:

```ts
    const gameId = gameIdFromOnchain(Number(v["game-id"]));
    const gameName = GAMES[gameId].label;
```

with:

```ts
    const gameId = gameIdFromOnchainOrNull(Number(v["game-id"]));
    if (!gameId) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "public, max-age=60" } },
      );
    }
    const gameName = GAMES[gameId].label;
```

- [x] **Step 8: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/metadata-route.test.ts`
Expected: PASS (existing + new test).

- [x] **Step 9: Commit**

```bash
git add frontend/lib/game-registry.ts frontend/lib/game-registry.test.ts frontend/lib/metadata-route.ts frontend/lib/metadata-route.test.ts
git commit -m "fix(metadata): return 404 for unknown game-id"
```

---

## Task 3: L1 — Showcase tolerates per-game failures

**Files:**
- Modify: `frontend/hooks/useLeaderboardShowcase.ts`
- Create: `frontend/hooks/useLeaderboardShowcase.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// frontend/hooks/useLeaderboardShowcase.test.ts
import { describe, expect, it } from "vitest";
import { mergeWithFallback } from "./useLeaderboardShowcase";

describe("mergeWithFallback", () => {
  it("updates games with a fresh value", () => {
    const prev = { snake: 1, tetris: 2, pacman: 3, breakout: 4 };
    const next = mergeWithFallback(prev, [
      ["snake", 10],
      ["tetris", 20],
      ["pacman", 30],
      ["breakout", 40],
    ]);
    expect(next).toEqual({ snake: 10, tetris: 20, pacman: 30, breakout: 40 });
  });

  it("keeps the previous value when the fresh value is null (failed read)", () => {
    const prev = { snake: 1, tetris: 2, pacman: 3, breakout: 4 };
    const next = mergeWithFallback(prev, [
      ["snake", 10],
      ["tetris", null],
      ["pacman", 30],
      ["breakout", null],
    ]);
    expect(next).toEqual({ snake: 10, tetris: 2, pacman: 30, breakout: 4 });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run hooks/useLeaderboardShowcase.test.ts`
Expected: FAIL — `mergeWithFallback` is not exported.

- [x] **Step 3: Add the pure helper and use it in `refresh`**

In `frontend/hooks/useLeaderboardShowcase.ts`, add this exported helper near the top (after the type aliases, before `useLeaderboardShowcase`):

```ts
/** Merge fresh per-game values over the previous map; a null entry means that
 * game's read failed, so its previous value is kept (no blanking). */
export function mergeWithFallback<T>(
  prev: Record<GameId, T>,
  entries: ReadonlyArray<readonly [GameId, T | null]>,
): Record<GameId, T> {
  const next = { ...prev };
  for (const [gameId, value] of entries) {
    if (value !== null) next[gameId] = value;
  }
  return next;
}
```

Replace the body of `refresh` (currently lines 39-65) with a per-game-caught version:

```ts
  const refresh = useCallback(async () => {
    const [rowEntries, seasonEntries, poolEntries] = await Promise.all([
      Promise.all(
        GAME_IDS.map(
          async (gameId) =>
            [gameId, await getTopTenForGame(gameId).catch(() => null)] as const,
        ),
      ),
      Promise.all(
        GAME_IDS.map(
          async (gameId) =>
            [
              gameId,
              await getCurrentSeasonForGame(gameId).catch(() => null),
            ] as const,
        ),
      ),
      Promise.all(
        GAME_IDS.map(
          async (gameId) =>
            [
              gameId,
              await getPrizePoolBalanceForGame(gameId).catch(() => null),
            ] as const,
        ),
      ),
    ] as const);

    setRowsByGame((prev) => mergeWithFallback(prev, rowEntries));
    setSeasonsByGame((prev) => mergeWithFallback(prev, seasonEntries));
    setPoolsByGame(Object.fromEntries(poolEntries) as PoolsByGame);
    setLastUpdated(new Date());
    setError(null);
  }, []);
```

> Note: pools intentionally keep the existing "null = unknown" display behaviour
> (rendered as "…"), so they are not run through `mergeWithFallback`.

- [x] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run hooks/useLeaderboardShowcase.test.ts`
Expected: PASS (2 tests).

- [x] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [x] **Step 6: Commit**

```bash
git add frontend/hooks/useLeaderboardShowcase.ts frontend/hooks/useLeaderboardShowcase.test.ts
git commit -m "fix(showcase): keep per-game data when one game's read fails"
```

---

## Task 4: H1 — Holdings tolerate failed metadata + cap concurrency

**Files:**
- Modify: `frontend/lib/holdings.ts`
- Modify: `frontend/lib/holdings.test.ts`

- [x] **Step 1: Update the test (realistic `ok`, skip-on-failure, concurrency cap)**

Replace the `jsonResponse` helper and `beforeEach` in `frontend/lib/holdings.test.ts` and add two tests. Full replacement of the file's top through the first test's start:

```ts
// frontend/lib/holdings.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchScoreHoldings, scoreNftKey } from "./holdings";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

function metaBody(id: number) {
  return {
    name: `Snake Score #${id}`,
    image: `data:image/svg+xml,${id}`,
    attributes: [
      { trait_type: "Rarity", value: "Common" },
      { trait_type: "Season", value: "1" },
      { trait_type: "Score", value: String(id) },
    ],
  };
}

describe("holdings", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/extended/v1/tokens/nft/holdings")) {
          const parsed = new URL(url);
          const offset = Number(parsed.searchParams.get("offset") ?? 0);
          const ids =
            offset === 0
              ? Array.from({ length: 50 }, (_, i) => i + 1)
              : [51, 52];
          return jsonResponse({
            results: ids.map((id) => ({ value: { repr: `u${id}` } })),
          });
        }
        const id = Number(url.match(/\/api\/metadata\/score\/(\d+)/)?.[1]);
        return jsonResponse(metaBody(id));
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("paginates score NFT holdings beyond the first 50 results", async () => {
    const nfts = await fetchScoreHoldings(
      "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV",
      "snake",
    );

    expect(nfts).toHaveLength(52);
    expect(nfts.at(-1)).toMatchObject({ id: 52, score: 52 });
    const holdingsCalls = vi
      .mocked(fetch)
      .mock.calls.map(([input]) => String(input))
      .filter((url) => url.includes("/extended/v1/tokens/nft/holdings"));
    expect(holdingsCalls).toHaveLength(2);
    expect(new URL(holdingsCalls[0]).searchParams.get("offset")).toBe("0");
    expect(new URL(holdingsCalls[1]).searchParams.get("offset")).toBe("50");
  });

  it("builds stable keys across games with overlapping token ids", () => {
    expect(scoreNftKey({ gameId: "snake", id: 1 })).toBe("snake-1");
    expect(scoreNftKey({ gameId: "tetris", id: 1 })).toBe("tetris-1");
  });

  it("skips NFTs whose metadata fetch fails instead of dropping the whole game", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/extended/v1/tokens/nft/holdings")) {
          return jsonResponse({
            results: [1, 2, 3].map((id) => ({ value: { repr: `u${id}` } })),
          });
        }
        const id = Number(url.match(/\/api\/metadata\/score\/(\d+)/)?.[1]);
        if (id === 2) return jsonResponse({ error: "rate limited" }, false);
        return jsonResponse(metaBody(id));
      }),
    );

    const nfts = await fetchScoreHoldings(
      "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV",
      "snake",
    );

    expect(nfts.map((n) => n.id).sort((a, b) => a - b)).toEqual([1, 3]);
  });

  it("never exceeds the metadata concurrency cap", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/extended/v1/tokens/nft/holdings")) {
          return jsonResponse({
            results: Array.from({ length: 30 }, (_, i) => ({
              value: { repr: `u${i + 1}` },
            })),
          });
        }
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        const id = Number(url.match(/\/api\/metadata\/score\/(\d+)/)?.[1]);
        return jsonResponse(metaBody(id));
      }),
    );

    await fetchScoreHoldings("SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV", "snake");
    expect(maxInFlight).toBeLessThanOrEqual(5);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/holdings.test.ts`
Expected: FAIL — the skip-on-failure and concurrency-cap tests fail (current code uses `Promise.all`, no `ok` check, unbounded concurrency).

- [x] **Step 3: Rewrite the metadata-fetch section of `holdings.ts`**

Replace the final `return Promise.all(...)` block (currently lines 59-74) with a concurrency-capped, failure-tolerant version:

```ts
  const META_CONCURRENCY = 5;

  async function fetchMeta(id: number): Promise<ScoreNft | null> {
    try {
      const res = await fetch(`/api/metadata/${game.metaSegment}/${id}`);
      if (!res.ok) return null;
      const meta = (await res.json()) as MetadataResponse;
      return {
        id,
        gameId,
        image: meta.image,
        name: meta.name,
        rarity: attr(meta, "Rarity"),
        score: attr(meta, "Score") ? Number(attr(meta, "Score")) : undefined,
        season: attr(meta, "Season") ? Number(attr(meta, "Season")) : undefined,
      };
    } catch {
      return null;
    }
  }

  const results: Array<ScoreNft | null> = new Array(ids.length).fill(null);
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const index = cursor++;
      results[index] = await fetchMeta(ids[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(META_CONCURRENCY, ids.length) }, worker),
  );

  return results.filter((nft): nft is ScoreNft => nft !== null);
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/holdings.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [x] **Step 6: Commit**

```bash
git add frontend/lib/holdings.ts frontend/lib/holdings.test.ts
git commit -m "fix(holdings): tolerate failed metadata and cap concurrency"
```

---

## Task 5: C2 — Wallet connect tolerates user cancel

**Files:**
- Modify: `frontend/state/wallet.ts`
- Create: `frontend/state/wallet.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// frontend/state/wallet.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@stacks/connect", () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  getLocalStorage: vi.fn(() => null),
  isConnected: vi.fn(() => false),
}));

import { connect as connectWallet } from "@stacks/connect";
import { useWallet } from "./wallet";

const mockConnect = vi.mocked(connectWallet);

describe("wallet.connect", () => {
  beforeEach(() => {
    useWallet.setState({ address: null });
    mockConnect.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it("does not throw and keeps address null when the user cancels", async () => {
    mockConnect.mockRejectedValueOnce(new Error("User canceled"));
    await expect(useWallet.getState().connect()).resolves.toBeUndefined();
    expect(useWallet.getState().address).toBeNull();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run state/wallet.test.ts`
Expected: FAIL — `connect()` rejects (the error propagates).

- [x] **Step 3: Wrap `connect()` in try/catch**

In `frontend/state/wallet.ts`, replace the `connect` action (lines 28-31):

```ts
  connect: async () => {
    await connectWallet();
    set({ address: readStoredAddress() });
  },
```

with:

```ts
  connect: async () => {
    try {
      await connectWallet();
      set({ address: readStoredAddress() });
    } catch {
      // User cancelled the wallet modal (or the wallet errored). Keep the
      // current address rather than surfacing an unhandled rejection.
    }
  },
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run state/wallet.test.ts`
Expected: PASS (1 test).

- [x] **Step 5: Commit**

```bash
git add frontend/state/wallet.ts frontend/state/wallet.test.ts
git commit -m "fix(wallet): swallow wallet-cancel instead of unhandled rejection"
```

---

## Task 6: S2 — Per-game season countdown

**Files:**
- Modify: `frontend/lib/season-countdown.ts`
- Modify: `frontend/lib/season-countdown.test.ts`
- Modify: `frontend/components/windows/SeasonAdminWindow.tsx`
- Modify: `frontend/components/desktop/DesktopLeaderboardShowcase.tsx`

(`HighScoreWindow.tsx`'s countdown call is updated in Task 7, together with the S1 wiring.)

- [x] **Step 1: Update the countdown test for `endBlock`**

In `frontend/lib/season-countdown.test.ts`, replace the "reached block" test and add an `endBlock` assertion:

```ts
  it("reached block -> reached and carries endBlock", () => {
    const c = deriveCountdown(
      { kind: "block", reached: true, endsAt: new Date(now), endBlock: 8470355 },
      now,
    );
    expect(c.state).toBe("reached");
    if (c.state === "reached") expect(c.endBlock).toBe(8470355);
  });
```

Also update the existing "future block -> live" test to include `endBlock` in its source object:

```ts
  it("future block -> live with remaining time", () => {
    const c = deriveCountdown(
      { kind: "block", reached: false, endsAt: new Date(now + 3_600_000), endBlock: 8470355 },
      now,
    );
    expect(c.state).toBe("live");
    if (c.state === "live") expect(c.hours).toBe(1);
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/season-countdown.test.ts`
Expected: FAIL — `block` source/`reached` state has no `endBlock` field (type + assertion).

- [x] **Step 3: Add `endBlock` to types + thread it; make the hook per-game**

In `frontend/lib/season-countdown.ts`:

(a) Add `endBlock` to the `reached` variant of `Countdown`:

```ts
  | { state: "reached"; endsAt: Date; endBlock: number }
```

(b) Add `endBlock` to the `block` variant of `CountdownSource`:

```ts
  | { kind: "block"; reached: boolean; endsAt: Date; endBlock: number };
```

(c) In `deriveCountdown`, return `endBlock` on the reached branch:

```ts
  if (source.kind === "block" && source.reached) {
    return { state: "reached", endsAt: source.endsAt, endBlock: source.endBlock };
  }
```

(d) Delete the `CANONICAL_GAME` constant (lines ~65-68) and change the hook
signature to take a `gameId`, reading that game's deadline:

```ts
export function useSeasonCountdown(gameId: GameId): Countdown {
  const [source, setSource] = useState<CountdownSource>({ kind: "loading" });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      try {
        const [endBlock, currentBlock] = await Promise.all([
          getSeasonEndBlockForGame(gameId),
          getCurrentStacksBlockHeight(),
        ]);
        if (cancelled) return;
        if (endBlock > 0) {
          setSource({
            kind: "block",
            reached: currentBlock >= endBlock,
            endsAt: blocksToEta(endBlock, currentBlock),
            endBlock,
          });
          return;
        }
        const iso = parseIso();
        setSource(iso ? { kind: "iso", endsAt: iso } : { kind: "none" });
      } catch {
        if (cancelled) return;
        const iso = parseIso();
        setSource(iso ? { kind: "iso", endsAt: iso } : { kind: "none" });
      }
    }
    resolve();
    const id = setInterval(resolve, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [gameId]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return deriveCountdown(source, now);
}
```

> `GAMES` / `onchainIdFor` may now be unused imports in this file. Remove any
> import that `tsc`/lint flags as unused (keep `type GameId`).

- [x] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/season-countdown.test.ts`
Expected: PASS (6 tests).

- [x] **Step 5: Update `SeasonAdminWindow.tsx` (declare `gameId` before countdown)**

Currently (lines 45-46):

```tsx
  const countdown = useSeasonCountdown();
  const [gameId, setGameId] = useState<GameId>("snake");
```

Reorder and pass `gameId`:

```tsx
  const [gameId, setGameId] = useState<GameId>("snake");
  const countdown = useSeasonCountdown(gameId);
```

- [x] **Step 6: Update `DesktopLeaderboardShowcase.tsx`**

Change the countdown call (line 65) to pass the canonical display game:

```tsx
  const countdown = useSeasonCountdown("snake");
```

- [x] **Step 7: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

> Note: `HighScoreWindow.tsx` still calls `useSeasonCountdown()` with no argument
> at this point and will be a type error until Task 7. If you need a green
> type-check between tasks, do Step 8 commit after Task 7. Otherwise, proceed
> directly to Task 7 and run `tsc` once at the end of Task 7.

- [x] **Step 8: Commit**

```bash
git add frontend/lib/season-countdown.ts frontend/lib/season-countdown.test.ts frontend/components/windows/SeasonAdminWindow.tsx frontend/components/desktop/DesktopLeaderboardShowcase.tsx
git commit -m "feat(season): per-game countdown with endBlock"
```

---

## Task 7: S1 — Stillborn-season UI mitigation

**Files:**
- Create: `frontend/lib/ended-seasons.ts`
- Create: `frontend/lib/ended-seasons.test.ts`
- Modify: `frontend/components/windows/HighScoreWindow.tsx`

- [x] **Step 1: Write the failing test**

```ts
// frontend/lib/ended-seasons.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { markSeasonEnded, wasSeasonEnded } from "./ended-seasons";

describe("ended-seasons", () => {
  beforeEach(() => localStorage.clear());

  it("returns false for a pair that was never marked", () => {
    expect(wasSeasonEnded("snake", 8470355)).toBe(false);
  });

  it("remembers a marked (game, endBlock) pair", () => {
    markSeasonEnded("snake", 8470355);
    expect(wasSeasonEnded("snake", 8470355)).toBe(true);
  });

  it("isolates by game and by block", () => {
    markSeasonEnded("snake", 8470355);
    expect(wasSeasonEnded("tetris", 8470355)).toBe(false);
    expect(wasSeasonEnded("snake", 9999999)).toBe(false);
  });

  it("tolerates corrupt storage", () => {
    localStorage.setItem("xp-arcade:ended-seasons", "not-json");
    expect(wasSeasonEnded("snake", 8470355)).toBe(false);
    expect(() => markSeasonEnded("snake", 8470355)).not.toThrow();
    expect(wasSeasonEnded("snake", 8470355)).toBe(true);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/ended-seasons.test.ts`
Expected: FAIL — cannot resolve `./ended-seasons`.

- [x] **Step 3: Write `ended-seasons.ts`**

```ts
// frontend/lib/ended-seasons.ts
import type { GameId } from "./game-registry";

const KEY = "xp-arcade:ended-seasons";
const pairKey = (gameId: GameId, endBlock: number) => `${gameId}:${endBlock}`;

function load(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

/** Remember that this browser closed `(gameId, endBlock)` so the permissionless
 * End-Season button stops re-offering the same now-past deadline. */
export function markSeasonEnded(gameId: GameId, endBlock: number): void {
  if (typeof window === "undefined") return;
  const set = load();
  set.add(pairKey(gameId, endBlock));
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    // storage full / unavailable — best effort only
  }
}

export function wasSeasonEnded(gameId: GameId, endBlock: number): boolean {
  return load().has(pairKey(gameId, endBlock));
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/ended-seasons.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Wire `HighScoreWindow.tsx` — per-game countdown + S1 gating**

(a) Add the import near the other `@/lib` imports:

```tsx
import { markSeasonEnded, wasSeasonEnded } from "@/lib/ended-seasons";
```

(b) Change the countdown call (line 79) to per-game:

```tsx
  const countdown = useSeasonCountdown(gameId);
```

(c) In `handlePermissionlessEnd`, capture `endBlock` at the top and record it on
confirmed success. Replace the function's body start (after the `confirm(...)`
guard) so it reads the reached `endBlock` and marks it:

Change the success branch inside `watchTx` from:

```tsx
        if (s === "success") {
          useToasts.getState().push({
            title: "Season closed",
            body: "Snapshot locked. Refreshing…",
          });
          setReloadKey((k) => k + 1);
        } else if (s !== "pending") {
```

to:

```tsx
        if (s === "success") {
          if (countdown.state === "reached") {
            markSeasonEnded(gameId, countdown.endBlock);
          }
          useToasts.getState().push({
            title: "Season closed",
            body: "Snapshot locked. Refreshing…",
          });
          setReloadKey((k) => k + 1);
        } else if (s !== "pending") {
```

(d) Strengthen the `confirm()` copy. Replace the existing confirm string:

```tsx
      !confirm(
        `The on-chain deadline for ${GAMES[gameId].label} has passed.\n\n` +
          "End this season now? This locks the top-10 snapshot and opens prize claims. " +
          "Anyone may do this — no owner needed.",
      )
```

with:

```tsx
      !confirm(
        `The on-chain deadline for ${GAMES[gameId].label} has passed.\n\n` +
          "End this season now? This locks the top-10 snapshot and opens prize claims. " +
          "Anyone may do this — no owner needed.\n\n" +
          "Note: the deadline block is in the past and is NOT reset on close, so a " +
          "freshly-opened season can be closed again immediately. Only proceed if " +
          "this is the intended contest close.",
      )
```

(e) Gate the button render with `wasSeasonEnded`. Change the guard:

```tsx
      {countdown.state === "reached" && (
```

to:

```tsx
      {countdown.state === "reached" &&
        !wasSeasonEnded(gameId, countdown.endBlock) && (
```

> The block following this guard is unchanged. Ensure the closing `)}` of the JSX
> conditional still matches — the expression is now a two-line `&&` chain.

- [x] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0 (this clears the deferred `HighScoreWindow` type error from Task 6).

- [x] **Step 7: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all suites PASS (existing + new `ended-seasons`, `wallet`, `useLeaderboardShowcase` tests; updated `high-score`, `holdings`, `metadata-route`, `game-registry`, `season-countdown`).

- [x] **Step 8: Commit**

```bash
git add frontend/lib/ended-seasons.ts frontend/lib/ended-seasons.test.ts frontend/components/windows/HighScoreWindow.tsx
git commit -m "feat(season): mitigate stillborn-season re-close in UI"
```

---

## Task 8: Final verification gate

- [x] **Step 1: Frontend CI**

Run: `cd frontend && npm run ci`
Expected: lint + test + typecheck + build all green. Read the output.

- [x] **Step 2: Contract unchanged (sanity)**

Run: `cd contract && clarinet check`
Expected: exit 0 (no contract files were touched this plan).

- [x] **Step 3: Confirm clean tree**

Run: `git status -sb`
Expected: no uncommitted changes from this plan.

---

## Self-Review notes (author)

- **Spec coverage:** C1→Task 1; A2→Task 2; L1→Task 3; H1→Task 4; C2→Task 5;
  S2→Task 6; S1→Task 7; verification→Task 8. All seven in-scope items covered.
- **Signature ripples handled:** `getBestScore`/`recordScore` gain `gameId` →
  consumers `SharedMintDialog` and `GameCanvas` (Snake canvas, ×2) updated in
  Task 1. `useSeasonCountdown` gains `gameId` → `SeasonAdminWindow` (reordered),
  `DesktopLeaderboardShowcase` in Task 6, `HighScoreWindow` in Task 7.
- **Cross-task type dependency:** Task 6 leaves `HighScoreWindow` temporarily
  failing `tsc` (still calls `useSeasonCountdown()`); Task 7 fixes it. Noted in
  Task 6 Step 7. Full `tsc` is asserted green at the end of Task 7.
- **No `renderHook`:** `@testing-library/react` is not installed; hooks are tested
  via pure helpers (`mergeWithFallback`, `deriveCountdown`) and the zustand store
  is tested via `getState()`. No new test deps introduced.
- **`endBlock` only on `reached`:** the only consumer (S1 button) reads it after
  narrowing `state === "reached"`, so the `live` state need not carry it.
