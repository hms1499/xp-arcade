# Aspirational Empty State ("Trophy Case") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bland "No NFTs yet" one-liner in the My NFTs window (connected, zero NFTs) with an aspirational Win95 "trophy case empty" empty state plus a "Play a game" CTA.

**Architecture:** A reusable presentational `EmptyState` component (emoji + title + body + optional action button) wired into the `nfts?.length === 0` branch of `MyNftsWindow`; the CTA opens the last-played game. No contract change, no new dependency.

**Tech Stack:** TypeScript, React 19, Next.js, Zustand 5, Vitest (jsdom, `renderToStaticMarkup`).

---

## File Structure

- `frontend/components/shared/EmptyState.tsx` — **create**. Presentational empty-state box.
- `frontend/components/shared/EmptyState.test.tsx` — **create**. Render tests.
- `frontend/components/windows/MyNftsWindow.tsx` — **modify**. Swap the zero-NFTs one-liner for `<EmptyState>`.

Reference (do not modify): `frontend/components/player/LevelBadge.tsx` (presentational
+ `renderToStaticMarkup` test pattern). `MyNftsWindow.tsx` already imports
`useWindows` (and uses `useWindows.getState().open(...)` at the player-profile link),
`GAME_IDS, GAMES, type GameId` from `@/lib/game-registry`. The desktop reads the
last-played game from `localStorage["xp-arcade:last-game"]`, validated with
`stored in GAMES`, defaulting to `"snake"` — mirror that read inline.

---

## Task 1: `EmptyState` presentational component

**Files:**
- Create: `frontend/components/shared/EmptyState.tsx`
- Test: `frontend/components/shared/EmptyState.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/components/shared/EmptyState.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyState } from "./EmptyState";

function noop() {}

describe("EmptyState", () => {
  it("renders emoji, title, and body", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        emoji="🏆"
        title="Trophy case empty"
        body="Mint your first score."
      />,
    );
    expect(html).toContain("🏆");
    expect(html).toContain("Trophy case empty");
    expect(html).toContain("Mint your first score.");
  });

  it("renders the action button when actionLabel and onAction are provided", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        emoji="🏆"
        title="t"
        body="b"
        actionLabel="Play a game"
        onAction={noop}
      />,
    );
    expect(html).toContain("Play a game");
    expect(html).toContain("<button");
  });

  it("renders no button when no action is provided", () => {
    const html = renderToStaticMarkup(
      <EmptyState emoji="🏆" title="t" body="b" />,
    );
    expect(html).not.toContain("<button");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npx vitest run components/shared/EmptyState.test.tsx`
Expected: FAIL — cannot resolve `./EmptyState`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/components/shared/EmptyState.tsx`:

```tsx
"use client";

export function EmptyState({
  emoji,
  title,
  body,
  actionLabel,
  onAction,
}: {
  emoji: string;
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
      <span aria-hidden="true" style={{ fontSize: 40, lineHeight: 1 }}>
        {emoji}
      </span>
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npx vitest run components/shared/EmptyState.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/shared/EmptyState.tsx frontend/components/shared/EmptyState.test.tsx
git commit -m "feat(shared): reusable EmptyState component"
```

---

## Task 2: Wire the trophy-case empty state into My NFTs

**Files:**
- Modify: `frontend/components/windows/MyNftsWindow.tsx`

- [ ] **Step 1: Add the import**

In `frontend/components/windows/MyNftsWindow.tsx`, add near the other component
imports (e.g. after the `@/state/...` imports):

```tsx
import { EmptyState } from "@/components/shared/EmptyState";
```

- [ ] **Step 2: Replace the zero-NFTs one-liner**

Find:

```tsx
        {nfts?.length === 0 && (
          <p className="text-sm text-gray-500">
            No NFTs yet. Play a game and mint a score!
          </p>
        )}
```

Replace with:

```tsx
        {nfts?.length === 0 && (
          <EmptyState
            emoji="🏆"
            title="Your trophy case is empty"
            body="Mint your first score to start your Score NFT collection."
            actionLabel="▶ Play a game"
            onAction={() => {
              const stored =
                typeof window !== "undefined"
                  ? localStorage.getItem("xp-arcade:last-game")
                  : null;
              const id = stored && stored in GAMES ? stored : "snake";
              useWindows.getState().open(`game-${id}`);
            }}
          />
        )}
```

(`GAMES` and `useWindows` are already imported in this file. `stored in GAMES`
validates the stored id; `useWindows.getState().open(...)` matches the existing
player-profile open call in this same file.)

- [ ] **Step 3: Verify typecheck passes**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npx tsc --noEmit`
Expected: clean (exit 0, no output).

- [ ] **Step 4: Verify lint passes**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/windows/MyNftsWindow.tsx
git commit -m "feat(mynfts): aspirational trophy-case empty state"
```

---

## Task 3: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npx tsc --noEmit`
Expected: clean, exit 0.

- [ ] **Step 2: Full test suite**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npm test`
Expected: all tests pass. Confirm the new `components/shared/EmptyState.test.tsx`
appears and passes.

- [ ] **Step 3: Lint**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit (only if Steps 1-3 produced fixes)**

If any step required a fix, commit it:

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add -A
git commit -m "chore(empty-state): typecheck + lint + full test pass"
```

If nothing changed, skip the commit. Do not claim done until all three commands are
green — paste their real output.

---

## Self-Review notes (for the implementer)

- **Spec coverage:** Task 1 = `EmptyState` component + tests (spec §3.1, §5). Task 2 =
  wiring into the `nfts?.length === 0` branch with the trophy-case copy + "Play a game"
  CTA (§2, §3.2, §4). Task 3 = verification (§5).
- **Type consistency:** `EmptyState` props
  `{ emoji: string; title: string; body: string; actionLabel?: string; onAction?: () => void }`
  are identical across component, tests, and the wiring call site. The action button
  renders only when both `actionLabel` and `onAction` are present.
- **CTA target:** opens `game-${id}` where `id = stored in GAMES ? stored : "snake"`
  read from `localStorage["xp-arcade:last-game"]` — the same key/guard the desktop
  uses. Does not auto-close the My NFTs window.
- **Scope discipline:** only the connected-zero-NFTs branch changes. The
  not-connected message, the loading skeleton, the filtered-empty "Clear filters" box,
  and all other windows are untouched.
- **No on-chain change:** nothing here touches `contract/` or any `.clar` file; no new
  dependency, no new asset.
