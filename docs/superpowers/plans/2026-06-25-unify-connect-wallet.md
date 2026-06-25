# Unify Connect-Wallet Treatment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every "connect wallet" touchpoint one brand-correct icon (the Stacks logo), unified casing/voice, and a "why" where there's room — replacing the misleading MetaMask fox and the five-icon zoo.

**Architecture:** A single `StacksLogo` SVG component + a shared copy constant, applied across six surfaces. Three wrapper components that take a string `icon`/`emoji` are minimally widened to `ReactNode` so the logo can be passed; existing emoji callers keep working. No change to `connect()`, `@stacks/connect`, balloon timing, or wallet state.

**Tech Stack:** Next.js 16 / React 19 / TS, `98.css`, Vitest (`renderToStaticMarkup` for component tests — the project does NOT use @testing-library).

## Global Constraints

- Frontend-only; no contract / `@stacks/connect` / wallet-state changes.
- Stacks logo is the **badge form**: a `#5546FF` circle + white mark, `viewBox="0 0 32 32"`, self-contained two-color (NOT `currentColor`) so it has guaranteed contrast on both silver buttons and the dark wallpaper. Exact path is the official STX mark (in Task 1).
- Canonical label is `"Connect Wallet"` (title case). Contextual suffix labels are allowed ("Connect to Mint", "Connect to check prizes") — same icon, same base verb, same casing.
- Shared copy lives in `WALLET_CONNECT` (`lib/wallet-connect-copy.ts`); surfaces import it rather than hard-coding the canonical strings.
- Component tests use `renderToStaticMarkup`. Commit conventions: conventional prefix, stage explicit files, **no `Co-Authored-By`**. Run commands from `frontend/`.
- Backward compatibility: widening `icon`/`emoji` props to `ReactNode`/optional must not break existing string/emoji callers.

---

### Task 1: StacksLogo component + shared copy constant

**Files:**
- Create: `frontend/components/shared/StacksLogo.tsx`
- Create: `frontend/lib/wallet-connect-copy.ts`
- Test: `frontend/components/shared/StacksLogo.test.tsx`

**Interfaces:**
- Produces:
  - `function StacksLogo(props: { size?: number; title?: string }): JSX.Element` — renders the Stacks badge SVG; `aria-hidden` when no `title`, else `role="img"` + `<title>`.
  - `const WALLET_CONNECT = { label: "Connect Wallet", tagline: "Save scores & claim prizes" } as const`

- [ ] **Step 1: Write the failing test**

Create `frontend/components/shared/StacksLogo.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StacksLogo } from "./StacksLogo";

describe("StacksLogo", () => {
  it("renders an svg with the Stacks brand circle and a square viewBox", () => {
    const html = renderToStaticMarkup(<StacksLogo size={20} />);
    expect(html).toContain("<svg");
    expect(html).toContain('viewBox="0 0 32 32"');
    expect(html).toContain("#5546FF");
    expect(html).toContain('width="20"');
  });

  it("is aria-hidden by default and labelled when a title is given", () => {
    expect(renderToStaticMarkup(<StacksLogo />)).toContain('aria-hidden="true"');
    const labelled = renderToStaticMarkup(<StacksLogo title="Stacks" />);
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain("<title>Stacks</title>");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/shared/StacksLogo.test.tsx`
Expected: FAIL — cannot resolve `./StacksLogo`.

- [ ] **Step 3: Write the implementation**

Create `frontend/components/shared/StacksLogo.tsx`:

```tsx
import type { CSSProperties } from "react";

/**
 * Official Stacks (STX) badge mark — purple circle + white symbol. Used as the
 * single brand-correct, wallet-agnostic icon for every "connect wallet" entry
 * point (@stacks/connect opens a multi-wallet picker, so no single wallet's
 * logo is appropriate). Two-color and self-contained for guaranteed contrast on
 * both silver buttons and the dark wallpaper.
 */
export function StacksLogo({
  size = 16,
  title,
  style,
}: {
  size?: number;
  title?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flexShrink: 0, ...style }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <circle fill="#5546FF" cx="16" cy="16" r="16" />
      <path
        fill="#FFF"
        d="M19.319 19.033l3.61 5.467h-2.697l-4.24-6.423-4.238 6.423H9.07l3.611-5.453H7.5v-2.07h17v2.056zm5.181-6.138v2.085h-17v-2.084h5.081L9.013 7.5h2.698l4.282 6.509L20.289 7.5h2.698l-3.568 5.395z"
      />
    </svg>
  );
}
```

- [ ] **Step 4: Create the copy constant**

Create `frontend/lib/wallet-connect-copy.ts`:

```ts
/** Single source of truth for the canonical connect-wallet copy. Contextual
 *  labels (e.g. "Connect to Mint") stay inline at their call site. */
export const WALLET_CONNECT = {
  label: "Connect Wallet",
  tagline: "Save scores & claim prizes",
} as const;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run components/shared/StacksLogo.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` (expected: clean)

```bash
git add frontend/components/shared/StacksLogo.tsx frontend/components/shared/StacksLogo.test.tsx frontend/lib/wallet-connect-copy.ts
git commit -m "feat(wallet): Stacks logo component + shared connect copy"
```

---

### Task 2: Widen icon props to ReactNode (TrayBalloon, MenuItem, EmptyState)

**Files:**
- Modify: `frontend/components/desktop/TrayBalloon.tsx`
- Modify: `frontend/components/desktop/StartMenu.tsx` (the `MenuItem` helper, ~line 24-32)
- Modify: `frontend/components/shared/EmptyState.tsx`

**Interfaces:**
- Produces: `TrayBalloon` and `MenuItem` accept `icon: ReactNode`; `EmptyState` accepts optional `icon?: ReactNode` (rendered instead of `emoji` when present) and `emoji?: string` becomes optional.
- Consumes: nothing from Task 1 yet (wiring happens in Tasks 3-4).

- [ ] **Step 1: Widen TrayBalloon's icon prop**

In `frontend/components/desktop/TrayBalloon.tsx`, add the React type import at the top:

```tsx
"use client";
import type { ReactNode } from "react";
```

Then change the prop type `icon: string;` to:

```tsx
  icon: ReactNode;
```

(No other change — the existing `<span style={{ fontSize: 18 }}>{icon}</span>` renders a ReactNode fine.)

- [ ] **Step 2: Widen MenuItem's icon prop**

In `frontend/components/desktop/StartMenu.tsx`, find the `MenuItem` prop type:

```tsx
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
```

Change `icon: string;` to `icon: ReactNode;`. Ensure `ReactNode` is imported — at the top of the file add it to the existing react import (if the file imports `{ useState }` from "react", make it `import { useState, type ReactNode } from "react";` — match the existing import shape).

- [ ] **Step 3: Add an optional icon to EmptyState**

In `frontend/components/shared/EmptyState.tsx`, replace the component signature and the emoji span. New file body:

```tsx
"use client";
import type { ReactNode } from "react";

export function EmptyState({
  emoji,
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  emoji?: string;
  icon?: ReactNode;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "20px 12px",
        border: "1px solid #d0d0c8",
        background: "#f5f5f0",
        display: "grid",
        gap: 6,
        justifyItems: "center",
      }}
    >
      {icon ? (
        <span aria-hidden="true" style={{ lineHeight: 1 }}>
          {icon}
        </span>
      ) : emoji ? (
        <span aria-hidden="true" style={{ fontSize: 40, lineHeight: 1 }}>
          {emoji}
        </span>
      ) : null}
      <p style={{ margin: 0, fontWeight: "bold", fontSize: 13 }}>{title}</p>
      <p style={{ margin: 0, fontSize: 11, color: "#555", maxWidth: 280 }}>{body}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          className="default"
          onClick={onAction}
          style={{ marginTop: 4, fontWeight: "bold" }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify nothing broke**

Run: `npx vitest run components/desktop/TrayBalloon.test.tsx components/shared/EmptyState.test.tsx && npx tsc --noEmit`
Expected: existing TrayBalloon + EmptyState tests still PASS; tsc clean. (Widening to `ReactNode` / making `emoji` optional is backward-compatible with the string/emoji callers.)

- [ ] **Step 5: Commit**

```bash
git add frontend/components/desktop/TrayBalloon.tsx frontend/components/desktop/StartMenu.tsx frontend/components/shared/EmptyState.tsx
git commit -m "refactor(wallet): widen icon props to ReactNode for the Stacks logo"
```

---

### Task 3: Apply Stacks logo + unified copy to desktop surfaces

**Files:**
- Modify: `frontend/components/desktop/SystemTray.tsx` (~line 196-205)
- Modify: `frontend/components/desktop/StartMenu.tsx` (connect MenuItem, ~line 268-275)
- Modify: `frontend/components/desktop/WalletBalloon.tsx` (~line 36-45)

**Interfaces:**
- Consumes: `StacksLogo` and `WALLET_CONNECT` (Task 1); the `ReactNode` icon props (Task 2).

- [ ] **Step 1: SystemTray — replace ▣ with the Stacks logo + add the tagline**

In `frontend/components/desktop/SystemTray.tsx`, add imports near the top:

```tsx
import { StacksLogo } from "@/components/shared/StacksLogo";
import { WALLET_CONNECT } from "@/lib/wallet-connect-copy";
```

Replace the connect button block (currently):

```tsx
            <button
              type="button"
              className="tray-wallet-button"
              onClick={connect}
              aria-label="Connect wallet"
              style={{ background: "none", border: "none", cursor: "default", fontSize: 11, fontFamily: "inherit" }}
            >
              <span className="tray-wallet-icon">▣</span>
              <span className="tray-wallet-label">Connect Wallet</span>
            </button>
```

with:

```tsx
            <button
              type="button"
              className="tray-wallet-button"
              onClick={connect}
              aria-label={`${WALLET_CONNECT.label} — ${WALLET_CONNECT.tagline}`}
              title={`${WALLET_CONNECT.label} — ${WALLET_CONNECT.tagline}`}
              style={{ background: "none", border: "none", cursor: "default", fontSize: 11, fontFamily: "inherit" }}
            >
              <span className="tray-wallet-icon"><StacksLogo size={14} /></span>
              <span className="tray-wallet-label">{WALLET_CONNECT.label}</span>
            </button>
```

- [ ] **Step 2: StartMenu — Stacks logo on the connect item**

In `frontend/components/desktop/StartMenu.tsx`, add the import near the top:

```tsx
import { StacksLogo } from "@/components/shared/StacksLogo";
```

In the `!address` branch, change the connect `MenuItem`:

```tsx
            <MenuItem
              icon={<StacksLogo size={18} />}
              label="Connect Wallet"
              onClick={() => {
                void useWallet.getState().connect();
                onClose();
              }}
            />
```

(Leave the "Disconnect Wallet" 🔌 item unchanged — that is a distinct action.)

- [ ] **Step 3: WalletBalloon — drop the fox, unify the copy**

In `frontend/components/desktop/WalletBalloon.tsx`, add the import:

```tsx
import { StacksLogo } from "@/components/shared/StacksLogo";
import { WALLET_CONNECT } from "@/lib/wallet-connect-copy";
```

Change the `<TrayBalloon …>` props:

```tsx
    <TrayBalloon
      icon={<StacksLogo size={18} />}
      title={WALLET_CONNECT.label}
      body="Save scores on-chain & mint NFTs"
      ctaLabel={WALLET_CONNECT.label}
      onCta={connect}
      onDismiss={dismiss}
      ariaLabel="Dismiss wallet reminder"
    />
```

(Removes `icon="🦊"`, `title="Connect your wallet"`, `ctaLabel="Connect Now"`.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run build && npx vitest run components/desktop`
Expected: tsc clean; build succeeds; desktop tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/desktop/SystemTray.tsx frontend/components/desktop/StartMenu.tsx frontend/components/desktop/WalletBalloon.tsx
git commit -m "feat(wallet): Stacks logo + unified copy on tray, start menu, balloon"
```

---

### Task 4: Apply Stacks logo + unified copy to window/dialog CTAs

**Files:**
- Modify: `frontend/components/shared/SharedMintDialog.tsx` (no-wallet branch, "Connect to Mint" button)
- Modify: `frontend/components/windows/MyNftsWindow.tsx` (the `!address` EmptyState)
- Modify: `frontend/components/windows/HighScoreWindow.tsx` (the `!address` connect button)

**Interfaces:**
- Consumes: `StacksLogo` (Task 1); `EmptyState` `icon` prop (Task 2).

- [ ] **Step 1: SharedMintDialog — icon on "Connect to Mint"**

In `frontend/components/shared/SharedMintDialog.tsx`, add the import (near the `GameOverSummary` import):

```tsx
import { StacksLogo } from "@/components/shared/StacksLogo";
```

In the `!address` branch, replace the connect button:

```tsx
            <button onClick={connect} style={SECONDARY_ACTION}>
              Connect to Mint
            </button>
```

with:

```tsx
            <button
              onClick={connect}
              style={{ ...SECONDARY_ACTION, display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <StacksLogo size={13} /> Connect to Mint
            </button>
```

- [ ] **Step 2: MyNftsWindow — Stacks logo in the EmptyState**

In `frontend/components/windows/MyNftsWindow.tsx`, add the import:

```tsx
import { StacksLogo } from "@/components/shared/StacksLogo";
```

Replace the `!address` EmptyState:

```tsx
        {!address && (
          <EmptyState
            emoji="💼"
            title="Connect your wallet"
            body="Connect to view your Score NFT collection and claim prizes."
            actionLabel="🔌 Connect Wallet"
            onAction={() => void connect()}
          />
        )}
```

with:

```tsx
        {!address && (
          <EmptyState
            icon={<StacksLogo size={40} />}
            title="Connect Wallet"
            body="Connect to view your Score NFT collection and claim prizes."
            actionLabel="Connect Wallet"
            onAction={() => void connect()}
          />
        )}
```

- [ ] **Step 3: HighScoreWindow — icon + cased label**

In `frontend/components/windows/HighScoreWindow.tsx`, add the import (near the existing `useWallet` import):

```tsx
import { StacksLogo } from "@/components/shared/StacksLogo";
```

Replace the connect button in the `claims.length === 0 && (!address ? …)` branch:

```tsx
              <button
                type="button"
                onClick={() => void useWallet.getState().connect()}
                style={{ marginTop: 3, justifySelf: "start", fontSize: 10 }}
              >
                🔌 Connect wallet to check prizes
              </button>
```

with:

```tsx
              <button
                type="button"
                onClick={() => void useWallet.getState().connect()}
                style={{ marginTop: 3, justifySelf: "start", fontSize: 10, display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <StacksLogo size={12} /> Connect to check prizes
              </button>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run build && npx vitest run`
Expected: tsc clean; build succeeds; full suite green (existing count + 2 from Task 1).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/shared/SharedMintDialog.tsx frontend/components/windows/MyNftsWindow.tsx frontend/components/windows/HighScoreWindow.tsx
git commit -m "feat(wallet): Stacks logo + cased labels on mint/NFT/high-score CTAs"
```

---

### Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full gate**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all tests pass; tsc clean; build succeeds.

- [ ] **Step 2: Playwright spot-check (desktop viewport)**

Start the dev server (if CSS/components look stale, stop and `rm -rf .next` then restart — known Turbopack persistent-cache gotcha). With a disconnected wallet, verify:
- The system-tray connect button shows the purple Stacks badge (no `▣`) and its tooltip reads "Connect Wallet — Save scores & claim prizes".
- The wallet balloon (auto-pops after ~3s) shows the Stacks badge, title "Connect Wallet", CTA "Connect Wallet" — **no 🦊 fox anywhere**.
- Open "My NFTs" while disconnected: the EmptyState shows the large Stacks badge, "Connect Wallet" title + button.
- `grep -rn "🦊" frontend/components` returns nothing (the fox is fully gone).

- [ ] **Step 3: Record outcome**

No commit. Report the gate output and spot-check observations.

---

## Self-Review

**Spec coverage:**
- §3 icon = Stacks logo, wallet-agnostic → Task 1 `StacksLogo`. ✓
- §3 contextual suffix labels allowed → Tasks 4 ("Connect to Mint", "Connect to check prizes"). ✓
- §4 StacksLogo + copy constant → Task 1. ✓ (badge form per Global Constraints, refined from the spec's currentColor note — recorded in this plan's constraints.)
- §5 all six surfaces → SystemTray/StartMenu/WalletBalloon (Task 3), MintDialog/MyNfts/HighScore (Task 4). ✓
- §5 wrapper icon-prop extensions (TrayBalloon, EmptyState) + the also-needed MenuItem → Task 2. ✓
- §7 testing (StacksLogo test, keep existing green, tsc, build, Playwright no-fox) → Tasks 1, 4, 5. ✓
- §8 non-goals → no connect()/balloon-timing/state edits in any task. ✓

**Placeholder scan:** No TBD/TODO; the Stacks SVG path is the real official STX mark; every code step shows complete code. ✓

**Type consistency:** `StacksLogo` props `{ size?, title?, style? }` consistent across Tasks 1/3/4; `WALLET_CONNECT.label`/`.tagline` used consistently; `icon: ReactNode` (TrayBalloon, MenuItem) and `EmptyState.icon?: ReactNode` defined in Task 2 and consumed in Tasks 3/4. ✓

**Note for executor:** The spec §4 mentioned `currentColor`; this plan deliberately uses the two-color **badge** form (purple circle + white mark) instead, for guaranteed contrast on both silver and dark surfaces — a refinement captured in Global Constraints. If a reviewer flags the divergence, it is intentional and pre-approved here.
