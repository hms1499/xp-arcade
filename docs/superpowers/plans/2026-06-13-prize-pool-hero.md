# Prize Pool Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the total season prize pool (STX across all games) plus the season countdown as a hero panel at the top of the desktop showcase, so new visitors immediately see real stakes + urgency.

**Architecture:** Two pure helpers (`sumPrizePoolUstx`, `isCountdownUrgent`) feed a presentational `PrizePoolHero` component rendered at the top of the existing `DesktopLeaderboardShowcase`; the duplicate countdown box is removed from the "Season Race" panel. No contract change, no new dependency.

**Tech Stack:** TypeScript, React 19, Next.js, Zustand 5, Vitest (jsdom, `renderToStaticMarkup`).

---

## File Structure

- `frontend/lib/leaderboard-showcase.ts` — **modify**. Add pure `sumPrizePoolUstx`.
- `frontend/lib/leaderboard-showcase.test.ts` — **modify**. Tests for `sumPrizePoolUstx`.
- `frontend/lib/season-countdown.ts` — **modify**. Add pure `isCountdownUrgent`.
- `frontend/lib/season-countdown.test.ts` — **modify**. Tests for `isCountdownUrgent`.
- `frontend/components/desktop/PrizePoolHero.tsx` — **create**. Presentational hero panel.
- `frontend/components/desktop/PrizePoolHero.test.tsx` — **create**. Render tests.
- `frontend/components/desktop/DesktopLeaderboardShowcase.tsx` — **modify**. Render hero at top; remove the countdown box from "Season Race"; clean the now-unused `formatCountdown` import.

Reference (do not modify): `lib/game-registry.ts` (`GameId`), `lib/season-countdown.ts` `Countdown` type + `formatCountdown`, `state/window-manager.ts` (`useWindows`). Pattern reference: `components/dialogs/WelcomeDialog.tsx` / `components/player/LevelBadge.tsx` (presentational + `renderToStaticMarkup` test).

---

## Task 1: `sumPrizePoolUstx` pure helper

**Files:**
- Modify: `frontend/lib/leaderboard-showcase.ts`
- Test: `frontend/lib/leaderboard-showcase.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `frontend/lib/leaderboard-showcase.test.ts`. Add `sumPrizePoolUstx` to the
existing import from `@/lib/leaderboard-showcase`, add a `GameId` type import, then add
the describe block:

```ts
import type { GameId } from "@/lib/game-registry";

// Keys are irrelevant to the sum; cast a plain object for the test.
function pools(obj: Record<string, number | null>) {
  return obj as Record<GameId, number | null>;
}

describe("sumPrizePoolUstx", () => {
  it("sums non-null pools", () => {
    expect(sumPrizePoolUstx(pools({ a: 1_000_000, b: 2_500_000 }))).toBe(3_500_000);
  });

  it("ignores null pools", () => {
    expect(sumPrizePoolUstx(pools({ a: 1_000_000, b: null }))).toBe(1_000_000);
  });

  it("returns null when every pool is null", () => {
    expect(sumPrizePoolUstx(pools({ a: null, b: null }))).toBe(null);
  });
});
```

(Add `sumPrizePoolUstx` to the existing `import { ... } from "@/lib/leaderboard-showcase";`
line at the top of the test file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npx vitest run lib/leaderboard-showcase.test.ts`
Expected: FAIL — `sumPrizePoolUstx` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `frontend/lib/leaderboard-showcase.ts`, ensure `GameId` is imported from
`./game-registry` (add it to the existing import if not present), then add:

```ts
/**
 * Total prize pool across all games, in uStx. Ignores games whose pool is still
 * unknown (null). Returns null only when every game's pool is unknown (loading).
 */
export function sumPrizePoolUstx(
  pools: Record<GameId, number | null>,
): number | null {
  const vals = Object.values(pools).filter((v): v is number => v !== null);
  return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npx vitest run lib/leaderboard-showcase.test.ts`
Expected: PASS (existing tests + 3 new).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/leaderboard-showcase.ts frontend/lib/leaderboard-showcase.test.ts
git commit -m "feat(showcase): sumPrizePoolUstx helper"
```

---

## Task 2: `isCountdownUrgent` pure helper

**Files:**
- Modify: `frontend/lib/season-countdown.ts`
- Test: `frontend/lib/season-countdown.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `frontend/lib/season-countdown.test.ts`. Add `isCountdownUrgent` (and the
`Countdown` type if not already imported) to the existing import from
`@/lib/season-countdown`, then add:

```ts
describe("isCountdownUrgent", () => {
  it("is false for a multi-day live countdown", () => {
    expect(
      isCountdownUrgent({
        state: "live",
        endsAt: new Date(),
        days: 3,
        hours: 0,
        minutes: 0,
        seconds: 0,
      }),
    ).toBe(false);
  });

  it("is true for a same-day live countdown", () => {
    expect(
      isCountdownUrgent({
        state: "live",
        endsAt: new Date(),
        days: 0,
        hours: 5,
        minutes: 0,
        seconds: 0,
      }),
    ).toBe(true);
  });

  it("is true when the deadline is reached", () => {
    expect(
      isCountdownUrgent({ state: "reached", endsAt: new Date(), endBlock: 100 }),
    ).toBe(true);
  });

  it("is true when the iso deadline expired", () => {
    expect(isCountdownUrgent({ state: "iso-expired", endsAt: new Date() })).toBe(true);
  });

  it("is false while loading or unset", () => {
    expect(isCountdownUrgent({ state: "loading" })).toBe(false);
    expect(isCountdownUrgent({ state: "unset" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npx vitest run lib/season-countdown.test.ts`
Expected: FAIL — `isCountdownUrgent` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `frontend/lib/season-countdown.ts`, add (e.g. just after `formatCountdown`):

```ts
/** True when the season deadline warrants a red, attention-grabbing treatment. */
export function isCountdownUrgent(c: Countdown): boolean {
  return (
    c.state === "reached" ||
    c.state === "iso-expired" ||
    (c.state === "live" && c.days === 0)
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npx vitest run lib/season-countdown.test.ts`
Expected: PASS (existing tests + 5 new).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/season-countdown.ts frontend/lib/season-countdown.test.ts
git commit -m "feat(countdown): isCountdownUrgent helper"
```

---

## Task 3: `PrizePoolHero` component

**Files:**
- Create: `frontend/components/desktop/PrizePoolHero.tsx`
- Test: `frontend/components/desktop/PrizePoolHero.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/components/desktop/PrizePoolHero.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PrizePoolHero } from "./PrizePoolHero";
import type { Countdown } from "@/lib/season-countdown";

const liveFar: Countdown = {
  state: "live",
  endsAt: new Date(),
  days: 6,
  hours: 4,
  minutes: 12,
  seconds: 0,
};
const liveSoon: Countdown = {
  state: "live",
  endsAt: new Date(),
  days: 0,
  hours: 3,
  minutes: 0,
  seconds: 0,
};

describe("PrizePoolHero", () => {
  it("renders the total pool in STX and the game count", () => {
    const html = renderToStaticMarkup(
      <PrizePoolHero totalUstx={12_450_000} gameCount={5} countdown={liveFar} />,
    );
    expect(html).toContain("12.45 STX");
    expect(html).toContain("across 5 games");
  });

  it("shows Loading… when the total is null", () => {
    const html = renderToStaticMarkup(
      <PrizePoolHero totalUstx={null} gameCount={5} countdown={liveFar} />,
    );
    expect(html).toContain("Loading…");
  });

  it("renders the countdown text for a live deadline", () => {
    const html = renderToStaticMarkup(
      <PrizePoolHero totalUstx={1_000_000} gameCount={5} countdown={liveFar} />,
    );
    expect(html).toContain("ends in");
    expect(html).toContain("6d 04h 12m");
  });

  it("uses the urgent red color for a same-day deadline", () => {
    const html = renderToStaticMarkup(
      <PrizePoolHero totalUstx={1_000_000} gameCount={5} countdown={liveSoon} />,
    );
    expect(html).toContain("#cc0000");
  });

  it("does not use urgent red for a multi-day deadline", () => {
    const html = renderToStaticMarkup(
      <PrizePoolHero totalUstx={1_000_000} gameCount={5} countdown={liveFar} />,
    );
    expect(html).not.toContain("#cc0000");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npx vitest run components/desktop/PrizePoolHero.test.tsx`
Expected: FAIL — cannot resolve `./PrizePoolHero`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/components/desktop/PrizePoolHero.tsx`:

```tsx
"use client";

import { useWindows } from "@/state/window-manager";
import {
  formatCountdown,
  isCountdownUrgent,
  type Countdown,
} from "@/lib/season-countdown";

export function PrizePoolHero({
  totalUstx,
  gameCount,
  countdown,
}: {
  totalUstx: number | null;
  gameCount: number;
  countdown: Countdown;
}) {
  const open = useWindows((s) => s.open);
  const urgent = isCountdownUrgent(countdown);
  const countdownText = formatCountdown(countdown);

  return (
    <section
      style={{
        width: 300,
        background: "#c0c0c0",
        border: "2px solid",
        borderColor: "#ffffff #808080 #808080 #ffffff",
        boxShadow: "2px 2px 0 #000000",
        fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
        fontSize: 11,
      }}
    >
      <div
        style={{
          background: "linear-gradient(90deg, #000080, #1084d0)",
          color: "#ffffff",
          fontWeight: "bold",
          padding: "3px 6px",
        }}
      >
        💰 Prize Pool (this season)
      </div>
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => open("highscore")}
        style={{
          width: "100%",
          display: "grid",
          gap: 3,
          padding: "10px 8px",
          textAlign: "center",
        }}
        title="Open High Scores"
      >
        <span style={{ fontSize: 26, fontWeight: "bold", color: "#000080" }}>
          {totalUstx === null
            ? "Loading…"
            : `${(totalUstx / 1_000_000).toFixed(2)} STX`}
        </span>
        <span style={{ color: "#555" }}>up for grabs across {gameCount} games</span>
        {countdownText && (
          <span
            style={{
              fontFamily: "monospace",
              fontWeight: urgent ? "bold" : "normal",
              color: urgent ? "#cc0000" : "#000080",
            }}
          >
            ⏳ {countdown.state === "live" ? `ends in ${countdownText}` : countdownText}
          </span>
        )}
      </button>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npx vitest run components/desktop/PrizePoolHero.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/desktop/PrizePoolHero.tsx frontend/components/desktop/PrizePoolHero.test.tsx
git commit -m "feat(showcase): PrizePoolHero panel component"
```

---

## Task 4: Wire the hero into the showcase + remove the duplicate countdown

**Files:**
- Modify: `frontend/components/desktop/DesktopLeaderboardShowcase.tsx`

- [ ] **Step 1: Add `sumPrizePoolUstx` to the leaderboard-showcase import**

Find (lines ~5-10):

```tsx
import {
  scoreCardImage,
  shortPlayer,
  type LeaderboardSummary,
  type RankedEntry,
} from "@/lib/leaderboard-showcase";
```

Replace with:

```tsx
import {
  scoreCardImage,
  shortPlayer,
  sumPrizePoolUstx,
  type LeaderboardSummary,
  type RankedEntry,
} from "@/lib/leaderboard-showcase";
```

- [ ] **Step 2: Drop the now-unused `formatCountdown` import**

Find (line ~11):

```tsx
import { formatCountdown, useSeasonCountdown } from "@/lib/season-countdown";
```

Replace with:

```tsx
import { useSeasonCountdown } from "@/lib/season-countdown";
```

- [ ] **Step 3: Import the hero component**

Add after the `useWindows` import (line ~13):

```tsx
import { PrizePoolHero } from "./PrizePoolHero";
```

- [ ] **Step 4: Render the hero at the top of the showcase stack**

Find the opening of the showcase column and the first section (lines ~85-101):

```tsx
    <div
      className="desktop-showcase"
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        alignItems: "flex-end",
        pointerEvents: "auto",
      }}
    >
      <section style={panelStyle()}>
        <PanelTitle>
          <span>🏆 Hall of Fame</span>
```

Insert the hero between the opening `<div ...>` and the first `<section>`:

```tsx
      pointerEvents: "auto",
      }}
    >
      <PrizePoolHero
        totalUstx={sumPrizePoolUstx(poolsByGame)}
        gameCount={GAME_IDS.length}
        countdown={countdown}
      />
      <section style={panelStyle()}>
        <PanelTitle>
          <span>🏆 Hall of Fame</span>
```

(Only the `<PrizePoolHero .../>` block is new — insert it immediately before the first
`<section style={panelStyle()}>`.)

- [ ] **Step 5: Remove the duplicate countdown box from the "Season Race" panel**

Find this block inside the "Season Race" section body (lines ~156-177):

```tsx
          <div
            style={{
              border: "2px inset #dfdfdf",
              background: "#ffffff",
              padding: 6,
              fontFamily: "monospace",
              fontSize: 12,
              color:
                countdown.state === "iso-expired" || countdown.state === "reached"
                  ? "#cc0000"
                  : "#000080",
              textAlign: "center",
            }}
          >
            {countdown.state === "loading"
              ? "Loading deadline…"
              : countdown.state === "unset"
                ? "No display deadline set"
                : countdown.state === "reached"
                  ? formatCountdown(countdown)
                  : `Soft deadline ${formatCountdown(countdown)}`}
          </div>
```

Delete it entirely. The surrounding `<div style={{ padding: 7, display: "grid", gap: 6 }}>`
and the `{GAME_IDS.map(...)}` per-game table that follow it stay unchanged.

- [ ] **Step 6: Verify typecheck passes**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npx tsc --noEmit`
Expected: clean (exit 0, no output). (If `tsc` flags `countdown` or `formatCountdown`
as unused, re-check Steps 2 and 5 — `countdown` must still be passed to the hero, and
`formatCountdown` must no longer be imported here.)

- [ ] **Step 7: Verify lint passes**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npm run lint`
Expected: no errors (catches any leftover unused import).

- [ ] **Step 8: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/desktop/DesktopLeaderboardShowcase.tsx
git commit -m "feat(showcase): prize pool hero on top, dedupe countdown"
```

---

## Task 5: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npx tsc --noEmit`
Expected: clean, exit 0.

- [ ] **Step 2: Full test suite**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npm test`
Expected: all tests pass. Confirm the new `PrizePoolHero.test.tsx` and the added
`sumPrizePoolUstx` / `isCountdownUrgent` tests appear and pass.

- [ ] **Step 3: Lint**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit (only if Steps 1-3 produced fixes)**

If any step required a fix, commit it:

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add -A
git commit -m "chore(prize-hero): typecheck + lint + full test pass"
```

If nothing changed, skip the commit. Do not claim done until all three commands are
green — paste their real output.

---

## Self-Review notes (for the implementer)

- **Spec coverage:** Task 1 = `sumPrizePoolUstx` (spec §3.1, §5). Task 2 =
  `isCountdownUrgent` (§3.2, §5). Task 3 = `PrizePoolHero` component (§3.3, §4, §5).
  Task 4 = wiring + countdown dedup (§3.4, §2). Task 5 = verification (§5).
- **Type consistency:** `sumPrizePoolUstx(pools: Record<GameId, number | null>): number | null`;
  `isCountdownUrgent(c: Countdown): boolean`; `PrizePoolHero` props
  `{ totalUstx: number | null; gameCount: number; countdown: Countdown }` — identical
  across module, tests, component, and the wiring call site.
- **No duplication / lint trap:** after Task 4, `formatCountdown` is imported only
  inside `PrizePoolHero.tsx`, not in the showcase; `countdown` (from
  `useSeasonCountdown("snake")`) is still used — it now feeds the hero. Steps 6-7
  explicitly catch a stale import.
- **Countdown copy:** for `live` the hero prefixes "ends in " (e.g. "ends in 6d 04h
  12m"); for `reached` / `iso-expired`, `formatCountdown` already returns a full
  sentence, shown as-is; for `loading` / `unset` it returns "" and the countdown line
  is not rendered.
- **No on-chain change:** nothing here touches `contract/` or any `.clar` file; no new
  dependency, no new asset.
