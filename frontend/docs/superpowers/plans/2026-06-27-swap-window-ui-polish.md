# Swap Window UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Swap window's presentation to a richer Windows-95 / 98.css treatment without changing any swap behavior.

**Architecture:** Pure presentational change to one React component. Extract two isolated, independently testable units first — inline-SVG token icons and a pure `swapStatusText` helper — then restructure `SwapWindow.tsx` to consume them with sunken token panels, a centered direction switch, a details block, and a status bar. No logic, data flow, or network calls change.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, 98.css, Vitest 3, jsdom + `react-dom/client` test harness.

## Global Constraints

- Frontend only — no contract, no Bitflow logic, no new network calls.
- Do NOT modify `lib/swap.ts`, `lib/swap-math.ts`, `lib/swap-errors.ts`, `lib/swap-tokens.ts`, `state/swap-tx.ts`, or `app/api/bitflow/**`.
- Behavior frozen: keep the existing debounce (400ms), `QUOTE_STALE_MS = 30_000`, `canSwap` gating, slippage choices `[10, 50, 100]` bps (default 50), `executeSwap` flow, toasts, and STX-only `Max`.
- Preserve these two phrases verbatim (case-insensitive) — existing tests assert them: `"connect your wallet"` and `"only available on mainnet"`.
- Token icons are bundled inline SVG — no third-party image URLs.
- Out of scope: USD value, sBTC balance, price-impact, token dropdown.
- ASCII-only source where the project requires it; `tsc --noEmit` clean; `npx vitest run` green before each commit.

---

### Task 1: Token icon components

**Files:**
- Create: `frontend/components/windows/swap-icons.tsx`
- Test: `frontend/components/windows/swap-icons.test.tsx`

**Interfaces:**
- Produces: `StxIcon(props: { size?: number }): JSX.Element` and `SbtcIcon(props: { size?: number }): JSX.Element` — each renders an `<svg role="img">` with an `aria-label` ("STX" / "sBTC"), default size 18.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/components/windows/swap-icons.test.tsx
import { describe, it, expect, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StxIcon, SbtcIcon } from "./swap-icons";

afterEach(() => {});

describe("swap token icons", () => {
  it("StxIcon renders an accessible svg at the default size", () => {
    const html = renderToStaticMarkup(<StxIcon />);
    expect(html).toContain("<svg");
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="STX"');
    expect(html).toContain('width="18"');
  });

  it("SbtcIcon renders an accessible svg and honors a custom size", () => {
    const html = renderToStaticMarkup(<SbtcIcon size={24} />);
    expect(html).toContain('aria-label="sBTC"');
    expect(html).toContain('width="24"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run components/windows/swap-icons.test.tsx`
Expected: FAIL — cannot resolve `./swap-icons`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/components/windows/swap-icons.tsx
import type { JSX } from "react";

type IconProps = { size?: number };

// Stacks: purple rounded square with stacked chevrons.
export function StxIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg
      role="img"
      aria-label="STX"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
    >
      <rect width="16" height="16" rx="2" fill="#5546ff" />
      <path d="M4 5h8M4 11h8" stroke="#fff" strokeWidth="1.5" />
      <path d="M5 5l6 6M11 5l-6 6" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

// sBTC: orange circle with a Bitcoin "B".
export function SbtcIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg
      role="img"
      aria-label="sBTC"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
    >
      <circle cx="8" cy="8" r="8" fill="#f7931a" />
      <text
        x="8"
        y="12"
        textAnchor="middle"
        fontSize="11"
        fontWeight="bold"
        fill="#fff"
        fontFamily="monospace"
      >
        B
      </text>
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run components/windows/swap-icons.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/windows/swap-icons.tsx frontend/components/windows/swap-icons.test.tsx
git commit -m "feat(swap): bundled inline-SVG STX/sBTC token icons"
```

---

### Task 2: `swapStatusText` pure helper

**Files:**
- Create: `frontend/lib/swap-status.ts`
- Test: `frontend/lib/swap-status.test.ts`

**Interfaces:**
- Produces: `swapStatusText(s: { amountValid: boolean; hasQuote: boolean; quoteStale: boolean; submitting: boolean }): string`
  returning one of: `"Confirm in wallet…"`, `"Enter an amount"`, `"Quote expired"`, `"Ready"`, `"Fetching quote…"`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/swap-status.test.ts
import { describe, it, expect } from "vitest";
import { swapStatusText } from "./swap-status";

const base = { amountValid: false, hasQuote: false, quoteStale: false, submitting: false };

describe("swapStatusText", () => {
  it("prioritizes submitting over everything", () => {
    expect(swapStatusText({ ...base, amountValid: true, hasQuote: true, submitting: true }))
      .toBe("Confirm in wallet…");
  });
  it("prompts to enter an amount when none is valid", () => {
    expect(swapStatusText({ ...base })).toBe("Enter an amount");
  });
  it("flags an expired quote", () => {
    expect(swapStatusText({ ...base, amountValid: true, hasQuote: true, quoteStale: true }))
      .toBe("Quote expired");
  });
  it("is Ready with a fresh quote", () => {
    expect(swapStatusText({ ...base, amountValid: true, hasQuote: true }))
      .toBe("Ready");
  });
  it("shows fetching while a valid amount has no quote yet", () => {
    expect(swapStatusText({ ...base, amountValid: true }))
      .toBe("Fetching quote…");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/swap-status.test.ts`
Expected: FAIL — cannot resolve `./swap-status`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/lib/swap-status.ts

// Derives the Swap window status-bar text from current UI state. Pure — the
// component owns the spinner (keyed off loadingQuote) separately.
export function swapStatusText(s: {
  amountValid: boolean;
  hasQuote: boolean;
  quoteStale: boolean;
  submitting: boolean;
}): string {
  if (s.submitting) return "Confirm in wallet…";
  if (!s.amountValid) return "Enter an amount";
  if (s.hasQuote && s.quoteStale) return "Quote expired";
  if (s.hasQuote) return "Ready";
  return "Fetching quote…";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/swap-status.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/swap-status.ts frontend/lib/swap-status.test.ts
git commit -m "feat(swap): pure swapStatusText helper for the status bar"
```

---

### Task 3: Restructure the Swap window + styles

**Files:**
- Modify: `frontend/components/windows/SwapWindow.tsx` (replace the `return (...)` render block only; keep all hooks/handlers above it unchanged)
- Modify: `frontend/app/globals.css` (append swap layout + spinner classes)
- Test: `frontend/components/windows/SwapWindow.test.tsx` (unchanged — must stay green)

**Interfaces:**
- Consumes: `StxIcon`, `SbtcIcon` from `./swap-icons`; `swapStatusText` from `@/lib/swap-status`.
- Produces: no new exports.

- [ ] **Step 1: Append styles to `app/globals.css`**

Append to the end of `frontend/app/globals.css`:

```css
/* --- Swap window --- */
.swap-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  min-width: 280px;
}
.swap-panel {
  margin: 0;
  padding: 6px 8px 8px;
}
.swap-panel-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.swap-token {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: bold;
  white-space: nowrap;
}
.swap-amount {
  flex: 1;
  text-align: right;
}
.swap-subrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
  font-size: 11px;
  color: #333;
}
.swap-switch {
  align-self: center;
  min-width: 28px;
  height: 24px;
  padding: 0;
  line-height: 1;
}
.swap-spinner {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 50%;
  background: #000;
  vertical-align: middle;
  animation: swap-blink 1s steps(2, start) infinite;
}
@keyframes swap-blink {
  0% { opacity: 1; }
  50% { opacity: 0.2; }
  100% { opacity: 1; }
}
```

- [ ] **Step 2: Add the new imports to `SwapWindow.tsx`**

In `frontend/components/windows/SwapWindow.tsx`, add below the existing import of `mapSwapError`:

```tsx
import { swapStatusText } from "@/lib/swap-status";
import { StxIcon, SbtcIcon } from "./swap-icons";
```

- [ ] **Step 3: Add the status text just before `return (`**

Immediately before the component's `return (` (after the `onSwap` function), add
(icons are inlined as a ternary in the JSX to avoid an unstable nested component):

```tsx
  const statusText = swapStatusText({
    amountValid,
    hasQuote: !!quote,
    quoteStale,
    submitting,
  });
```

- [ ] **Step 4: Replace the entire `return (...)` block**

Replace the whole `return (` … `);` at the end of the component with:

```tsx
  return (
    <Window id={w.id} title="Swap">
      <div className="swap-body">
        {!onMainnet ? (
          <p>Swap is only available on mainnet.</p>
        ) : !address ? (
          <div style={{ display: "grid", gap: 8 }}>
            <p>Connect your wallet to swap STX and sBTC.</p>
            <button className="default" onClick={() => connect()}>Connect wallet</button>
          </div>
        ) : (
          <>
            <fieldset className="swap-panel">
              <legend>From</legend>
              <div className="swap-panel-row">
                <span className="swap-token">
                  {tokenX.symbol === "STX" ? <StxIcon /> : <SbtcIcon />}{tokenX.symbol}
                </span>
                <input
                  type="number"
                  min="0"
                  className="swap-amount"
                  value={amountStr}
                  placeholder="0.0"
                  onChange={(e) => setAmountStr(e.target.value)}
                  aria-label={`Amount of ${tokenX.symbol} to swap`}
                />
              </div>
              <div className="swap-subrow">
                <span>
                  {direction === "stx-to-sbtc" && balanceUstx != null
                    ? `Balance: ${fromBaseUnits(balanceUstx, tokenX.decimals)}`
                    : " "}
                </span>
                {direction === "stx-to-sbtc" && (
                  <button onClick={onMax} disabled={balanceUstx == null}>Max</button>
                )}
              </div>
            </fieldset>

            <button
              className="swap-switch"
              aria-label="Switch direction"
              onClick={() => { setDirection(flipDirection(direction)); setAmountStr(""); setQuote(null); }}
            >
              ⇅
            </button>

            <fieldset className="swap-panel">
              <legend>To</legend>
              <div className="swap-panel-row">
                <span className="swap-token">
                  {tokenY.symbol === "STX" ? <StxIcon /> : <SbtcIcon />}{tokenY.symbol}
                </span>
                <input
                  type="text"
                  readOnly
                  className="swap-amount"
                  value={quote ? String(quote.amountOut) : loadingQuote ? "…" : ""}
                  aria-label={`Estimated ${tokenY.symbol} received`}
                />
              </div>
            </fieldset>

            <fieldset className="swap-panel">
              <legend>Max slippage</legend>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {SLIPPAGE_CHOICES_BPS.map((bps) => (
                  <button
                    key={bps}
                    onClick={() => setSlippageBps(bps)}
                    aria-pressed={slippageBps === bps}
                    style={{ fontWeight: slippageBps === bps ? "bold" : "normal" }}
                  >
                    {bps / 100}%
                  </button>
                ))}
              </div>
            </fieldset>

            {quote && (
              <fieldset className="swap-panel">
                <legend>Details</legend>
                <p style={{ fontSize: 11, color: "#333", margin: 0 }}>
                  Rate: 1 {tokenX.symbol} ≈ {quote.rate.toPrecision(6)} {tokenY.symbol}
                  {" · "}Min received: {toMinReceived(quote.amountOut, slippageBps).toPrecision(6)} {tokenY.symbol}
                  {quoteStale && " · quote expired, edit amount to refresh"}
                </p>
              </fieldset>
            )}

            <button className="default" onClick={onSwap} disabled={!canSwap}>
              {submitting ? "Confirm in wallet…" : "Swap"}
            </button>

            <div className="status-bar">
              <p className="status-bar-field" aria-live="polite">
                {loadingQuote && <span className="swap-spinner" aria-hidden="true" />}
                {statusText}
              </p>
            </div>
          </>
        )}
      </div>
    </Window>
  );
```

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no output (exit 0). If `JSX`/`fromBaseUnits` errors appear, confirm the imports in Steps 2–3 and that `fromBaseUnits` is still imported (it already is in the current file).

- [ ] **Step 6: Run the Swap window tests (gate phrases preserved)**

Run: `cd frontend && npx vitest run components/windows/SwapWindow.test.tsx`
Expected: PASS (3 tests) — "connect your wallet" and "only available on mainnet" still present.

- [ ] **Step 7: Run the full suite**

Run: `cd frontend && npx vitest run`
Expected: all files pass (previous baseline 631 tests + Task 1 (2) + Task 2 (5) = 638).

- [ ] **Step 8: Commit**

```bash
git add frontend/components/windows/SwapWindow.tsx frontend/app/globals.css
git commit -m "feat(swap): richer Win95 layout — sunken panels, icons, status bar"
```

---

### Task 4: Manual visual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the dev server**

Run: `cd frontend && npm run dev`
Then open `http://localhost:3000`, launch the Swap window, connect a wallet (or confirm the connect CTA renders), and visually confirm: sunken From/To panels with STX/sBTC icons, centered ⇅ switch, slippage group, Rate/Min line on quote, and the bottom status bar transitioning through `Enter an amount → Fetching quote… (blinking dot) → Ready`.

- [ ] **Step 2: Stop the dev server**

Run: `pkill -f "next dev"`
Expected: server stops. No commit (verification only).

---

## Notes for the implementer

- The current `SwapWindow.tsx` keeps ALL hooks, effects, and the `onMax`/`onSwap`
  handlers above the render. Only Steps 2–4 of Task 3 touch the file: two new
  imports, a small pre-`return` block, and the `return` JSX. Do not alter the
  logic above it.
- `fromBaseUnits`, `toMinReceived`, `maxStxInput`, `flipDirection`,
  `tokensForDirection` are already imported in the current file — reuse them.
- The `Balance:` line uses `fromBaseUnits(balanceUstx, tokenX.decimals)`, which is
  new display wiring (the value was previously only used inside `onMax`); it adds
  no network call.
