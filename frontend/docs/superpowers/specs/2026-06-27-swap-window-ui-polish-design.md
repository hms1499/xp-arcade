# Swap Window UI/UX Polish — Design

**Date:** 2026-06-27
**Status:** Approved (design), pending implementation plan
**Scope:** Frontend only. Visual/presentation upgrade of the Swap window. No
contract changes, no Bitflow logic changes, no new network calls.

## Goal

The Swap window currently renders with bare inline styles and reads as too
minimal. Upgrade it to a richer **Windows-95 / 98.css** treatment that matches
the rest of XP Arcade, while keeping all existing behavior identical.

Chosen direction (locked): **richer Win95**, not modern/fintech. Token icons:
**self-drawn inline SVG, bundled** (no third-party image URLs — avoids the same
ad-blocker problem the Bitflow proxy just fixed).

## Hard constraint: behavior is frozen

Only the *presentation* changes. The following stay exactly as they are in
`components/windows/SwapWindow.tsx` today:

- Debounced quote fetch (400ms) on amount/direction change.
- Quote staleness handling (`QUOTE_STALE_MS = 30_000`) + re-check on execute.
- `canSwap` gating (mainnet + address + valid amount + fresh quote + not submitting).
- Slippage choices `[10, 50, 100]` bps, default 50.
- `executeSwap` flow, success/cancel callbacks, `startSwapTx`, toasts on error.
- STX balance load + `Max` (STX side only).

No new on-chain reads. Explicitly **not** adding: USD value, sBTC balance,
price-impact (the SDK does not expose it), or a token dropdown (fixed pair).

## Test-compatibility constraint

`SwapWindow.test.tsx` asserts only two phrases, which MUST be preserved verbatim
(case-insensitive match):

- `"connect your wallet"` — the no-wallet connect CTA on mainnet.
- `"only available on mainnet"` — the non-mainnet gate.

The connected-state UI is not asserted by existing tests, so it can be freely
restructured.

## Visual design

### A. Token panels (sunken fieldsets)

Two stacked panels using 98.css `fieldset` + `legend` ("From" / "To") with an
inset/sunken interior:

- Left: 18px inline SVG token icon (STX purple, sBTC orange/Bitcoin) + bold symbol.
- Right: the amount. **From** = the existing number `<input>`; **To** = a
  readonly field showing the estimated output (or `…` while `loadingQuote`).
- **From** sub-row: `Balance: <n>` + `[Max]` button (uses the already-loaded STX
  balance; Max only meaningful/enabled on the STX side, as today).
- **To** panel: no balance sub-row (no sBTC balance fetch — out of scope).

### B. Direction switch

The `⇅` button becomes a small square Win95 button, centered between the two
panels. Keep `aria-label="Switch direction"` and the existing reset-on-switch
behavior (clears amount + quote).

### C. Details + slippage

- A sunken **"Details"** block: `Rate 1 <X> ≈ <r> <Y>` · `Min received <m> <Y>`,
  still appending the "quote expired, edit amount to refresh" note when stale.
- **Slippage**: the three choices as Win95 buttons inside a `legend "Max slippage"`
  group, keeping `aria-pressed` on the active one.
- **Swap** button: full-width `.default`, unchanged disabled logic and labels
  ("Swap" / "Confirm in wallet…").

### D. Status bar (Win95 accent + a11y)

A `.status-bar` at the window bottom with a `.status-bar-field` reflecting the
live state, derived from existing state (no new state machine):

| Condition | Status text |
|---|---|
| no amount entered | `Enter an amount` |
| `loadingQuote` | `Fetching quote…` (with an animated dot/spinner) |
| quote present & fresh | `Ready` |
| quote stale | `Quote expired` |
| `submitting` | `Confirm in wallet…` |

The field uses `aria-live="polite"` so screen readers announce transitions.

### E. Gate states

The "not mainnet" and "connect wallet" branches get an icon + tidier alignment,
preserving the two required phrases.

## Files touched

- `components/windows/SwapWindow.tsx` — restructure JSX/markup only.
- `components/windows/swap-icons.tsx` — **new**; two small inline-SVG icon
  components (`StxIcon`, `SbtcIcon`).
- `app/globals.css` — a few classes for the sunken panel insets and the
  status spinner animation, if not expressible with existing 98.css classes.

## Testing

- Keep the 3 existing `SwapWindow.test.tsx` tests green (both gate phrases preserved).
- Add 1–2 tests covering status-bar text for representative states (e.g.
  "Enter an amount" with no input; connect CTA still present).
- `npx tsc --noEmit` clean; full `npx vitest run` green.

## Out of scope / non-goals

- Any change to `lib/swap.ts`, `lib/swap-math.ts`, `lib/swap-errors.ts`,
  `lib/swap-tokens.ts`, `state/swap-tx.ts`, or the `/api/bitflow` proxy.
- USD pricing, sBTC balance, price-impact, multi-token selection.
- Contract or post-condition changes.
