# First-Run Welcome Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-time, on-brand Windows-95 Welcome dialog that frames the play → mint → climb-the-prize-pool loop for first-time visitors, re-openable from the Start Menu.

**Architecture:** A pure `lib/welcome.ts` storage module (localStorage gate) + a focused `state/welcome.ts` Zustand store (open/close) + a presentational `WelcomeDialog` component, wired into the existing `Desktop` (auto-open once after boot) and `StartMenu` (re-open). No contract change.

**Tech Stack:** TypeScript, React 19, Next.js, Zustand 5, Vitest (jsdom, `renderToStaticMarkup` for static render assertions — the repo's component-test convention; `@testing-library/react` is intentionally **not** installed, so no DOM click tests).

---

## File Structure

- `frontend/lib/welcome.ts` — **create**. Pure localStorage gate: `WELCOME_STORAGE_KEY`, `hasSeenWelcome()`, `markWelcomeSeen()`. SSR-safe.
- `frontend/lib/welcome.test.ts` — **create**. Unit tests for the gate.
- `frontend/state/welcome.ts` — **create**. Zustand store `{ isOpen, open, close }`.
- `frontend/state/welcome.test.ts` — **create**. Store transition tests.
- `frontend/components/dialogs/WelcomeDialog.tsx` — **create**. Presentational dialog, props `{ onPlay, onClose }`.
- `frontend/components/dialogs/WelcomeDialog.test.tsx` — **create**. Render + click tests.
- `frontend/components/desktop/Desktop.tsx` — **modify**. Mount dialog, auto-open once, wire Play/close.
- `frontend/components/desktop/StartMenu.tsx` — **modify**. Add a "Welcome" menu item.

Reference (do not modify): `frontend/components/dialogs/AboutDialog.tsx` (Win95 dialog markup pattern), `frontend/lib/game-registry.ts` (`GAMES`, `GameId`), `frontend/state/wallet.ts` (Zustand store pattern), `frontend/state/mint-tx.ts` + `frontend/state/mint-tx.test.ts` (store + store-test pattern). The desktop already tracks `lastGame` and the boot gate already renders the desktop only after the boot fade.

---

## Task 1: Pure localStorage gate module

**Files:**
- Create: `frontend/lib/welcome.ts`
- Test: `frontend/lib/welcome.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/welcome.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  WELCOME_STORAGE_KEY,
  hasSeenWelcome,
  markWelcomeSeen,
} from "@/lib/welcome";

describe("welcome gate", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("exposes the storage key", () => {
    expect(WELCOME_STORAGE_KEY).toBe("xp-arcade:welcomed");
  });

  it("hasSeenWelcome is false when the flag is unset", () => {
    expect(hasSeenWelcome()).toBe(false);
  });

  it("markWelcomeSeen writes '1' under the key", () => {
    markWelcomeSeen();
    expect(window.localStorage.getItem(WELCOME_STORAGE_KEY)).toBe("1");
  });

  it("hasSeenWelcome is true after markWelcomeSeen", () => {
    markWelcomeSeen();
    expect(hasSeenWelcome()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/welcome.test.ts`
Expected: FAIL — cannot resolve module `@/lib/welcome`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/lib/welcome.ts`:

```ts
export const WELCOME_STORAGE_KEY = "xp-arcade:welcomed";

// SSR / blocked-storage default is "already seen" so we never auto-pop where a
// dismissal cannot be persisted.
export function hasSeenWelcome(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(WELCOME_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markWelcomeSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WELCOME_STORAGE_KEY, "1");
  } catch {
    /* storage blocked → no-op */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/welcome.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/welcome.ts frontend/lib/welcome.test.ts
git commit -m "feat(welcome): localStorage gate module"
```

---

## Task 2: Welcome Zustand store

**Files:**
- Create: `frontend/state/welcome.ts`
- Test: `frontend/state/welcome.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/state/welcome.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useWelcome } from "@/state/welcome";

describe("useWelcome store", () => {
  beforeEach(() => {
    useWelcome.setState({ isOpen: false });
  });

  it("starts closed", () => {
    expect(useWelcome.getState().isOpen).toBe(false);
  });

  it("open() sets isOpen true", () => {
    useWelcome.getState().open();
    expect(useWelcome.getState().isOpen).toBe(true);
  });

  it("close() sets isOpen false", () => {
    useWelcome.getState().open();
    useWelcome.getState().close();
    expect(useWelcome.getState().isOpen).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run state/welcome.test.ts`
Expected: FAIL — cannot resolve module `@/state/welcome`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/state/welcome.ts`:

```ts
import { create } from "zustand";

type WelcomeState = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

export const useWelcome = create<WelcomeState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run state/welcome.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/state/welcome.ts frontend/state/welcome.test.ts
git commit -m "feat(welcome): open/close Zustand store"
```

---

## Task 3: WelcomeDialog — static render (content)

**Files:**
- Create: `frontend/components/dialogs/WelcomeDialog.tsx`
- Test: `frontend/components/dialogs/WelcomeDialog.test.tsx`

This task builds the dialog markup and asserts its content with
`renderToStaticMarkup`. Task 4 adds the click-behavior tests.

- [ ] **Step 1: Write the failing test**

Create `frontend/components/dialogs/WelcomeDialog.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WelcomeDialog } from "./WelcomeDialog";

function noop() {}

describe("WelcomeDialog content", () => {
  it("renders the title and tagline", () => {
    const html = renderToStaticMarkup(
      <WelcomeDialog onPlay={noop} onClose={noop} />,
    );
    expect(html).toContain("Welcome to XP Arcade");
    expect(html).toContain("STX prize pool");
  });

  it("renders the three steps", () => {
    const html = renderToStaticMarkup(
      <WelcomeDialog onPlay={noop} onClose={noop} />,
    );
    expect(html).toContain("PLAY");
    expect(html).toContain("MINT");
    expect(html).toContain("CLIMB");
  });

  it("renders both footer actions", () => {
    const html = renderToStaticMarkup(
      <WelcomeDialog onPlay={noop} onClose={noop} />,
    );
    expect(html).toContain("Maybe later");
    expect(html).toContain("Play Now");
  });

  it("renders the no-wallet friction-reducer line", () => {
    const html = renderToStaticMarkup(
      <WelcomeDialog onPlay={noop} onClose={noop} />,
    );
    expect(html).toContain("No wallet needed to play");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run components/dialogs/WelcomeDialog.test.tsx`
Expected: FAIL — cannot resolve `./WelcomeDialog`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/components/dialogs/WelcomeDialog.tsx`:

```tsx
"use client";

const STEPS: { n: number; emoji: string; label: string; body: string }[] = [
  { n: 1, emoji: "🎯", label: "PLAY", body: "5 retro games" },
  { n: 2, emoji: "💾", label: "MINT", body: "your score as a Score NFT" },
  {
    n: 3,
    emoji: "🏆",
    label: "CLIMB",
    body: "the on-chain top-10 & split the STX prize pool",
  },
];

export function WelcomeDialog({
  onPlay,
  onClose,
}: {
  onPlay: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="window"
      role="dialog"
      aria-label="Welcome to XP Arcade"
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 360,
        zIndex: 1000,
      }}
    >
      <div className="title-bar">
        <div className="title-bar-text">🎮 Welcome to XP Arcade</div>
        <div className="title-bar-controls">
          <button aria-label="Close" onClick={onClose} />
        </div>
      </div>
      <div className="window-body" style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 44, lineHeight: 1 }}>🕹️</span>
          <p style={{ fontSize: 12, margin: 0, lineHeight: 1.4 }}>
            A Windows 95 arcade where your scores become NFTs — and top players
            split a real STX prize pool each season.
          </p>
        </div>

        <ol
          style={{
            listStyle: "none",
            margin: "0 0 12px",
            padding: "8px 10px",
            border: "1px solid #808080",
            borderRightColor: "#ffffff",
            borderBottomColor: "#ffffff",
            background: "#ffffff",
            display: "grid",
            gap: 6,
            fontSize: 11,
          }}
        >
          {STEPS.map((step) => (
            <li key={step.n} style={{ display: "flex", gap: 6 }}>
              <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>
                {step.n}. {step.emoji} {step.label}
              </span>
              <span style={{ color: "#444" }}>{step.body}</span>
            </li>
          ))}
        </ol>

        <p style={{ fontSize: 10, color: "#666", margin: "0 0 14px" }}>
          No wallet needed to play — connect only when you want to mint.
        </p>

        <div
          style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}
        >
          <button type="button" onClick={onClose}>
            Maybe later
          </button>
          <button
            type="button"
            className="default"
            onClick={onPlay}
            style={{ fontWeight: "bold" }}
          >
            ▶ Play Now
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run components/dialogs/WelcomeDialog.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/dialogs/WelcomeDialog.tsx frontend/components/dialogs/WelcomeDialog.test.tsx
git commit -m "feat(welcome): WelcomeDialog presentational component"
```

---

## Task 4: Mount the dialog in Desktop + auto-open once

**Files:**
- Modify: `frontend/components/desktop/Desktop.tsx`

`Desktop.tsx` already imports React hooks and owns `lastGame` plus the `open`
window action. We add: imports, an auto-open effect, the Play/close handlers, and
the `<WelcomeDialog>` render.

- [ ] **Step 1: Add imports**

In `frontend/components/desktop/Desktop.tsx`, find the existing import block. After
this line:

```tsx
import { useToasts } from "@/state/toasts";
```

add:

```tsx
import { WelcomeDialog } from "@/components/dialogs/WelcomeDialog";
import { useWelcome } from "@/state/welcome";
import { hasSeenWelcome, markWelcomeSeen } from "@/lib/welcome";
```

- [ ] **Step 2: Wire store selectors + auto-open effect**

Inside the `Desktop` component body, find:

```tsx
  const open = useWindows((s) => s.open);
  const leaderboard = useLeaderboardShowcase();
```

Insert the welcome wiring immediately after the `leaderboard` line:

```tsx
  const welcomeOpen = useWelcome((s) => s.isOpen);
  const openWelcome = useWelcome((s) => s.open);
  const closeWelcome = useWelcome((s) => s.close);

  useEffect(() => {
    if (!hasSeenWelcome()) openWelcome();
  }, [openWelcome]);

  const dismissWelcome = () => {
    markWelcomeSeen();
    closeWelcome();
  };
```

- [ ] **Step 3: Render the dialog**

Find the closing of the desktop tree — the `{children}` line followed by the
`<Taskbar ... />`:

```tsx
      {children}
      <Taskbar leaderboardSummaries={leaderboard.summaries} />
    </div>
```

Insert the dialog render between `{children}` and `<Taskbar>`:

```tsx
      {children}
      {welcomeOpen && (
        <WelcomeDialog
          onPlay={() => {
            dismissWelcome();
            open(`game-${lastGame ?? "snake"}`);
          }}
          onClose={dismissWelcome}
        />
      )}
      <Taskbar leaderboardSummaries={leaderboard.summaries} />
    </div>
```

- [ ] **Step 4: Verify typecheck passes**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean (exit 0, no output).

- [ ] **Step 5: Verify the existing suite still passes**

Run: `cd frontend && npx vitest run lib/welcome.test.ts state/welcome.test.ts components/dialogs/WelcomeDialog.test.tsx`
Expected: PASS (all welcome tests still green).

- [ ] **Step 6: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/desktop/Desktop.tsx
git commit -m "feat(welcome): auto-open dialog once after boot"
```

---

## Task 5: Add a "Welcome" item to the Start Menu

**Files:**
- Modify: `frontend/components/desktop/StartMenu.tsx`

`StartMenu.tsx` already renders `MenuItem`s and has an "About XP Arcade" item. We
add a "Welcome" item that re-opens the dialog via the store (without clearing the
gate flag).

- [ ] **Step 1: Add the import**

In `frontend/components/desktop/StartMenu.tsx`, after this line:

```tsx
import { DESKTOP_THEMES, useDesktopTheme } from "@/state/desktop-theme";
```

add:

```tsx
import { useWelcome } from "@/state/welcome";
```

- [ ] **Step 2: Add the "Welcome" menu item**

Find the existing "About XP Arcade" item:

```tsx
          <MenuItem
            icon="ℹ️"
            label="About XP Arcade"
            onClick={() => setShowAbout(true)}
          />
```

Insert a "Welcome" item immediately before it:

```tsx
          <MenuItem
            icon="👋"
            label="Welcome"
            onClick={() => {
              useWelcome.getState().open();
              onClose();
            }}
          />
          <MenuItem
            icon="ℹ️"
            label="About XP Arcade"
            onClick={() => setShowAbout(true)}
          />
```

- [ ] **Step 3: Verify typecheck passes**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean (exit 0, no output).

- [ ] **Step 4: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/desktop/StartMenu.tsx
git commit -m "feat(welcome): re-open from Start Menu"
```

---

## Task 6: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean, exit 0.

- [ ] **Step 2: Full test suite**

Run: `cd frontend && npm test`
Expected: all tests pass. Confirm the three new files appear and pass:
`lib/welcome.test.ts`, `state/welcome.test.ts`,
`components/dialogs/WelcomeDialog.test.tsx`.

- [ ] **Step 3: Lint**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit (only if Steps 1-3 produced fixes)**

If any step required a fix, commit it:

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add -A
git commit -m "chore(welcome): typecheck + lint + full test pass"
```

If nothing changed, skip the commit. Do not claim done until all three commands are
green — paste their real output.

---

## Self-Review notes (for the implementer)

- **Spec coverage:** Task 1 = `lib/welcome.ts` gate (spec §3.1, §5). Task 2 =
  `state/welcome.ts` store (§3.2, §5). Task 3 = `WelcomeDialog` content (§4, §5);
  click behavior is covered by the trivial `onClick={onPlay/onClose}` wiring +
  static-render assertions, matching the repo's `renderToStaticMarkup`-only
  component-test convention (no `@testing-library/react`). Task 4 = Desktop
  auto-open + gating flow (§3, §3.3). Task 5 = Start Menu re-access (§2, §3).
  Task 6 = verification (§5).
- **Type consistency:** `WELCOME_STORAGE_KEY`, `hasSeenWelcome()`,
  `markWelcomeSeen()` (lib); `useWelcome` with `{ isOpen, open, close }` (store);
  `WelcomeDialog` props `{ onPlay, onClose }` — identical across module, store,
  component, and both wiring sites.
- **Gating flow:** auto-open only when `!hasSeenWelcome()`; every dismissal path
  (X, "Maybe later", "Play Now") routes through `dismissWelcome()` →
  `markWelcomeSeen()` + `close()`. Start Menu `open()` does not clear the flag, so
  re-opening then closing re-marks (idempotent).
- **No on-chain change:** nothing here touches `contract/` or any `.clar` file; no
  new public contract functions.
- **AboutDialog untouched:** the technical About box stays separate from onboarding.
