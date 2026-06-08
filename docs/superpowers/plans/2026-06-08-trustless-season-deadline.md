# Trustless Season Deadline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn on the dormant on-chain trustless season deadline in `xp-arcade-v4` and surface it honestly in the frontend — a countdown derived from the on-chain `season-end-block` plus a permissionless "End Season" trigger that any wallet can fire once the block is reached.

**Architecture:** No Clarity change (the contract already supports this; it is just dormant because no `season-end-block` is set). Frontend reads the on-chain deadline of the canonical game (Snake, on-chain id 1) and the live chain tip, derives the countdown ETA from the measured stacks-block cadence (~7.9 s/block), and exposes a permissionless trigger in the High Scores window. An owner runs a Clarinet plan to set the shared deadline block for all games.

**Tech Stack:** Next.js (client components), React hooks, TypeScript, `@stacks/transactions` (`fetchCallReadOnlyFunction`), `@stacks/connect` (`openContractCall`), Vitest, Clarinet deployment plan (YAML).

**Spec:** `docs/superpowers/specs/2026-06-08-trustless-season-deadline-design.md`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `frontend/lib/season-blocks.ts` | Pure block↔time math (`AVG_STACKS_BLOCK_SECONDS`, `blocksToEta`) | Create |
| `frontend/lib/season-blocks.test.ts` | Unit tests for the math | Create |
| `frontend/lib/stacks-api.ts` | `getCurrentStacksBlockHeight()` (Hiro tip fetch; no `@stacks/connect` import) | Create |
| `frontend/lib/stacks-api.test.ts` | Unit test mocking `fetch` | Create |
| `frontend/lib/contract-calls.ts` | Add `getSeasonEndBlockForGame()` read-only helper | Modify |
| `frontend/lib/season-countdown.ts` | On-chain-driven countdown: `deriveCountdown` (pure) + async `useSeasonCountdown` hook + `formatCountdown` | Rewrite |
| `frontend/lib/season-countdown.test.ts` | Unit tests for `deriveCountdown` state machine | Create |
| `frontend/components/desktop/DesktopLeaderboardShowcase.tsx` | Handle renamed countdown states | Modify |
| `frontend/components/windows/SeasonAdminWindow.tsx` | Handle renamed countdown states | Modify |
| `frontend/components/windows/HighScoreWindow.tsx` | Renamed states + permissionless "End Season" button per tab | Modify |
| `contract/tests/xp-arcade-v4.test.ts` | VERIFY existing permissionless coverage (no edit expected) | Read-only |
| `contract/deployments/xp-arcade-v4-set-season-end-block.mainnet-plan.yaml` | Owner sets shared deadline block ×4 | Create (at execution time) |
| `HANDOFF.md` | Runbook: first-time set, new game, new season | Modify |

---

## Task 1: Pure block↔time math

**Files:**
- Create: `frontend/lib/season-blocks.ts`
- Test: `frontend/lib/season-blocks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/season-blocks.test.ts
import { describe, expect, it } from "vitest";
import { AVG_STACKS_BLOCK_SECONDS, blocksToEta } from "./season-blocks";

describe("blocksToEta", () => {
  const now = new Date("2026-06-08T00:00:00Z");

  it("projects remaining blocks at the average cadence", () => {
    const eta = blocksToEta(1000, 900, now);
    expect(eta.getTime()).toBe(
      now.getTime() + 100 * AVG_STACKS_BLOCK_SECONDS * 1000,
    );
  });

  it("clamps to now when the target block is already reached", () => {
    expect(blocksToEta(900, 1000, now).getTime()).toBe(now.getTime());
    expect(blocksToEta(900, 900, now).getTime()).toBe(now.getTime());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/season-blocks.test.ts`
Expected: FAIL — cannot resolve `./season-blocks`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/lib/season-blocks.ts
// Measured mainnet cadence (2026-06-08): ~10,944 stacks blocks/day ≈ 7.9 s/block.
// Single source of truth for converting a stacks-block-height delta into wall time.
export const AVG_STACKS_BLOCK_SECONDS = 7.9;

/** Estimated wall-clock time at which `targetBlock` is reached, given `currentBlock`. */
export function blocksToEta(
  targetBlock: number,
  currentBlock: number,
  now: Date = new Date(),
): Date {
  const remainingBlocks = Math.max(0, targetBlock - currentBlock);
  return new Date(now.getTime() + remainingBlocks * AVG_STACKS_BLOCK_SECONDS * 1000);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/season-blocks.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/season-blocks.ts frontend/lib/season-blocks.test.ts
git commit -m "feat(season): add block-to-eta math helper"
```

---

## Task 2: Chain reads (tip + on-chain deadline)

**Files:**
- Create: `frontend/lib/stacks-api.ts`
- Test: `frontend/lib/stacks-api.test.ts`
- Modify: `frontend/lib/contract-calls.ts` (add `getSeasonEndBlockForGame`)

`getCurrentStacksBlockHeight` lives in its own module (no `@stacks/connect` import) so it is trivially testable by mocking `fetch`. `getSeasonEndBlockForGame` sits with its read-only siblings in `contract-calls.ts` and mirrors `getCurrentSeasonForGame` exactly.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/stacks-api.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentStacksBlockHeight } from "./stacks-api";

afterEach(() => vi.restoreAllMocks());

describe("getCurrentStacksBlockHeight", () => {
  it("returns the height of the latest block from the Hiro tip", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ results: [{ height: 8222219 }] }),
      })),
    );
    expect(await getCurrentStacksBlockHeight()).toBe(8222219);
  });

  it("throws when the tip request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));
    await expect(getCurrentStacksBlockHeight()).rejects.toThrow("503");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/stacks-api.test.ts`
Expected: FAIL — cannot resolve `./stacks-api`.

- [ ] **Step 3: Write `stacks-api.ts`**

```ts
// frontend/lib/stacks-api.ts
import { stacks } from "./stacks";

const HIRO_BASE =
  stacks.networkName === "mainnet"
    ? "https://api.hiro.so"
    : "https://api.testnet.hiro.so";

/** Current stacks-block-height from the Hiro chain tip. */
export async function getCurrentStacksBlockHeight(): Promise<number> {
  const res = await fetch(`${HIRO_BASE}/extended/v2/blocks?limit=1`);
  if (!res.ok) throw new Error(`tip fetch failed: ${res.status}`);
  const json = (await res.json()) as { results: Array<{ height: number }> };
  return Number(json.results[0].height);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/stacks-api.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add `getSeasonEndBlockForGame` to `contract-calls.ts`**

Insert directly after `getCurrentSeasonForGame` (currently ends at line 92). The contract's `get-season-end-block` returns a plain `uint` (default `u0`), so unwrap exactly like `get-current-season`:

```ts
export async function getSeasonEndBlockForGame(gameId: GameId): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-season-end-block",
    functionArgs: [uintCV(onchainIdFor(gameId))],
    senderAddress: GAMES[gameId].contractAddress,
  });
  return Number(unwrap(cvToValue(res)));
}
```

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/stacks-api.ts frontend/lib/stacks-api.test.ts frontend/lib/contract-calls.ts
git commit -m "feat(season): read chain tip and on-chain season-end-block"
```

---

## Task 3: Rewrite `season-countdown.ts` to the on-chain source

**Files:**
- Rewrite: `frontend/lib/season-countdown.ts`
- Test: `frontend/lib/season-countdown.test.ts`

`deriveCountdown` is the pure state machine (fully unit-tested). The hook resolves the source asynchronously (canonical game deadline + tip), refetches every 30 s, falls back to `NEXT_PUBLIC_SEASON_END_ISO` when no on-chain block is set, and ticks the display every second.

State semantics:
- `loading` — chain read in flight (no `endsAt`).
- `unset` — no on-chain block AND no ISO fallback (no `endsAt`).
- `live` — counting down (block- or ISO-sourced).
- `iso-expired` — ISO fallback elapsed, no on-chain block → "awaiting owner" (NOT permissionless).
- `reached` — on-chain block reached → **permissionless trigger available**.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/season-countdown.test.ts
import { describe, expect, it } from "vitest";
import { deriveCountdown } from "./season-countdown";

const now = Date.parse("2026-06-08T00:00:00Z");

describe("deriveCountdown", () => {
  it("loading source -> loading", () => {
    expect(deriveCountdown({ kind: "loading" }, now).state).toBe("loading");
  });

  it("none source -> unset", () => {
    expect(deriveCountdown({ kind: "none" }, now).state).toBe("unset");
  });

  it("reached block -> reached", () => {
    const c = deriveCountdown(
      { kind: "block", reached: true, endsAt: new Date(now) },
      now,
    );
    expect(c.state).toBe("reached");
  });

  it("future block -> live with remaining time", () => {
    const c = deriveCountdown(
      { kind: "block", reached: false, endsAt: new Date(now + 3_600_000) },
      now,
    );
    expect(c.state).toBe("live");
    if (c.state === "live") expect(c.hours).toBe(1);
  });

  it("past ISO -> iso-expired (not permissionless)", () => {
    const c = deriveCountdown(
      { kind: "iso", endsAt: new Date(now - 1000) },
      now,
    );
    expect(c.state).toBe("iso-expired");
  });

  it("future ISO -> live", () => {
    const c = deriveCountdown(
      { kind: "iso", endsAt: new Date(now + 86_400_000) },
      now,
    );
    expect(c.state).toBe("live");
    if (c.state === "live") expect(c.days).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/season-countdown.test.ts`
Expected: FAIL — `deriveCountdown` not exported.

- [ ] **Step 3: Rewrite `season-countdown.ts`**

```ts
"use client";
import { useEffect, useState } from "react";
import { blocksToEta } from "./season-blocks";
import { getSeasonEndBlockForGame } from "./contract-calls";
import { getCurrentStacksBlockHeight } from "./stacks-api";
import { GAMES, onchainIdFor, type GameId } from "./game-registry";

export type Countdown =
  | { state: "loading" }
  | { state: "unset" }
  | { state: "iso-expired"; endsAt: Date }
  | { state: "reached"; endsAt: Date }
  | {
      state: "live";
      endsAt: Date;
      days: number;
      hours: number;
      minutes: number;
      seconds: number;
    };

export type CountdownSource =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "iso"; endsAt: Date }
  | { kind: "block"; reached: boolean; endsAt: Date };

/** Pure state machine: resolved source + current epoch ms -> Countdown. */
export function deriveCountdown(source: CountdownSource, now: number): Countdown {
  if (source.kind === "loading") return { state: "loading" };
  if (source.kind === "none") return { state: "unset" };
  if (source.kind === "block" && source.reached) {
    return { state: "reached", endsAt: source.endsAt };
  }

  const { endsAt } = source;
  const diffMs = endsAt.getTime() - now;
  if (diffMs <= 0) {
    // ISO fallback elapsed -> awaiting owner. A block ETA that elapsed but is
    // not yet confirmed reached on-chain stays "live" at zero until the next
    // chain refetch flips it to "reached".
    if (source.kind === "iso") return { state: "iso-expired", endsAt };
    return { state: "live", endsAt, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const totalSec = Math.floor(diffMs / 1000);
  return {
    state: "live",
    endsAt,
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  };
}

function parseIso(): Date | null {
  const iso = process.env.NEXT_PUBLIC_SEASON_END_ISO;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

// Canonical deadline source: the game with on-chain id 1 (Snake), always
// registered. The deadline is shared across all games (see spec).
const CANONICAL_GAME: GameId = (Object.keys(GAMES) as GameId[]).find(
  (g) => onchainIdFor(g) === 1,
)!;

export function useSeasonCountdown(): Countdown {
  const [source, setSource] = useState<CountdownSource>({ kind: "loading" });
  const [now, setNow] = useState(() => Date.now());

  // Resolve the on-chain deadline (canonical game) + tip; refetch every 30s.
  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      try {
        const [endBlock, currentBlock] = await Promise.all([
          getSeasonEndBlockForGame(CANONICAL_GAME),
          getCurrentStacksBlockHeight(),
        ]);
        if (cancelled) return;
        if (endBlock > 0) {
          setSource({
            kind: "block",
            reached: currentBlock >= endBlock,
            endsAt: blocksToEta(endBlock, currentBlock),
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
  }, []);

  // Tick the display every second.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return deriveCountdown(source, now);
}

export function formatCountdown(c: Countdown): string {
  if (c.state === "loading" || c.state === "unset") return "";
  if (c.state === "iso-expired") return "Season ended — awaiting owner end-season";
  if (c.state === "reached") return "Deadline reached — anyone can close the season";
  const pad = (n: number) => String(n).padStart(2, "0");
  if (c.days > 0) return `${c.days}d ${pad(c.hours)}h ${pad(c.minutes)}m`;
  return `${pad(c.hours)}:${pad(c.minutes)}:${pad(c.seconds)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/season-countdown.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/season-countdown.ts frontend/lib/season-countdown.test.ts
git commit -m "feat(season): derive countdown from on-chain deadline block"
```

---

## Task 4: Update existing countdown consumers for the new states

The old type had `unset | expired | live`. The new type adds `loading`, `reached`, and renames `expired`→`iso-expired`. Consumers must (a) not read `endsAt` on `loading`/`unset`, and (b) treat `iso-expired` and `reached` as the "red" states. No new behavior — just keep them compiling and visually consistent. (The permissionless button is Task 5.)

**Files:**
- Modify: `frontend/components/desktop/DesktopLeaderboardShowcase.tsx:155-169`
- Modify: `frontend/components/windows/SeasonAdminWindow.tsx:195-202`
- Modify: `frontend/components/windows/HighScoreWindow.tsx:325-336`

- [ ] **Step 1: Update `DesktopLeaderboardShowcase.tsx`**

Replace lines 155-169 (the countdown `<div>`) with:

```tsx
          <div
            style={{
              border: "2px inset #dfdfdf",
              background: "#ffffff",
              padding: 6,
              fontFamily: "monospace",
              fontSize: 12,
              color:
                countdown.state === "iso-expired" || countdown.state === "reached"
                  ? "#cc0000"
                  : "#000080",
              textAlign: "center",
            }}
          >
            {countdown.state === "loading"
              ? "Loading deadline…"
              : countdown.state === "unset"
                ? "No display deadline set"
                : countdown.state === "reached"
                  ? formatCountdown(countdown)
                  : `Soft deadline ${formatCountdown(countdown)}`}
          </div>
```

- [ ] **Step 2: Update `SeasonAdminWindow.tsx`**

Replace lines 195-202 with (guard now excludes `loading` so `endsAt` is safe):

```tsx
          {countdown.state !== "unset" && countdown.state !== "loading" && (
            <p
              className="text-[10px] px-1 mt-1"
              style={{
                color:
                  countdown.state === "iso-expired" || countdown.state === "reached"
                    ? "#cc0000"
                    : "#000080",
              }}
            >
              ⏳ Deadline: <b>{formatCountdown(countdown)}</b>
              {" · ~"}
              {countdown.endsAt.toLocaleString()}
              {countdown.state === "iso-expired" &&
                " — call End Season now to honour it."}
              {countdown.state === "reached" &&
                " — anyone can call End Season now."}
            </p>
          )}
```

- [ ] **Step 3: Update `HighScoreWindow.tsx` countdown badge**

Replace lines 325-336 with (guard excludes `loading`):

```tsx
          {countdown.state !== "unset" && countdown.state !== "loading" && (
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 11,
                color:
                  countdown.state === "iso-expired" || countdown.state === "reached"
                    ? "#cc0000"
                    : "#000080",
              }}
              title={`~${countdown.endsAt.toLocaleString()}`}
            >
              ⏳ {formatCountdown(countdown)}
            </span>
          )}
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0 (no "Property 'endsAt' does not exist" errors).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/desktop/DesktopLeaderboardShowcase.tsx frontend/components/windows/SeasonAdminWindow.tsx frontend/components/windows/HighScoreWindow.tsx
git commit -m "refactor(season): handle loading/reached/iso-expired countdown states"
```

---

## Task 5: Permissionless "End Season" button in High Scores

Add a per-tab button in `HighScoreWindow`'s `LeaderboardTab` shown only when `countdown.state === "reached"`. Any connected wallet may fire it. `end-season` moves no tokens → no post-condition. Mirror the toast + `watchTx` pattern already used in `SeasonAdminWindow.handleEndSeason`. On success, bump a `reloadKey` to force the tab's data effect to refetch.

**Files:**
- Modify: `frontend/components/windows/HighScoreWindow.tsx`

- [ ] **Step 1: Add imports**

In the import block at the top of `HighScoreWindow.tsx`, add `endSeasonForGame` to the existing `@/lib/contract-calls` import, and add these two imports near the other lib imports:

```tsx
import { watchTx } from "@/lib/tx-tracker";
import { useToasts } from "@/state/toasts";
```

> Verify the exact module paths against `SeasonAdminWindow.tsx`'s imports (it already imports `watchTx` and `useToasts`); copy those specifiers verbatim.

- [ ] **Step 2: Add reload key + busy state inside `LeaderboardTab`**

Immediately after `const [loadState, setLoadState] = useState<LeaderboardLoadState | null>(null);` (line 77), add:

```tsx
  const [reloadKey, setReloadKey] = useState(0);
  const [busyEnd, setBusyEnd] = useState(false);
```

- [ ] **Step 3: Make the data effect depend on `reloadKey`**

Change the data effect's dependency array (currently `}, [isActive, gameId, address]);` at line 129) to:

```tsx
  }, [isActive, gameId, address, reloadKey]);
```

- [ ] **Step 4: Add the trigger handler inside `LeaderboardTab`**

Add this function after the data effect (before the `const activeState = ...` line at 131):

```tsx
  async function handlePermissionlessEnd() {
    if (
      !confirm(
        `The on-chain deadline for ${GAMES[gameId].label} has passed.\n\n` +
          "End this season now? This locks the top-10 snapshot and opens prize claims. " +
          "Anyone may do this — no owner needed.",
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
            body: "Snapshot locked. Refreshing…",
          });
          setReloadKey((k) => k + 1);
        } else if (s !== "pending") {
          useToasts.getState().push({
            title: "End-season failed",
            body: "Transaction rejected.",
          });
        }
      });
    } catch (e) {
      useToasts.getState().push({
        title: "End-season failed",
        body: e instanceof Error ? e.message : "Could not submit.",
      });
    } finally {
      setBusyEnd(false);
    }
  }
```

- [ ] **Step 5: Render the button**

Immediately after the stats row's closing `</div>` at line 337 (the `</div>` that closes the row containing the countdown badge), insert:

```tsx
      {countdown.state === "reached" && (
        <div className="mb-2 px-1">
          <button
            type="button"
            disabled={!address || busyEnd}
            onClick={handlePermissionlessEnd}
            title={
              !address
                ? "Connect a wallet to end the season"
                : "The deadline block has passed — anyone can close this season"
            }
          >
            {busyEnd ? "Ending…" : "End Season (deadline reached)"}
          </button>
          <p className="text-[10px] text-gray-600 mt-1">
            The on-chain deadline has passed. Any wallet can close this season to
            unlock prize claims.
          </p>
        </div>
      )}
```

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Run the full frontend test suite (no regressions)**

Run: `cd frontend && npm test`
Expected: all suites PASS (existing 143 + new season tests).

- [ ] **Step 8: Commit**

```bash
git add frontend/components/windows/HighScoreWindow.tsx
git commit -m "feat(season): permissionless End Season trigger in High Scores"
```

---

## Task 6: Verify contract coverage (no code change)

The permissionless branch is already implemented and tested in `xp-arcade-v4`. Confirm — do **not** edit the contract.

- [ ] **Step 1: Confirm the tests exist**

Run: `cd contract && grep -n "allows anyone after the deadline block\|rejects a non-owner before the deadline block" tests/xp-arcade-v4.test.ts`
Expected: matches at the `end-season` describe block (≈ lines 329 and 336).

- [ ] **Step 2: Run the contract suite + check**

Run: `cd contract && npm test && clarinet check`
Expected: all tests PASS (139), `clarinet check` exit 0.

> If (and only if) Step 1 returns nothing, add a `describe("end-season")` test pair: (a) `set-season-end-block` to a high block, non-owner `end-season` → `toBeErr(Cl.uint(113))`; (b) `set-season-end-block` to block 2, `simnet.mineEmptyBlocks(5)`, non-owner `end-season` → `toBeOk(Cl.bool(true))`. Style: see existing tests in this file (`const C = "xp-arcade-v4"`, `w(1)` for wallets).

---

## Task 7: Owner deployment plan + runbook

**Files:**
- Create: `contract/deployments/xp-arcade-v4-set-season-end-block.mainnet-plan.yaml`
- Modify: `HANDOFF.md`

- [ ] **Step 1: Compute the target block from the LIVE tip (do not hardcode)**

Run: `curl -s "https://api.hiro.so/extended/v2/blocks?limit=1" | python3 -c "import sys,json; print(json.load(sys.stdin)['results'][0]['height'])"`

Then compute the target for `2026-06-30T23:59:59Z` at ~10,944 blocks/day:
`target = current_tip + round(days_until_2026-06-30T23:59Z * 10944)`.
Record the chosen `target` integer for the next step.

- [ ] **Step 2: Write the deployment plan**

Create `contract/deployments/xp-arcade-v4-set-season-end-block.mainnet-plan.yaml`, substituting `<TARGET>` with the integer from Step 1 (same value for all four games):

```yaml
id: 0
name: XP Arcade v4 set season-end-block (mainnet)
network: mainnet
stacks-node: https://api.hiro.so
bitcoin-node: http://blockstack:blockstacksystem@bitcoin.blockstack.com:8332
plan:
  batches:
  - id: 0
    transactions:
    - transaction-type: contract-call
      contract-id: SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4
      expected-sender: SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV
      method: set-season-end-block
      parameters:
      - u1
      - u<TARGET>
      cost: 10000
    - transaction-type: contract-call
      contract-id: SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4
      expected-sender: SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV
      method: set-season-end-block
      parameters:
      - u2
      - u<TARGET>
      cost: 10000
    - transaction-type: contract-call
      contract-id: SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4
      expected-sender: SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV
      method: set-season-end-block
      parameters:
      - u3
      - u<TARGET>
      cost: 10000
    - transaction-type: contract-call
      contract-id: SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4
      expected-sender: SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV
      method: set-season-end-block
      parameters:
      - u4
      - u<TARGET>
      cost: 10000
    epoch: '3.3'
```

- [ ] **Step 3: Add the runbook to `HANDOFF.md`**

Under the "Known limitations / quirks" section, append a new entry:

```markdown
9. **Trustless season deadline (operational).** `end-season` is permissionless
   once `set-season-end-block(game-id, H)` is set and `stacks-block-height >= H`.
   `set-season-end-block` is owner-only; the deadline block is **shared across all
   games** (same `H`). `end-season` does NOT reset `season-end-block`, so:
   - **First time / current season:** owner runs
     `contract/deployments/xp-arcade-v4-set-season-end-block.mainnet-plan.yaml`
     with the deployer wallet (`-p <plan> -d --no-dashboard`, never `-c`).
   - **New game registered:** also call `set-season-end-block` for it with the
     same `H`, else that game has no trustless fallback.
   - **Rolling to a new season:** set the NEW future `H` for all games *before*
     calling `end-season` — otherwise the freshly-opened season inherits the old
     (now-past) block and anyone can close it immediately ("stillborn season").
   - Frontend countdown is derived from the on-chain block (`lib/season-countdown.ts`);
     it falls back to `NEXT_PUBLIC_SEASON_END_ISO` only while `H` is unset.
```

- [ ] **Step 4: Commit (the plan is executed manually by the owner, not in this task)**

```bash
git add contract/deployments/xp-arcade-v4-set-season-end-block.mainnet-plan.yaml HANDOFF.md
git commit -m "chore(season): add set-season-end-block plan and runbook"
```

> **Out of band (owner only):** apply the plan from `contract/`:
> `clarinet deployments apply -p deployments/xp-arcade-v4-set-season-end-block.mainnet-plan.yaml --no-dashboard`
> Then verify on-chain: `get-season-end-block(u1)` returns `<TARGET>`. The MCP
> `aibtc` wallet is NOT the owner and cannot do this (HANDOFF quirk #7).

---

## Task 8: Final verification gate

- [ ] **Step 1: Frontend CI**

Run: `cd frontend && npm run ci`
Expected: test + typecheck + lint all green. Read the output.

- [ ] **Step 2: Contract CI**

Run: `cd contract && npm test && clarinet check`
Expected: 139 tests PASS, `clarinet check` exit 0.

- [ ] **Step 3: Confirm clean tree**

Run: `git status -sb`
Expected: no uncommitted changes from this plan (the owner-applied mainnet txs are out of band).

---

## Self-Review notes (author)

- **Spec coverage:** §1 ops → Task 7; §1a rolling → Task 7 runbook; §2 block-math/reads → Tasks 1–2; §3 countdown rework → Task 3 + Task 4 consumers; §4 permissionless button → Task 5; §5 tests → Tasks 1/2/3 unit tests + Task 6 contract verify + Task 8 gate. All covered.
- **Type consistency:** `Countdown`/`CountdownSource`/`deriveCountdown`/`blocksToEta`/`getSeasonEndBlockForGame`/`getCurrentStacksBlockHeight` names are used identically across tasks. Consumers guard `loading`+`unset` before reading `endsAt`.
- **No placeholders:** the only intentional substitution is `<TARGET>` in Task 7, which must be computed from the live tip at execution time (documented in Step 1) — it cannot be fixed in advance because the tip moves.
