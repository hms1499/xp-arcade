# Game-Over Dialog Fixes — Design

**Date:** 2026-05-18
**Status:** Approved (user, 2026-05-18)
**Topic:** Fix bugs in the post-game-over `MintDialog` (the options "tab").

## Background

After a Snake game ends, `GameWindow` renders `MintDialog` (Game Over summary +
Mint/Play Again/Close + mint tx status). A code review found four real bugs. Three
need fixing (one is auto-resolved by another's fix).

## Bugs & Decisions

### Bug 1 — "Close" does not close anything (PRIMARY)

`GameWindow` passes `onClose={() => setFinalScore(null)}`. When `finalScore` is
`null`, `GameWindow` re-renders `<GameCanvas>`, which mounts fresh and auto-starts a
new game. So "Close" and "Play Again" do the same thing (start a new game); neither
closes anything.

**Decision:** "Close" closes the Snake window via the window store's `close(id)`.
Closing makes `GameWindow`'s `useWindows` selector return `undefined` → `GameWindow`
returns `null` → it unmounts and all its state resets. Reopening Snake from the
desktop/Start menu starts a clean new game. No idle/start screen is added.

### Bug 2 — "Close" forgets to reset `isTopScore` (AUTO-FIXED)

`onPlayAgain` resets `setIsTopScore(false)` but the old `onClose` did not, so a stale
`isTopScore=true` could make the next game's overlay briefly flash "NEW HIGH SCORE".
**Once Bug 1 is fixed, this disappears:** the only `finalScore→null` transition left
is `onPlayAgain` (which resets `isTopScore`); the "Close" path now unmounts
`GameWindow` entirely, so `isTopScore` resets on the next open. No separate change;
verified as part of Bug 1.

### Bug 3 — leaving the dialog mid-mint kills tracking

`MintDialog`'s effect cleanup runs `stop()` + `setMintPending(false)` on unmount. If
the user submits a mint and then clicks Play Again / Close (or, after Bug 1, closes
the window) while the tx is still pending: the system-tray spinner disappears though
the tx is still on-chain, and the "NFT confirmed!"/"Mint failed" toast never fires.

**Decision:** Hoist mint-tx tracking out of the component into a new focused Zustand
store `frontend/state/mint-tx.ts` (consistent with the project's "split into focused
stores" rule — not merged into the wallet store). The store owns the `watchTx`
lifecycle: a `start(txId, score)` action runs `watchTx` internally, keeps the `stop`
handle in module scope, updates `status`, and on a terminal status calls
`playSuccess()`, pushes the success/fail toast, and clears pending. Because
`watchTx` drives itself with `setTimeout` independent of the React tree, unmounting
the dialog or closing the window no longer cancels tracking — no app-level effect is
needed.

- `MintDialog` becomes a thin consumer: on mint submit it calls
  `useMintTx.getState().start(txId, score)` for the global watch, keeps a **local**
  `txId` only to gate which UI panel it shows (idle vs tx), and reads the inline
  status label from `useMintTx`'s `status`. Its old `watchTx` effect (and the
  unmount cleanup that caused the bug) is removed. A freshly mounted dialog (next
  game) shows the idle panel because its local `txId` starts `null`, while any still
  -pending previous watch continues to completion in the store.
- Blast-radius minimization: the mint-tx store calls
  `useWallet.getState().setMintPending(...)` so `SystemTray` (which reads
  `wallet.mintPending`) is unchanged. (Alternative considered: move `mintPending`
  entirely into the new store and update `SystemTray`; rejected for MVP as larger
  churn for no behavior gain.)

### Bug 4 — unknown `tx_status` renders a blank status line

Hiro can return statuses outside `TxStatus` (`dropped_replace_by_fee`,
`dropped_stale_garbage_collect`, etc.). They flow through as raw strings →
`STATUS_LABEL[status]`/`STATUS_COLOR[status]` are `undefined` → blank, colorless
status line; polling stops. (The fail toast still fires via the `s !== "pending"`
branch, so it is not fully silent, but the inline UI is confusing.)

**Decision:** Normalize in `tx-tracker.ts` (single source). Add a generic terminal
member `"failed"` to `TxStatus`. `pollTxStatus` returns `success`, `pending`,
`abort_by_response`, or `abort_by_post_condition` only when the API reports exactly
those; any other non-pending value (dropped/replace/unknown) → `"failed"`. A
transient non-OK HTTP response still returns `"pending"` (keep retrying), unchanged.
`MintDialog`'s `STATUS_LABEL`/`STATUS_COLOR` get a `"failed"` entry
(label `"✗ Failed"`, color `#cc0000`).

## Components & Boundaries

| File | Responsibility | Change |
|------|----------------|--------|
| `frontend/lib/tx-tracker.ts` | Poll/watch a tx; status type | Add `"failed"` to `TxStatus`; `pollTxStatus` maps unknown/dropped → `"failed"` |
| `frontend/state/mint-tx.ts` | **NEW** focused store owning mint-tx watch lifecycle | Create: `txId`, `status`, `start(txId, score)`, `reset()`; runs `watchTx`, toasts, `playSuccess`, drives `wallet.setMintPending` |
| `frontend/components/dialogs/MintDialog.tsx` | Game-over UI | Remove internal `watchTx` effect + unmount cleanup; call `useMintTx.start` on submit; read inline status from `useMintTx`; add `"failed"` to label/color maps |
| `frontend/components/windows/GameWindow.tsx` | Snake window host | `onClose` → `close(w.id)` from `useWindows` |
| `frontend/state/mint-tx.test.ts` | **NEW** unit tests | Test store: success/fail/failed transitions, toast + `setMintPending` effects, watch survives independent of any component |

`wallet.ts` and `SystemTray.tsx` are intentionally **unchanged** (store drives
`setMintPending`).

## Testing

- Unit (`mint-tx.test.ts`): mock `@/lib/tx-tracker`'s `watchTx` to drive `onUpdate`
  manually. Assert: `start()` sets `status:"pending"` and `wallet.mintPending=true`;
  on `"success"` → `mintPending=false`, a success toast pushed, `status:"success"`;
  on `"abort_by_response"`/`"failed"` → `mintPending=false`, an error toast pushed;
  the watch is not tied to React (calling the captured `onUpdate` after "no component
  exists" still updates the store). `reset()` stops the watch and clears state.
- Type-check: `cd frontend && npx tsc --noEmit 2>&1 | grep -v '\.next/'` → empty.
- Suite: `cd frontend && npm test` → all prior tests still pass + the new file.
- Build: `cd frontend && npm run build` → succeeds.
- Manual: play → mint → immediately Close/Play Again while pending → tray spinner
  keeps spinning, then "NFT confirmed!" (or "Mint failed") toast still fires; "Close"
  removes the Snake window; reopening starts a clean game; simulate a dropped tx →
  inline shows "✗ Failed", not blank.

## Scope (explicitly out)

- No idle/"press Start" screen for the canvas (Bug 1 option rejected by user).
- `mintPending` stays in `wallet.ts`; `SystemTray` untouched.
- No retry/resubmit UI for failed/dropped txs (only correct labeling).
- Sounds remain deferred elsewhere; `playSuccess` already exists and is reused.

## Risk

Medium — one new store + `MintDialog` refactored to a consumer + a `tx-tracker`
normalization + a one-line `GameWindow` change. Mitigated by unit tests for the new
store and the full existing suite staying green.
