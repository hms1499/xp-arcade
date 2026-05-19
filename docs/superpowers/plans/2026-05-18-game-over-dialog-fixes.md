# Game-Over Dialog Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the post-game-over `MintDialog`: make "Close" close the Snake window, make mint-tx tracking survive leaving the dialog, and label unknown/dropped tx statuses correctly.

**Architecture:** Hoist the mint-tx watch lifecycle into a new focused Zustand store (`state/mint-tx.ts`) that owns `watchTx`, the success/fail/minting toasts, `playSuccess`, and `wallet.mintPending` — so unmounting the dialog cannot cancel tracking. `MintDialog` becomes a thin consumer. `tx-tracker.ts` normalizes any unknown/dropped status to a generic `"failed"`. `GameWindow`'s `onClose` calls the window store's `close(id)`.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Zustand 5, Vitest 3 (jsdom), `@stacks` SDK.

Spec: `docs/superpowers/specs/2026-05-18-game-over-dialog-fixes-design.md`. Repo root: `/Users/vanhuy/Desktop/xp-snake`; all commands run from `/Users/vanhuy/Desktop/xp-snake/frontend` unless noted. Branch for this work: `fix/game-over-dialog` (already created off `main`). Reliable type-check is `npx tsc --noEmit 2>&1 | grep -v '\.next/'` (empty = clean; raw `tsc` is noisy from pre-existing `.next/` cache errors — a known project quirk). There are pre-existing uncommitted files (`.gitignore`, `CLAUDE.md`, untracked docs) NOT part of this work — never `git add -A`/`.`; stage only the files each task names. Global git convention: NO `Co-Authored-By` trailer; conventional commit prefixes.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `frontend/lib/tx-tracker.ts` | Poll/watch one tx; status type | Add `"failed"` to `TxStatus`; `pollTxStatus` maps any non-pending unknown/dropped value → `"failed"` |
| `frontend/lib/tx-tracker.test.ts` | **NEW** unit test | `pollTxStatus` mapping with mocked `fetch` |
| `frontend/state/mint-tx.ts` | **NEW** focused store: mint-tx watch lifecycle | Create: `txId`, `status`, `start(txId, score)`, `reset()` |
| `frontend/state/mint-tx.test.ts` | **NEW** unit test | Store transitions + side effects, watch independent of React |
| `frontend/components/dialogs/MintDialog.tsx` | Game-over UI | Remove internal `watchTx` effect + unmount cleanup; call `useMintTx.start` on submit; read status from `useMintTx`; add `"failed"` to label/color maps |
| `frontend/components/windows/GameWindow.tsx` | Snake window host | `onClose` → `close(w.id)` from `useWindows` |

`wallet.ts` and `SystemTray.tsx` are intentionally unchanged (the store drives `setMintPending`).

---

### Task 1: `tx-tracker` — generic `"failed"` status + normalization

**Files:**
- Modify: `frontend/lib/tx-tracker.ts`
- Test: `frontend/lib/tx-tracker.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/tx-tracker.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { pollTxStatus } from "./tx-tracker";

function mockFetch(ok: boolean, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      json: async () => body,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pollTxStatus", () => {
  it("passes through the four known statuses", async () => {
    for (const st of [
      "pending",
      "success",
      "abort_by_response",
      "abort_by_post_condition",
    ]) {
      mockFetch(true, { tx_status: st });
      expect(await pollTxStatus("0xabc")).toBe(st);
    }
  });

  it("maps dropped / replace / unknown to 'failed'", async () => {
    for (const st of [
      "dropped_replace_by_fee",
      "dropped_stale_garbage_collect",
      "something_new",
    ]) {
      mockFetch(true, { tx_status: st });
      expect(await pollTxStatus("0xabc")).toBe("failed");
    }
  });

  it("returns 'pending' on a non-OK HTTP response (transient, keep polling)", async () => {
    mockFetch(false, {});
    expect(await pollTxStatus("0xabc")).toBe("pending");
  });

  it("returns 'pending' when tx_status is missing", async () => {
    mockFetch(true, {});
    expect(await pollTxStatus("0xabc")).toBe("pending");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tx-tracker`
Expected: FAIL — the "maps … to 'failed'" case currently returns the raw string (e.g. `"dropped_replace_by_fee"`), and `"failed"` is not yet a valid `TxStatus`.

- [ ] **Step 3: Implement the change**

In `frontend/lib/tx-tracker.ts`, replace the top of the file (the type and `pollTxStatus`) so it reads exactly:
```ts
"use client";
import { stacks } from "./stacks";

export type TxStatus =
  | "pending"
  | "success"
  | "abort_by_response"
  | "abort_by_post_condition"
  | "failed";

const KNOWN: ReadonlySet<string> = new Set([
  "pending",
  "success",
  "abort_by_response",
  "abort_by_post_condition",
]);

export async function pollTxStatus(txId: string): Promise<TxStatus> {
  const base = stacks.network.client?.baseUrl ?? "https://api.hiro.so";
  const res = await fetch(`${base}/extended/v1/tx/${txId}`);
  if (!res.ok) return "pending";
  const data = await res.json();
  const raw = data.tx_status as string | undefined;
  if (!raw) return "pending";
  if (KNOWN.has(raw)) return raw as TxStatus;
  // dropped_replace_by_fee, dropped_stale_garbage_collect, anything unknown:
  // treat as a terminal failure so the UI shows a clear label and polling stops.
  return "failed";
}
```
Leave the existing `watchTx` function below it unchanged. (`watchTx` already stops polling on any status `!== "pending"`, so `"failed"` terminates it correctly.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tx-tracker`
Expected: PASS — all four cases green.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -v '\.next/'`
Expected: empty. (Note: `MintDialog.tsx` builds a `Record<TxStatus, …>` and will be updated in Task 3 to add the `"failed"` key — verify this step does not report a MintDialog error yet; if it does, it means the `Record` is exhaustive-typed and must wait. It is acceptable for this step to show a single `MintDialog.tsx` error about the missing `"failed"` key; if so, note it and proceed — Task 3 closes it. If there is NO such error, even better.)

- [ ] **Step 6: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/tx-tracker.ts frontend/lib/tx-tracker.test.ts
git commit -m "fix(tx): normalize unknown/dropped tx_status to 'failed'"
```

---

### Task 2: New `mint-tx` store owning the watch lifecycle

**Files:**
- Create: `frontend/state/mint-tx.ts`
- Test: `frontend/state/mint-tx.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `frontend/state/mint-tx.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// Capture the onUpdate watchTx is given, and expose a stop spy.
const stopSpy = vi.fn();
let captured: ((s: string) => void) | null = null;
vi.mock("@/lib/tx-tracker", () => ({
  watchTx: (_txId: string, onUpdate: (s: string) => void) => {
    captured = onUpdate;
    return stopSpy;
  },
}));
const playSuccess = vi.fn();
vi.mock("@/lib/sounds", () => ({ playSuccess: () => playSuccess() }));

import { useMintTx } from "./mint-tx";
import { useWallet } from "./wallet";
import { useToasts } from "./toasts";

beforeEach(() => {
  captured = null;
  stopSpy.mockClear();
  playSuccess.mockClear();
  useMintTx.setState({ txId: null, status: "pending" });
  useWallet.setState({ mintPending: false });
  useToasts.setState({ toasts: [] });
});

describe("useMintTx.start", () => {
  it("sets pending state + wallet.mintPending and pushes a minting toast", () => {
    useMintTx.getState().start("0xabc", 42);
    expect(useMintTx.getState().txId).toBe("0xabc");
    expect(useMintTx.getState().status).toBe("pending");
    expect(useWallet.getState().mintPending).toBe(true);
    const t = useToasts.getState().toasts;
    expect(t.some((x) => x.title === "Minting…")).toBe(true);
  });

  it("on success: clears pending, plays sound, pushes success toast", () => {
    useMintTx.getState().start("0xabc", 7);
    captured!("success");
    expect(useMintTx.getState().status).toBe("success");
    expect(useWallet.getState().mintPending).toBe(false);
    expect(playSuccess).toHaveBeenCalledTimes(1);
    expect(
      useToasts.getState().toasts.some((x) => x.title === "NFT confirmed!"),
    ).toBe(true);
  });

  it("on a terminal failure: clears pending, pushes error toast, no sound", () => {
    useMintTx.getState().start("0xabc", 1);
    captured!("failed");
    expect(useMintTx.getState().status).toBe("failed");
    expect(useWallet.getState().mintPending).toBe(false);
    expect(playSuccess).not.toHaveBeenCalled();
    expect(
      useToasts.getState().toasts.some((x) => x.title === "Mint failed"),
    ).toBe(true);
  });

  it("watch is independent of React: onUpdate still updates the store later", () => {
    useMintTx.getState().start("0xabc", 5);
    // No component ever mounted/unmounted; the captured callback still works.
    captured!("abort_by_response");
    expect(useMintTx.getState().status).toBe("abort_by_response");
    expect(useWallet.getState().mintPending).toBe(false);
  });

  it("reset() stops the watch and clears state", () => {
    useMintTx.getState().start("0xabc", 9);
    useMintTx.getState().reset();
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(useMintTx.getState().txId).toBeNull();
    expect(useMintTx.getState().status).toBe("pending");
    expect(useWallet.getState().mintPending).toBe(false);
  });

  it("starting again stops the previous watch first", () => {
    useMintTx.getState().start("0xaaa", 1);
    useMintTx.getState().start("0xbbb", 2);
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(useMintTx.getState().txId).toBe("0xbbb");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- mint-tx`
Expected: FAIL — `./mint-tx` does not exist (module not found).

- [ ] **Step 3: Implement the store**

Create `frontend/state/mint-tx.ts`:
```ts
"use client";
import { create } from "zustand";
import { watchTx, type TxStatus } from "@/lib/tx-tracker";
import { useWallet } from "@/state/wallet";
import { useToasts } from "@/state/toasts";
import { playSuccess } from "@/lib/sounds";

type MintTxState = {
  txId: string | null;
  status: TxStatus;
  start: (txId: string, score: number) => void;
  reset: () => void;
};

// Module-scoped so the running watch is never tied to React's lifecycle.
let stopFn: (() => void) | null = null;

export const useMintTx = create<MintTxState>((set) => ({
  txId: null,
  status: "pending",
  start: (txId, score) => {
    if (stopFn) {
      stopFn();
      stopFn = null;
    }
    set({ txId, status: "pending" });
    useWallet.getState().setMintPending(true);
    useToasts.getState().push({
      title: "Minting…",
      body: "Waiting for on-chain confirmation",
      type: "info",
      duration: 30_000,
    });
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
      } else {
        useToasts.getState().push({
          title: "Mint failed",
          body: "Transaction was rejected on-chain.",
          type: "error",
          duration: 5000,
        });
      }
    });
  },
  reset: () => {
    if (stopFn) {
      stopFn();
      stopFn = null;
    }
    set({ txId: null, status: "pending" });
    useWallet.getState().setMintPending(false);
  },
}));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- mint-tx`
Expected: PASS — all six cases green.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -v '\.next/'`
Expected: empty (the lone allowed exception is still the pre-existing `MintDialog.tsx` `"failed"`-key error from Task 1, closed in Task 3).

- [ ] **Step 6: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/state/mint-tx.ts frontend/state/mint-tx.test.ts
git commit -m "feat(mint-tx): focused store owning mint watch, toasts, pending"
```

---

### Task 3: `MintDialog` becomes a thin consumer

**Files:**
- Modify: `frontend/components/dialogs/MintDialog.tsx`

- [ ] **Step 1: Replace imports**

In `frontend/components/dialogs/MintDialog.tsx`, replace lines 1–8 (the directive + imports) with exactly:
```tsx
"use client";
import { useState } from "react";
import { useWallet } from "@/state/wallet";
import { mintScore } from "@/lib/contract-calls";
import { useMintTx } from "@/state/mint-tx";
import { type TxStatus } from "@/lib/tx-tracker";
import { recordScore } from "@/lib/high-score";
```
(Removed: `useEffect`, `useToasts`, `watchTx`, `playSuccess` — all now live in the store. `useState` is still needed.)

- [ ] **Step 2: Add the `"failed"` label/color entries**

Replace the `STATUS_LABEL` and `STATUS_COLOR` consts so each is exhaustive over the new `TxStatus`:
```tsx
const STATUS_LABEL: Record<TxStatus, string> = {
  pending: "⏳ Confirming…",
  success: "✓ Confirmed!",
  abort_by_response: "✗ Failed (contract error)",
  abort_by_post_condition: "✗ Failed (post-condition)",
  failed: "✗ Failed",
};

const STATUS_COLOR: Record<TxStatus, string> = {
  pending: "#888",
  success: "#007700",
  abort_by_response: "#cc0000",
  abort_by_post_condition: "#cc0000",
  failed: "#cc0000",
};
```

- [ ] **Step 3: Swap local tx state for the store, drop the watch effect**

Replace the component body from `const address = useWallet(...)` down to the end of the `useEffect(...)` block (the original lines 33–72: the selectors, the `txStatus`/`setMintPending` local state, and the entire `useEffect` that called `watchTx`) with exactly:
```tsx
  const address = useWallet((s) => s.address);
  const connect = useWallet((s) => s.connect);
  const mintStatus = useMintTx((s) => s.status);
  const startMintTx = useMintTx((s) => s.start);
  const [busy, setBusy] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);
  const defaultName = address ? address.slice(-8) : "anon";
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Record this run once on mount; lazy init runs exactly once per dialog.
  const [hs] = useState(() => recordScore(score));
```
(`txId` stays local only to gate which panel renders; all watch/toast/pending side
effects now live in `useMintTx`. The `useEffect` import was already removed in
Step 1, so the deleted effect must be fully gone.)

- [ ] **Step 4: Update `handleMint` to delegate to the store**

Replace the whole `async function handleMint() { … }` block with exactly:
```tsx
  async function handleMint() {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const tx = await mintScore(score, name || defaultName, address);
      setTxId(tx);
      startMintTx(tx, score);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Mint failed";
      if (msg.includes("104") || msg.toLowerCase().includes("score-too-high")) {
        setError("Score rejected by contract (too high). Please play a normal game.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }
```

- [ ] **Step 5: Render the inline status from the store**

In the JSX, the tx panel currently reads `STATUS_COLOR[txStatus]` / `STATUS_LABEL[txStatus]`. Change those two references from `txStatus` to `mintStatus`:
```tsx
          <p style={{ color: STATUS_COLOR[mintStatus], marginBottom: 4 }}>
            {STATUS_LABEL[mintStatus]}
          </p>
```
Leave everything else in the JSX (the `{txId ? … : …}` gating, buttons, name field, `hs` summary) unchanged.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -v '\.next/'`
Expected: empty — no errors at all now (the `Record<TxStatus, …>` is exhaustive with `"failed"`, no remaining references to removed symbols `useEffect`/`useToasts`/`watchTx`/`playSuccess`/`txStatus`/`setMintPending`).

- [ ] **Step 7: Full suite — no regressions**

Run: `npm test`
Expected: all pass — the `tx-tracker` and `mint-tx` suites from Tasks 1–2 plus all pre-existing tests.

- [ ] **Step 8: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/dialogs/MintDialog.tsx
git commit -m "refactor(mint-dialog): consume mint-tx store, drop internal watch"
```

---

### Task 4: `GameWindow` — "Close" closes the Snake window

**Files:**
- Modify: `frontend/components/windows/GameWindow.tsx`

- [ ] **Step 1: Subscribe `close` from the window store**

In `frontend/components/windows/GameWindow.tsx`, find:
```tsx
  const address = useWallet((s) => s.address);
```
and add directly below it:
```tsx
  const close = useWindows((s) => s.close);
```
(`useWindows` is already imported in this file.)

- [ ] **Step 2: Point `onClose` at the window store**

Find:
```tsx
          onClose={() => setFinalScore(null)}
```
and replace it with:
```tsx
          onClose={() => close(w.id)}
```
(`w` is guaranteed defined here — the component does `if (!w) return null;` before this JSX. Closing the window makes the `useWindows` selector return `undefined` on the next render, so `GameWindow` returns `null`, unmounts, and all its state — including `isTopScore` — resets; this is also the Bug 2 auto-fix. Do NOT change `onPlayAgain`.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -v '\.next/'`
Expected: empty.

- [ ] **Step 4: Full suite — no regressions**

Run: `npm test`
Expected: all pass (no test depends on the old `onClose` behavior).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: completes, exits 0, no build errors.

- [ ] **Step 6: Manual smoke (UI not unit-testable)**

Run: `npm run dev`, open `http://localhost:3000`, open Snake.
- Die → dialog shows. Click **Close** → the Snake window disappears (back to desktop). Reopen Snake from the desktop icon → a fresh game starts.
- Die → **Mint as NFT** (connected wallet) → immediately click **Play Again** (or Close) while status is "⏳ Confirming…" → the system-tray spinner keeps spinning and, when the tx resolves, the "NFT confirmed!" (or "Mint failed") balloon still appears.
- If a tx is dropped/replaced, the inline status reads "✗ Failed" (not blank).
- Stop the dev server (Ctrl+C).

- [ ] **Step 7: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/windows/GameWindow.tsx
git commit -m "fix(game): Close button closes the Snake window"
```

---

## Self-Review

**Spec coverage:**
- Bug 1 ("Close" closes window) → Task 4 Steps 1–2. ✓
- Bug 2 (auto-fixed by Bug 1; no separate change) → Task 4 Step 2 note + Step 6 manual (reopen = clean). ✓
- Bug 3 (global tracking survives unmount) → Task 2 (store owns `watchTx`/toasts/pending, module-scoped `stopFn`) + Task 3 (dialog stops calling `watchTx`/cleanup, delegates to `start`); test "watch is independent of React" + manual Step 6. ✓
- Bug 4 (`"failed"` normalization) → Task 1 (`tx-tracker`) + Task 3 Step 2 (label/color). ✓
- Spec "store drives `setMintPending`, SystemTray/wallet unchanged" → Task 2 store calls `useWallet.getState().setMintPending`; no task touches `wallet.ts`/`SystemTray.tsx`. ✓
- Spec "Minting… submit toast" lifecycle centralized → Task 2 `start()` pushes it (removed from dialog in Task 3); test asserts it. ✓
- Spec testing (unit for store + tracker; tsc/suite/build/manual) → Tasks 1–2 TDD, Task 3 Step 7, Task 4 Steps 3–6. ✓

**Placeholder scan:** No TBD/TODO. Every code step shows full before/after; every command has expected output. The only conditional ("may show one MintDialog error after Task 1") is explicitly bounded and closed in Task 3 Step 6. ✓

**Type consistency:** `TxStatus` gains `"failed"` in Task 1 and is used exhaustively in `STATUS_LABEL`/`STATUS_COLOR` (Task 3 Step 2) and as the store's `status` type (Task 2). Store API `start(txId: string, score: number)` / `reset()` / `{ txId, status }` is defined in Task 2 and consumed identically in Task 3 (`useMintTx((s) => s.status)`, `useMintTx((s) => s.start)`, `startMintTx(tx, score)`). `close` selector matches the window store's existing `close(id)` used elsewhere (e.g. `Window.tsx`). Removed symbols (`useEffect`, `useToasts`, `watchTx`, `playSuccess`, local `txStatus`, `setMintPending`) are not referenced after Task 3. ✓
