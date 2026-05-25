# Payout Ledger Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Persist owner's payout submissions so refresh doesn't lose state, and Season Admin shows per-row payout status (none / pending / paid / failed) instead of always showing "Send STX".

**Architecture:** New Zustand store `state/payout-ledger.ts` with `zustand/middleware` `persist` to localStorage. Key shape `${gameId}-${season}-${player}` → `{ txId, status, submittedAt }`. `SeasonAdminWindow.handlePay` writes to the ledger on submit and updates status from the existing `watchTx` callback. Row render reads from the ledger.

**Tech Stack:** Zustand 5 + persist middleware, Vitest 3, Next.js 16, TypeScript 5.

**Out of scope:** Server-side ledger, cross-device sync, recovery from chain history (a future task can reconstruct missing entries by parsing tx memos via `parsePayoutMemo`).

---

## File Map

| File | Action |
|---|---|
| `frontend/state/payout-ledger.ts` | Create — store with persist |
| `frontend/state/payout-ledger.test.ts` | Create — set/get/update + persisted shape |
| `frontend/components/windows/SeasonAdminWindow.tsx` | Modify — wire `handlePay` to ledger; render row by status |

---

## Task 1: `payout-ledger` store + tests

**Files:**
- Create: `frontend/state/payout-ledger.ts`
- Create: `frontend/state/payout-ledger.test.ts`

### Step 1: Write failing tests

Create `frontend/state/payout-ledger.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { usePayoutLedger, payoutKey, type PayoutStatus } from "./payout-ledger";

beforeEach(() => {
  usePayoutLedger.setState({ entries: {} });
  localStorage.clear();
});

describe("payoutKey", () => {
  it("composes a stable key", () => {
    expect(payoutKey("snake", 2, "SP123")).toBe("snake-2-SP123");
  });
});

describe("usePayoutLedger", () => {
  it("starts empty", () => {
    expect(usePayoutLedger.getState().entries).toEqual({});
  });

  it("submit() records pending entry", () => {
    usePayoutLedger.getState().submit("snake", 1, "SP_A", "0xtx1");
    const entry = usePayoutLedger.getState().get("snake", 1, "SP_A");
    expect(entry?.txId).toBe("0xtx1");
    expect(entry?.status).toBe("pending" as PayoutStatus);
    expect(entry?.submittedAt).toBeGreaterThan(0);
  });

  it("updateStatus() promotes to success / failed", () => {
    usePayoutLedger.getState().submit("snake", 1, "SP_A", "0xtx1");
    usePayoutLedger.getState().updateStatus("snake", 1, "SP_A", "success");
    expect(usePayoutLedger.getState().get("snake", 1, "SP_A")?.status).toBe(
      "success",
    );
  });

  it("updateStatus() is a no-op for unknown key", () => {
    usePayoutLedger.getState().updateStatus("snake", 1, "SP_X", "success");
    expect(usePayoutLedger.getState().get("snake", 1, "SP_X")).toBeUndefined();
  });

  it("submit() overwrites a previous entry for the same key", () => {
    usePayoutLedger.getState().submit("snake", 1, "SP_A", "0xtx1");
    usePayoutLedger.getState().updateStatus("snake", 1, "SP_A", "failed");
    usePayoutLedger.getState().submit("snake", 1, "SP_A", "0xtx2");
    const entry = usePayoutLedger.getState().get("snake", 1, "SP_A");
    expect(entry?.txId).toBe("0xtx2");
    expect(entry?.status).toBe("pending");
  });
});
```

### Step 2: Run, confirm fail

`cd frontend && npx vitest run state/payout-ledger.test.ts` → FAIL (module not found).

### Step 3: Implement store

Create `frontend/state/payout-ledger.ts`:

```ts
"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { GameId } from "@/lib/game-registry";

export type PayoutStatus = "pending" | "success" | "failed";

export type PayoutEntry = {
  txId: string;
  status: PayoutStatus;
  submittedAt: number;
};

export function payoutKey(gameId: GameId, season: number, player: string): string {
  return `${gameId}-${season}-${player}`;
}

type State = {
  entries: Record<string, PayoutEntry>;
  submit: (gameId: GameId, season: number, player: string, txId: string) => void;
  updateStatus: (
    gameId: GameId,
    season: number,
    player: string,
    status: PayoutStatus,
  ) => void;
  get: (gameId: GameId, season: number, player: string) => PayoutEntry | undefined;
};

export const usePayoutLedger = create<State>()(
  persist(
    (set, getState) => ({
      entries: {},
      submit: (gameId, season, player, txId) => {
        const key = payoutKey(gameId, season, player);
        set((s) => ({
          entries: {
            ...s.entries,
            [key]: { txId, status: "pending", submittedAt: Date.now() },
          },
        }));
      },
      updateStatus: (gameId, season, player, status) => {
        const key = payoutKey(gameId, season, player);
        set((s) => {
          const existing = s.entries[key];
          if (!existing) return s;
          return { entries: { ...s.entries, [key]: { ...existing, status } } };
        });
      },
      get: (gameId, season, player) =>
        getState().entries[payoutKey(gameId, season, player)],
    }),
    {
      name: "xp-arcade-payout-ledger",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
```

### Step 4: Run, confirm pass

`npx vitest run state/payout-ledger.test.ts` → 5 passing.

### Step 5: Type-check

`npx tsc --noEmit` → clean.

### Step 6: Commit

```
git add frontend/state/payout-ledger.ts frontend/state/payout-ledger.test.ts
git commit -m "feat(payout-ledger): add persisted Zustand store for owner payout tracking"
```

---

## Task 2: Wire `handlePay` to ledger + render row by status

**Files:**
- Modify: `frontend/components/windows/SeasonAdminWindow.tsx`

### Step 1: Import the store

Add to imports:

```ts
import { usePayoutLedger, type PayoutEntry } from "@/state/payout-ledger";
```

### Step 2: Read ledger from component

Inside the component body, after the existing useState calls:

```ts
const ledgerEntries = usePayoutLedger((s) => s.entries);
```

### Step 3: Update `handlePay` to write to ledger

In `handlePay`, after `transferStx` resolves with `txId` and before the `useToasts.getState().push({ title: "Payout submitted", ... })` line, insert:

```ts
usePayoutLedger.getState().submit(gameId, season, row.player, txId);
```

Inside the `watchTx` callback:

- Replace the `"success"` branch's existing toast logic with:
  ```ts
  if (s === "success") {
    usePayoutLedger.getState().updateStatus(gameId, season, row.player, "success");
    useToasts.getState().push({
      title: "Payout confirmed",
      body: `${stxAmount} STX → ${row.player.slice(0, 6)}…`,
    });
  }
  ```
- Replace the failure branch with:
  ```ts
  } else if (s !== "pending") {
    usePayoutLedger.getState().updateStatus(gameId, season, row.player, "failed");
    useToasts.getState().push({
      title: "Payout failed",
      body: `${stxAmount} STX → ${row.player.slice(0, 6)}… rejected.`,
    });
  }
  ```

### Step 4: Render row based on ledger entry

Locate the row JSX inside `s.rows.map(...)`. The current `<td>` containing the "Send STX" button looks like:

```tsx
<td>
  <button
    onClick={() => handlePay(r, s.season)}
    disabled={busyPay === key}
  >
    {busyPay === key ? "…" : "Send STX"}
  </button>
</td>
```

Replace it with the helper component below. First add this helper (above the component or inside it as a local function — whichever fits the file style; the file uses module-scoped helpers like `isOwnerAddress`, so define `renderPayoutCell` at module scope after `isOwnerAddress`):

```tsx
const EXPLORER = "https://explorer.hiro.so/txid";

function renderPayoutCell(args: {
  entry: PayoutEntry | undefined;
  busy: boolean;
  onSend: () => void;
}) {
  const { entry, busy, onSend } = args;
  if (!entry) {
    return (
      <button onClick={onSend} disabled={busy}>
        {busy ? "…" : "Send STX"}
      </button>
    );
  }
  if (entry.status === "pending") {
    return (
      <a href={`${EXPLORER}/${entry.txId}`} target="_blank" rel="noreferrer">
        ⏳ Pending
      </a>
    );
  }
  if (entry.status === "success") {
    return (
      <a href={`${EXPLORER}/${entry.txId}`} target="_blank" rel="noreferrer">
        ✓ Paid
      </a>
    );
  }
  // failed
  return (
    <span>
      <button onClick={onSend} disabled={busy}>
        {busy ? "…" : "Retry"}
      </button>{" "}
      <a href={`${EXPLORER}/${entry.txId}`} target="_blank" rel="noreferrer" title="failed tx">
        ✗
      </a>
    </span>
  );
}
```

Then in the row JSX replace the button cell with:

```tsx
<td>
  {renderPayoutCell({
    entry: ledgerEntries[`${gameId}-${s.season}-${r.player}`],
    busy: busyPay === key,
    onSend: () => handlePay(r, s.season),
  })}
</td>
```

Note the key uses the same composition as `payoutKey()` from `payout-ledger.ts`. Importing `payoutKey` would be cleaner but the inline template literal is fine here — they reference the same convention.

### Step 5: Type-check + tests

```
npx tsc --noEmit
npx vitest run
```

Both must be clean.

### Step 6: Dev smoke (manual)

`npm run dev` → open Season Admin as owner → click "Send STX" on a past-season row → wallet popup → approve. After approve:

- Row immediately shows "⏳ Pending" with link to explorer
- Toast "Payout submitted"
- A few minutes later when tx confirms: row shows "✓ Paid"
- Refresh window: row STILL shows "✓ Paid" (state persisted)

If wallet popup is cancelled: row should NOT show pending (since `transferStx` threw "cancelled" before we wrote to the ledger).

### Step 7: Commit

```
git add frontend/components/windows/SeasonAdminWindow.tsx
git commit -m "feat(season-admin): persist payout status per row using payout ledger"
```

---

## Self-review

- **Spec coverage:** ledger store with 4 states (none/pending/success/failed) ✓, persistence ✓, row rendering by status ✓, no double-pay safeguard (the row turns into a status display so the button isn't there to click), refresh resilience ✓.
- **Placeholder scan:** none.
- **Type consistency:** `PayoutEntry` and `PayoutStatus` imported in window; key composition consistent between store and consumer.
- **Out-of-scope intentionally:** server-side ledger, cross-device sync, automatic chain-history recovery, "Pay all unpaid" batch button. These can be follow-ups.

---

## Execution

Subagent-driven, one fresh implementer per task, spec + quality review between tasks.
