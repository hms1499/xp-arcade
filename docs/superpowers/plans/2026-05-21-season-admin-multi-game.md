# Season Admin Multi-Game + Hardened Payout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `SeasonAdminWindow` administer all 3 game contracts (snake, tetris, pacman), and harden the payout flow with structured memos + transaction confirmation tracking.

**Architecture:** Extend `contract-calls.ts` with `*ForGame(gameId, ...)` variants of the season helpers (`getCurrentSeason`, `getPrizePoolBalance`, `getSeasonPrize`, `hasClaimedPrize`, `endSeason`) matching the existing multi-game pattern (`getTopTenForGame`, `mintScoreForGame`). Add a tiny pure helper `lib/payout-memo.ts` for the `xpa-{game}-s{season}-r{rank}` memo format. Refactor `SeasonAdminWindow` to keep one window with a 3-tab game switcher, route all reads/writes through the per-game helpers, inject the structured memo into `transferStx`, and run `watchTx` after submit to surface success/failure as toasts.

**Tech Stack:** Next.js 16 (App Router), TypeScript 5, `@stacks/transactions` ^7.4, `@stacks/connect` ^8.2, Vitest 3, Zustand 5, xp.css.

**Non-goals (deferred):** Local payout ledger persistence, pre-flight check on End Season, "Pay all" batch button, pool transparency dashboard. These remain as follow-ups.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/lib/payout-memo.ts` | Create | Pure `formatPayoutMemo` / `parsePayoutMemo` helpers |
| `frontend/lib/payout-memo.test.ts` | Create | Roundtrip + parse-tolerance + length tests |
| `frontend/lib/contract-calls.ts` | Modify | Add `getCurrentSeasonForGame`, `getPrizePoolBalanceForGame`, `getSeasonPrizeForGame`, `hasClaimedPrizeForGame`, `endSeasonForGame` |
| `frontend/components/windows/SeasonAdminWindow.tsx` | Modify | Add game-tab state, swap to `*ForGame` helpers, inject structured memo, wrap payout submit in `watchTx` |

---

## Task 1: Payout memo helper + tests

**Files:**
- Create: `frontend/lib/payout-memo.ts`
- Create: `frontend/lib/payout-memo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/payout-memo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatPayoutMemo, parsePayoutMemo } from "./payout-memo";

describe("formatPayoutMemo", () => {
  it("emits xpa-{game}-s{season}-r{rank}", () => {
    expect(formatPayoutMemo({ gameId: "snake", season: 3, rank: 1 })).toBe(
      "xpa-snake-s3-r1",
    );
    expect(formatPayoutMemo({ gameId: "pacman", season: 12, rank: 10 })).toBe(
      "xpa-pacman-s12-r10",
    );
  });

  it("fits within the 34-byte STX memo budget", () => {
    const longest = formatPayoutMemo({
      gameId: "pacman",
      season: 9999,
      rank: 10,
    });
    expect(longest.length).toBeLessThanOrEqual(34);
  });
});

describe("parsePayoutMemo", () => {
  it("roundtrips a formatted memo", () => {
    const memo = formatPayoutMemo({ gameId: "tetris", season: 7, rank: 2 });
    expect(parsePayoutMemo(memo)).toEqual({
      gameId: "tetris",
      season: 7,
      rank: 2,
    });
  });

  it("returns null for an unrelated memo", () => {
    expect(parsePayoutMemo("hello world")).toBeNull();
    expect(parsePayoutMemo("")).toBeNull();
    expect(parsePayoutMemo("xpa-foo-s1-r1")).toBeNull();
  });

  it("returns null for malformed numbers", () => {
    expect(parsePayoutMemo("xpa-snake-sX-r1")).toBeNull();
    expect(parsePayoutMemo("xpa-snake-s1-rZ")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `cd frontend && npx vitest run lib/payout-memo.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `payout-memo.ts`**

Create `frontend/lib/payout-memo.ts`:

```ts
import type { GameId } from "./game-registry";

const VALID_GAMES: readonly GameId[] = ["snake", "tetris", "pacman"] as const;

export type PayoutMemoFields = {
  gameId: GameId;
  season: number;
  rank: number;
};

export function formatPayoutMemo(fields: PayoutMemoFields): string {
  return `xpa-${fields.gameId}-s${fields.season}-r${fields.rank}`;
}

const MEMO_RE = /^xpa-(snake|tetris|pacman)-s(\d+)-r(\d+)$/;

export function parsePayoutMemo(memo: string): PayoutMemoFields | null {
  const m = MEMO_RE.exec(memo);
  if (!m) return null;
  const [, gameId, seasonStr, rankStr] = m;
  if (!VALID_GAMES.includes(gameId as GameId)) return null;
  const season = Number(seasonStr);
  const rank = Number(rankStr);
  if (!Number.isInteger(season) || !Number.isInteger(rank)) return null;
  return { gameId: gameId as GameId, season, rank };
}
```

- [ ] **Step 4: Run the test, confirm it passes**

Run: `cd frontend && npx vitest run lib/payout-memo.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/payout-memo.ts frontend/lib/payout-memo.test.ts
git commit -m "feat(payout): add structured memo helpers (xpa-{game}-s{season}-r{rank})"
```

---

## Task 2: Multi-game season helpers in `contract-calls.ts`

**Files:**
- Modify: `frontend/lib/contract-calls.ts`

Pattern to follow: existing `getTopTenForGame` / `mintScoreForGame` / `getMintsRemaining` already use `gameBase(gameId)`. Mirror that.

- [ ] **Step 1: Add `getCurrentSeasonForGame`**

Insert immediately after `getMintsRemaining` (around line 94):

```ts
export async function getCurrentSeasonForGame(gameId: GameId): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-current-season",
    functionArgs: [],
    senderAddress: GAMES[gameId].contractAddress,
  });
  return Number(unwrap(cvToValue(res)));
}
```

- [ ] **Step 2: Add `getPrizePoolBalanceForGame`**

Below the previous addition:

```ts
export async function getPrizePoolBalanceForGame(gameId: GameId): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-prize-pool-balance",
    functionArgs: [],
    senderAddress: GAMES[gameId].contractAddress,
  });
  return Number(unwrap(cvToValue(res)));
}
```

- [ ] **Step 3: Add `getSeasonPrizeForGame`**

Below the previous:

```ts
export async function getSeasonPrizeForGame(
  gameId: GameId,
  season: number,
): Promise<SeasonPrize> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-season-prize",
    functionArgs: [uintCV(season)],
    senderAddress: GAMES[gameId].contractAddress,
  });
  const v = unwrap<null | {
    total: string;
    "top-ten": Array<{ player: string; score: string }>;
  }>(cvToValue(res));
  if (!v) return null;
  return {
    total: Number(v.total),
    topTen: v["top-ten"].map((e) => ({
      player: String(e.player),
      score: Number(e.score),
    })),
  };
}
```

(Uses the existing `SeasonPrize` type defined later in the file — that type is fine to reference because TypeScript hoists type aliases. If lint complains, move the type alias above the new function.)

- [ ] **Step 4: Add `hasClaimedPrizeForGame`**

Below:

```ts
export async function hasClaimedPrizeForGame(
  gameId: GameId,
  player: string,
  season: number,
): Promise<boolean> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "has-claimed-prize",
    functionArgs: [principalCV(player), uintCV(season)],
    senderAddress: player,
  });
  return Boolean(cvToValue(res));
}
```

- [ ] **Step 5: Add `endSeasonForGame`**

Below:

```ts
export async function endSeasonForGame(gameId: GameId): Promise<string> {
  return new Promise((resolve, reject) => {
    openContractCall({
      ...gameBase(gameId),
      functionName: "end-season",
      functionArgs: [],
      onFinish: (data) => resolve(data.txId),
      onCancel: () => reject(new Error("cancelled")),
    });
  });
}
```

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean. (No existing test imports break; legacy snake-only helpers are untouched.)

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/contract-calls.ts
git commit -m "feat(contract-calls): add *ForGame season helpers for multi-game admin"
```

---

## Task 3: `SeasonAdminWindow` — game tabs + per-game state

**Files:**
- Modify: `frontend/components/windows/SeasonAdminWindow.tsx`

Goal of this task: introduce a `gameId` state with 3 tabs, but **continue reading via snake-only helpers** — verify the UI still renders correctly with the new state machine before changing the data source. Keeps the diff reviewable.

- [ ] **Step 1: Add `GameId` import + tab state**

At the top of `SeasonAdminWindow.tsx`, change the imports block to also pull `GAMES` and `GameId`:

```ts
import { GAMES, type GameId } from "@/lib/game-registry";
```

Inside the component, after the existing `useState` calls (around line 47), add:

```ts
const [gameId, setGameId] = useState<GameId>("snake");
```

- [ ] **Step 2: Render the tab bar**

Inside the returned `<Window>`, immediately after the opening `<div className="p-2 text-xs">`, before the `{error && ...}` line, insert:

```tsx
<div role="tablist" className="flex gap-1 mb-2">
  {(Object.keys(GAMES) as GameId[]).map((g) => (
    <button
      key={g}
      role="tab"
      aria-selected={gameId === g}
      onClick={() => setGameId(g)}
      style={{ fontWeight: gameId === g ? "bold" : "normal" }}
    >
      {GAMES[g].label ?? g}
    </button>
  ))}
</div>
```

If `GAMES[g].label` is not defined in `game-registry.ts`, fall back to just `{g}` — verify with: `grep -n "label" frontend/lib/game-registry.ts`. If absent, use `{g}` without the fallback expression.

- [ ] **Step 3: Reset per-game state on tab switch**

Add a `useEffect` after the existing data-load `useEffect` (around line 79):

```ts
useEffect(() => {
  // Clear stale per-game state when switching tabs; the next data load
  // (Task 4) will refill these.
  setCurrentSeason(null);
  setAccumulated(null);
  setSeasons([]);
  setError(null);
}, [gameId]);
```

- [ ] **Step 4: Type-check + dev smoke**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

Then: `npm run dev`, open Season Admin (as owner). Three tabs visible; clicking a non-snake tab clears the body (loading state) — data won't refill until Task 4. Snake tab still shows real data. This is the expected intermediate.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/windows/SeasonAdminWindow.tsx
git commit -m "feat(season-admin): add game tab switcher (UI only)"
```

---

## Task 4: `SeasonAdminWindow` — switch reads to multi-game helpers

**Files:**
- Modify: `frontend/components/windows/SeasonAdminWindow.tsx`

- [ ] **Step 1: Update the imports**

Replace the existing import block from `@/lib/contract-calls`:

```ts
import {
  getCurrentSeason,
  getPrizePoolBalance,
  getSeasonPrize,
  hasClaimedPrize,
  endSeason,
  transferStx,
  computePayoutUstx,
} from "@/lib/contract-calls";
```

with:

```ts
import {
  getCurrentSeasonForGame,
  getPrizePoolBalanceForGame,
  getSeasonPrizeForGame,
  hasClaimedPrizeForGame,
  endSeasonForGame,
  transferStx,
  computePayoutUstx,
} from "@/lib/contract-calls";
```

- [ ] **Step 2: Update `loadPastSeasons` to take `gameId`**

Replace the `loadPastSeasons` callback with:

```ts
const loadPastSeasons = useCallback(
  async (cs: number, g: GameId) => {
    const results: SeasonView[] = [];
    for (let s = 1; s < cs; s++) {
      const snap = await getSeasonPrizeForGame(g, s);
      if (!snap) continue;
      const sorted = [...snap.topTen].sort((a, b) => b.score - a.score);
      const rows: PayoutRow[] = await Promise.all(
        sorted.map(async (e, i) => ({
          player: e.player,
          rank: i + 1,
          score: e.score,
          payoutUstx: computePayoutUstx(snap.total, i + 1),
          claimed: await hasClaimedPrizeForGame(g, e.player, s).catch(() => false),
        })),
      );
      results.push({ season: s, total: snap.total, rows });
    }
    setSeasons(results);
  },
  [],
);
```

- [ ] **Step 3: Update the initial-load `useEffect` to depend on `gameId`**

Replace the existing `useEffect` that calls `Promise.all([getCurrentSeason(), getPrizePoolBalance()])` with:

```ts
useEffect(() => {
  if (!w) return;
  setError(null);
  Promise.all([
    getCurrentSeasonForGame(gameId),
    getPrizePoolBalanceForGame(gameId),
  ])
    .then(([cs, pool]) => {
      setCurrentSeason(cs);
      setAccumulated(pool);
      return loadPastSeasons(cs, gameId);
    })
    .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
}, [w, gameId, loadPastSeasons]);
```

Delete the temporary tab-reset `useEffect` from Task 3 step 3 — this combined effect handles both initial mount and tab switch.

- [ ] **Step 4: Update `handleEndSeason`**

Replace `handleEndSeason`'s body with:

```ts
async function handleEndSeason() {
  if (
    !confirm(
      `End the current ${gameId} season? This locks the snapshot and starts a new season.`,
    )
  )
    return;
  setBusyEnd(true);
  try {
    const txId = await endSeasonForGame(gameId);
    useToasts.getState().push({
      title: "End-season submitted",
      body: "Watching for confirmation…",
    });
    watchTx(txId, (s) => {
      if (s === "success") {
        useToasts.getState().push({
          title: "Season closed",
          body: "Snapshot locked. Reloading…",
        });
        getCurrentSeasonForGame(gameId).then((cs) => {
          setCurrentSeason(cs);
          loadPastSeasons(cs, gameId);
        });
        getPrizePoolBalanceForGame(gameId).then(setAccumulated);
      } else if (s !== "pending") {
        useToasts.getState().push({
          title: "End-season failed",
          body: "Transaction rejected.",
        });
      }
    });
  } catch (e) {
    setError(e instanceof Error ? e.message : "End season failed");
  } finally {
    setBusyEnd(false);
  }
}
```

- [ ] **Step 5: Type-check + dev smoke**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

Then `npm run dev`, open Season Admin, click each tab. Each tab should:
- Show its own current-season number + pool
- Show past seasons (if any) — Tetris/Pacman likely show "No past seasons yet"
- "End Season" button confirm dialog mentions the active game

- [ ] **Step 6: Commit**

```bash
git add frontend/components/windows/SeasonAdminWindow.tsx
git commit -m "feat(season-admin): route reads and end-season through per-game helpers"
```

---

## Task 5: Structured memo + watchTx on payout

**Files:**
- Modify: `frontend/components/windows/SeasonAdminWindow.tsx`

- [ ] **Step 1: Import `formatPayoutMemo` and `watchTx`**

Confirm `watchTx` is already imported (it is, from Task 3 baseline). Add the new import:

```ts
import { formatPayoutMemo } from "@/lib/payout-memo";
```

- [ ] **Step 2: Rewrite `handlePay`**

Replace the existing `handlePay`:

```ts
async function handlePay(row: PayoutRow, season: number) {
  const stxAmount = (row.payoutUstx / 1_000_000).toFixed(4);
  if (
    !confirm(
      `Send ${stxAmount} STX to ${row.player} for ${gameId} Season ${season} rank #${row.rank}?`,
    )
  )
    return;
  const key = `${season}-${row.player}`;
  setBusyPay(key);
  try {
    const memo = formatPayoutMemo({ gameId, season, rank: row.rank });
    const txId = await transferStx(row.player, row.payoutUstx, memo);
    useToasts.getState().push({
      title: "Payout submitted",
      body: `${stxAmount} STX → ${row.player.slice(0, 6)}… (watching…)`,
    });
    watchTx(txId, (s) => {
      if (s === "success") {
        useToasts.getState().push({
          title: "Payout confirmed",
          body: `${stxAmount} STX → ${row.player.slice(0, 6)}…`,
        });
      } else if (s !== "pending") {
        useToasts.getState().push({
          title: "Payout failed",
          body: `${stxAmount} STX → ${row.player.slice(0, 6)}… rejected.`,
        });
      }
    });
  } catch (e) {
    setError(e instanceof Error ? e.message : "Transfer failed");
  } finally {
    setBusyPay(null);
  }
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Dev smoke (manual)**

Run: `cd frontend && npm run dev`. Open Season Admin as owner. Pick a past-season row (snake season 1 if any exist) and click "Send STX". Wallet popup memo field should read `xpa-snake-s1-r{rank}`. Cancel the popup — UI returns to ready, no error toast (cancel is treated as expected).

If no past season exists yet, this step is verified visually in the wallet memo preview and can be deferred to production smoke.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/windows/SeasonAdminWindow.tsx
git commit -m "feat(season-admin): tag payouts with structured memo + track confirmation"
```

---

## Self-review

- **Spec coverage:**
  - Multi-game admin (#1 in recommendation): Tasks 2 + 3 + 4 ✓
  - Structured memo (#2): Tasks 1 + 5 ✓
  - watchTx on payout (#2): Task 5 ✓
- **Placeholder scan:** No TBDs. Step 2 of Task 3 has a conditional ("If `GAMES[g].label` is not defined") with an explicit verification command and fallback — acceptable because the registry shape is observable from the repo, not invented.
- **Type consistency:** `GameId` imported in both new helpers (Task 2) and the window (Task 3). `SeasonPrize` reused — single source of truth. `formatPayoutMemo` always called with the current `gameId` state, never a string literal — so memos cannot drift from the tab.
- **Backwards compatibility:** Legacy snake-only helpers (`getCurrentSeason`, etc.) are not removed. Other windows that still import them keep working. A follow-up cleanup task can delete them once all callers migrate.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-21-season-admin-multi-game.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
