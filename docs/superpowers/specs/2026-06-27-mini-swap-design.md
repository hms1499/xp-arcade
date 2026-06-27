# Mini Swap (STX ↔ sBTC via Bitflow) — Design

**Date:** 2026-06-27
**Status:** Approved (brainstorm) — pending implementation plan
**Author:** brainstorm session

## 1. Goal & Scope

Add a small, self-contained **Swap** feature to the XP Arcade frontend that lets a
connected user swap **STX ↔ sBTC** on **Stacks mainnet**, routed through the
**Bitflow** aggregator. Primary intent: learn DeFi integration on Stacks while
shipping a real, usable feature.

### In scope
- A Win95-styled "Swap" desktop window + icon.
- One fixed pair: **STX (6 decimals) ↔ sBTC (8 decimals)**.
- Real mainnet swaps signed by the user's own wallet (Xverse/Leather) via
  `@stacks/connect` `openContractCall`, with mandatory post-conditions.
- Quote, slippage control, price impact, min-received display.

### Explicitly out of scope (YAGNI)
- **No new Clarity contract.** Does **not** touch `xp-arcade-v4` or any score contract.
- **No fee / arcade-economy hook.** Standalone utility; calls Bitflow directly.
- No multi-token / open token list — STX↔sBTC only.
- No testnet support (DEX liquidity is mainnet-only); mainnet-guarded.
- No charts, limit orders, or routing UI beyond what Bitflow returns.

## 2. Key Decisions (locked)

| Decision | Choice |
|---|---|
| DEX | Bitflow aggregator (`@bitflowlabs/core-sdk`) |
| Network | Mainnet only (real swaps) |
| Pair | STX ↔ sBTC only |
| Economy | Standalone, no fee, no new contract, no v4 change |
| Integration | **Approach A**: Bitflow SDK client-side + `openContractCall` to sign |
| Gas buffer | **Hard-coded 0.5 STX** reserved on STX side |
| Default slippage | 0.5% (selectable 0.1 / 0.5 / 1% + custom) |
| Quote staleness | ~30s → mark stale, disable Swap until refresh |

## 3. Architecture

Pure frontend. No contract changes.

```
Desktop icon "Swap"  →  SwapWindow.tsx (Win95 window)
                              │
                              ├─ lib/swap.ts          ← wraps @bitflowlabs/core-sdk
                              │     • getQuote(direction, amountIn)
                              │     • buildSwapParams(...) → openContractCall input
                              │     • toMinReceived(amountOut, slippageBps)
                              │     • toBaseUnits / fromBaseUnits (6 vs 8 decimals)
                              │     • mapSwapError(e)
                              │
                              ├─ @stacks/connect openContractCall  ← user signs
                              │     + Pc post-conditions (required by repo convention)
                              │
                              └─ lib/tx-tracker.ts    ← existing pending/success tracking
```

- sBTC mainnet token contract id is a constant in `lib/swap.ts`
  (to be confirmed during implementation — canonical mainnet `sbtc-token`).
- Mainnet guard: if `NEXT_PUBLIC_NETWORK !== "mainnet"`, the window renders a
  disabled state ("Swap is only available on mainnet").
- Wallet-gated: if no wallet connected, show connect CTA (reuse
  `lib/wallet-connect-copy.ts`).
- New env vars: Bitflow SDK needs a Hiro API key (+ Bitflow key if required) →
  add to `frontend/.env.example` and Vercel.

## 4. Components & New Files

### UI
- `frontend/components/SwapWindow.tsx` — Win95 window:
  - **From** field (STX) with balance + "Max" button (reserves 0.5 STX gas buffer)
  - **⇅ switch-direction** button (STX↔sBTC)
  - **To** field (sBTC), read-only estimated output
  - Quote line: rate, **min received** (after slippage), price impact, Bitflow fee
  - **Slippage** chips: 0.1% / 0.5% / 1% + custom (default 0.5%)
  - **Swap** button — disabled when: not connected / invalid amount / quote
    loading or stale
  - Pending/success/error states via existing toast pattern
- Register a "Swap" desktop icon + window via the existing window-manager
  mechanism used by other windows.

The window contains **no calculation logic** — it only calls `lib/swap.ts`.

### Logic
- `frontend/lib/swap.ts` (+ `swap.test.ts`):
  - `SWAP_TOKENS` — metadata for STX & sBTC (id, decimals, symbol)
  - `getQuote(direction, amountIn)` → `{ amountOut, rate, priceImpact, fee }`
  - `toBaseUnits` / `fromBaseUnits` — decimals 6 (STX) vs 8 (sBTC)
  - `toMinReceived(amountOut, slippageBps)`
  - `buildSwapParams(direction, amountIn, minOut, sender)` → object for
    `openContractCall`, including `postConditions`
  - `mapSwapError(e)` → friendly message

Each unit has one purpose and is independently testable with the SDK mocked.

## 5. Data Flow

```
1. Open Swap window  → guard: mainnet? wallet connected? (else CTA / disabled)
2. User enters amount in the From field
3. Debounce ~400ms → lib/swap.getQuote(direction, amountIn)
                    → show amountOut, rate, price impact, min-received
4. User clicks Swap
       → buildSwapParams(direction, amountIn, minOut, sender)
       → openContractCall({ ...params, postConditions, onFinish, onCancel })
5. Wallet prompts → user signs
6. onFinish(txId) → tx-tracker → "Processing…" toast
       → on confirm: "Swap complete" toast + refresh balances
   onCancel       → close quietly, no error
```

- **Quote validity:** each quote carries a timestamp; older than ~30s is *stale*
  → Swap disabled until refresh. Never sign a stale price.
- **Balance & gas:** for From = STX, "Max" reserves a fixed 0.5 STX buffer for
  network fees; block if amount > balance.
- **Switch direction (⇅):** reset estimated output, refetch quote.
- **Decimals:** all math in base units (STX 1e6, sBTC 1e8); format only for display.

## 6. Error Handling & Safety (real money — most critical section)

### Post-conditions (REQUIRED by repo convention) — core anti-loss layer

| Direction | Token sent | Token received |
|---|---|---|
| STX → sBTC | `Pc.principal(sender).willSendEq(amountIn).ustx()` | sBTC `willSendGte(minOut)` (FT post-condition) |
| sBTC → STX | sBTC `willSendEq(amountIn)` (FT) | `Pc.principal(sender).willSendGte(minOut).ustx()` |

If the DEX returns less than min-received, the wallet reverts the transaction.
Slippage is protected at two layers: the `minOut` parameter passed into Bitflow
**and** the post-condition.

### Pre-swap validation
- amount > 0, ≤ balance (minus 0.5 STX gas buffer when From = STX)
- a quote exists and is not stale
- wallet connected, on mainnet

### Friendly error mapping (`mapSwapError`)
- No route / insufficient liquidity → "No liquidity for this amount"
- Post-condition fail / slippage → "Price moved, retry with higher slippage"
- User cancels wallet → close quietly, no error surfaced
- Quote API error/timeout → "Couldn't fetch a price, try again"

### Mainnet guard
All swap actions are blocked unless `NEXT_PUBLIC_NETWORK === "mainnet"`.

## 7. Testing

### Unit tests — `frontend/lib/swap.test.ts` (vitest, co-located; SDK mocked, no network)
- `toBaseUnits`/`fromBaseUnits`: STX 6 vs sBTC 8 decimals, rounding, fractional input
- `toMinReceived`: correct per slippage bps (0.1 / 0.5 / 1%); boundaries
- `buildSwapParams`: correct functionArgs + **post-conditions per §6 table** for
  both directions (the most important test)
- `mapSwapError`: each error class → correct message
- Gas buffer 0.5 STX: "Max" and amount validation compute correctly

No contract tests (no contract change).

### Manual smoke test (required before "done")
On mainnet, real wallet, swap a **very small** amount (e.g. 1–2 STX) in both
directions; confirm the post-condition revert works when slippage is set
extremely low.

### Gate
`npx tsc --noEmit`, `npm test`, `npm run lint` all green.

## 8. Open Items for Implementation
- Confirm `@bitflowlabs/core-sdk` browser compatibility with `@stacks/connect` v8
  (`openContractCall` param shape). If CORS/rate-limit issues arise on the quote
  call, optionally proxy quotes through a Next API route (does not change the
  client-side signing flow).
- Confirm canonical sBTC mainnet token contract id + decimals.
- Identify exact env var(s) Bitflow SDK requires (Hiro API key, etc.).
