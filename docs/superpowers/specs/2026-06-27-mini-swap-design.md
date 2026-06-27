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
| Integration | **Approach A**: Bitflow SDK client-side — `getQuoteForRoute` for quotes, `executeSwap` opens the wallet (SDK-generated post-conditions) |
| Gas buffer | **Hard-coded 0.5 STX** reserved on STX side |
| Default slippage | 0.5% (selectable 0.1 / 0.5 / 1% + custom) |
| Quote staleness | ~30s → mark stale, disable Swap until refresh |

## 3. Architecture

Pure frontend. No contract changes.

```
Desktop icon "Swap"  →  SwapWindow.tsx (Win95 window)
                              │
                              ├─ lib/swap.ts          ← wraps @bitflowlabs/core-sdk
                              │     • getQuote(direction, amountIn) → uses getQuoteForRoute
                              │     • executeSwap(...)               → SDK opens wallet
                              │     • toBaseUnits / fromBaseUnits (6 vs 8 decimals)
                              │     • slippageBpsToTolerance(bps)
                              │     • mapSwapError(e)
                              │
                              ├─ @bitflowlabs/core-sdk executeSwap   ← SDK builds tx,
                              │     sets post-conditions from slippageTolerance,
                              │     opens the user's wallet (stacksProvider)
                              │
                              └─ lib/tx-tracker.ts    ← existing pending/success tracking
```

**Bitflow SDK surface (confirmed from docs):**
- `new BitflowSDK({ BITFLOW_API_HOST, BITFLOW_PROVIDER_ADDRESS, READONLY_CALL_API_HOST, BITFLOW_API_KEY })`
- `getQuoteForRoute(tokenXId, tokenYId, amount)` → `quoteResult` with selectable routes
- `executeSwap(swapExecutionData, senderAddress, slippageTolerance, stacksProvider, onSuccess, onCancel)`
  where `swapExecutionData = { route, amount, tokenXDecimals, tokenYDecimals }`.
  The SDK builds the tx, derives post-conditions from `slippageTolerance`, and
  opens the wallet itself — we do **not** hand-build `Pc` post-conditions.

- sBTC mainnet token contract id is a constant in `lib/swap-tokens.ts`
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
- `frontend/lib/swap-tokens.ts` (+ test) — pure constants/types:
  - `SWAP_TOKENS` — metadata for STX & sBTC (Bitflow token id, decimals, symbol)
  - `Direction` type (`"stx-to-sbtc" | "sbtc-to-stx"`), helpers for token X/Y per direction
- `frontend/lib/swap-math.ts` (+ test) — pure:
  - `toBaseUnits` / `fromBaseUnits` — decimals 6 (STX) vs 8 (sBTC)
  - `slippageBpsToTolerance(bps)` → fraction for SDK (50 bps → 0.005)
  - `maxStxInput(balanceUstx)` → balance minus 0.5 STX gas buffer (floored at 0)
- `frontend/lib/swap-errors.ts` (+ test) — pure:
  - `mapSwapError(e)` → friendly message string
- `frontend/lib/swap.ts` — SDK facade (thin; verified via smoke test, not unit-mocked):
  - `getSwapClient()` — lazily builds the `BitflowSDK` from env
  - `getQuote(direction, amountIn)` → `{ amountOut, rate, priceImpact, route, ts }`
  - `executeSwap(direction, quote, amountIn, sender, slippageBps, callbacks)` →
    calls SDK `executeSwap` with `stacksProvider` from `@stacks/connect`

The pure modules are independently unit-testable. `swap.ts` is a thin adapter
over the SDK (the real boundary), exercised by the manual mainnet smoke test.

## 5. Data Flow

```
1. Open Swap window  → guard: mainnet? wallet connected? (else CTA / disabled)
2. User enters amount in the From field
3. Debounce ~400ms → lib/swap.getQuote(direction, amountIn)
                    → show amountOut, rate, price impact, min-received
4. User clicks Swap
       → swap.executeSwap(direction, quote, amountIn, sender, slippageBps, cb)
       → SDK builds tx + post-conditions (from slippageTolerance), opens wallet
5. Wallet prompts (shows SDK-generated post-conditions) → user signs
6. onSuccess(txId) → tx-tracker → "Processing…" toast
       → on confirm: "Swap complete" toast + refresh balances
   onCancel        → close quietly, no error
```

- **Quote validity:** each quote carries a timestamp; older than ~30s is *stale*
  → Swap disabled until refresh. Never sign a stale price.
- **Balance & gas:** for From = STX, "Max" reserves a fixed 0.5 STX buffer for
  network fees; block if amount > balance.
- **Switch direction (⇅):** reset estimated output, refetch quote.
- **Decimals:** all math in base units (STX 1e6, sBTC 1e8); format only for display.

## 6. Error Handling & Safety (real money — most critical section)

### Post-conditions — SDK-generated from slippage (core anti-loss layer)

The Bitflow SDK `executeSwap` derives wallet post-conditions from the
`slippageTolerance` we pass in. We do **not** hand-build `Pc` post-conditions
(the SDK owns the router-specific call). This still satisfies the repo
convention's intent — every token-moving write carries post-conditions — but
the SDK is the source of truth, so:

- We pass `slippageTolerance = slippageBpsToTolerance(slippageBps)` (e.g.
  50 bps → 0.005) so the min-received bound matches the user's chosen slippage.
- **Smoke test (mainnet, real wallet) MUST visually confirm** the wallet prompt
  shows post-conditions, and that a deliberately tiny slippage causes a revert
  rather than a bad fill. This is the verification that replaces a unit test we
  can't write over the SDK's internal tx builder.

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

### Unit tests — co-located `*.test.ts` (vitest; pure modules, no network)
- `swap-math.test.ts`:
  - `toBaseUnits`/`fromBaseUnits`: STX 6 vs sBTC 8 decimals, rounding, fractional input
  - `slippageBpsToTolerance`: 10/50/100 bps → 0.001/0.005/0.01; boundaries
  - `maxStxInput`: balance minus 0.5 STX buffer; floors at 0 when balance < buffer
- `swap-tokens.test.ts`: direction → correct tokenX/tokenY id + decimals
- `swap-errors.test.ts`: `mapSwapError` each error class → correct message

No unit tests over `swap.ts` (thin SDK adapter) — covered by smoke test.
No contract tests (no contract change).

### Manual smoke test (required before "done")
On mainnet, real wallet, swap a **very small** amount (e.g. 1–2 STX) in both
directions; visually confirm the wallet prompt shows post-conditions, and that a
deliberately tiny slippage causes a revert rather than a bad fill.

### Gate
`npm run lint`, `npm test`, `npx tsc --noEmit`, `npm run build` all green
(or `npm run ci`).

## 8. Open Items for Implementation
- Confirm `@bitflowlabs/core-sdk` browser compatibility with `@stacks/connect` v8
  (which provider/object `executeSwap` expects as `stacksProvider`). If the SDK
  needs a server-only host or CORS blocks the quote call, proxy `getQuoteForRoute`
  through a Next API route (does not change the wallet-signing flow).
- Confirm canonical sBTC mainnet Bitflow token id + decimals (and STX token id).
- Confirm exact Bitflow config/env values: `BITFLOW_API_HOST`,
  `BITFLOW_PROVIDER_ADDRESS`, `READONLY_CALL_API_HOST`, `BITFLOW_API_KEY`.
