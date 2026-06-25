# Game-Over Mint Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the game-over portion of `SharedMintDialog` so the story score → projected rank → mint reads top-to-bottom, with tiered Win95-appropriate milestone feedback.

**Architecture:** Extract a presentational `GameOverSummary` (the hero zone: milestone banner + large score + projected rank + personal-best line) driven by a pure `gameOverMilestone` tier helper. `SharedMintDialog` swaps its top section for `GameOverSummary`, relocates fee/risk/mints into a demoted details block below the actions, and makes Mint the primary button. No contract, wallet, or tx-logic changes.

**Tech Stack:** Next.js 16 / React 19, TypeScript, `98.css`, Zustand, Vitest (jsdom + `renderToStaticMarkup` for component tests). Spec: `docs/superpowers/specs/2026-06-25-game-over-mint-polish-design.md`.

## Global Constraints

- Path must not contain spaces — keep `Desktop/xp-snake/`.
- `.clar`/contract untouched; this is frontend-only.
- Respect reduced-motion (reuse existing `.champion-*` keyframe guards) and sound-mute (`playSuccess()` already checks `isSoundMuted()`).
- Tier B (personal best, not top-10) is **fully silent** — no sound, no confetti.
- Component tests use `renderToStaticMarkup` from `react-dom/server` (effects do NOT run); test effect-driven behavior via the pure helper instead.
- Commit conventions: conventional prefixes, small green commits, stage explicit files, **no `Co-Authored-By`**. Commit each task only after tests/tsc are green.
- Run all commands from `frontend/`.

---

### Task 1: Pure milestone tier helper

**Files:**
- Create: `frontend/lib/game-over-milestone.ts`
- Test: `frontend/lib/game-over-milestone.test.ts`

**Interfaces:**
- Produces:
  - `type MilestoneTier = "leaderboard" | "personal-best" | "none"`
  - `type GameOverMilestone = { tier: MilestoneTier; celebrate: boolean; sound: boolean; confetti: boolean }`
  - `function gameOverMilestone(input: { isTopScore: boolean; isNewRecord: boolean }): GameOverMilestone`

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/game-over-milestone.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { gameOverMilestone } from "./game-over-milestone";

describe("gameOverMilestone", () => {
  it("leaderboard tier celebrates with sound and confetti", () => {
    expect(gameOverMilestone({ isTopScore: true, isNewRecord: true })).toEqual({
      tier: "leaderboard",
      celebrate: true,
      sound: true,
      confetti: true,
    });
  });

  it("top-10 takes precedence even when not a personal best", () => {
    expect(
      gameOverMilestone({ isTopScore: true, isNewRecord: false }).tier,
    ).toBe("leaderboard");
  });

  it("personal best (not top-10) celebrates silently", () => {
    expect(
      gameOverMilestone({ isTopScore: false, isNewRecord: true }),
    ).toEqual({
      tier: "personal-best",
      celebrate: true,
      sound: false,
      confetti: false,
    });
  });

  it("normal run has no celebration", () => {
    expect(
      gameOverMilestone({ isTopScore: false, isNewRecord: false }),
    ).toEqual({
      tier: "none",
      celebrate: false,
      sound: false,
      confetti: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/game-over-milestone.test.ts`
Expected: FAIL — cannot resolve `./game-over-milestone`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/lib/game-over-milestone.ts`:

```ts
export type MilestoneTier = "leaderboard" | "personal-best" | "none";

export type GameOverMilestone = {
  tier: MilestoneTier;
  celebrate: boolean;
  sound: boolean;
  confetti: boolean;
};

/**
 * Decides the game-over celebration tier from data already computed by
 * useGameSession (`isTopScore`) and recordScore (`isNewRecord`). Top-10 wins
 * over a plain personal best; a personal best that misses top-10 is celebrated
 * silently (no sound, no confetti).
 */
export function gameOverMilestone({
  isTopScore,
  isNewRecord,
}: {
  isTopScore: boolean;
  isNewRecord: boolean;
}): GameOverMilestone {
  if (isTopScore) {
    return { tier: "leaderboard", celebrate: true, sound: true, confetti: true };
  }
  if (isNewRecord) {
    return {
      tier: "personal-best",
      celebrate: true,
      sound: false,
      confetti: false,
    };
  }
  return { tier: "none", celebrate: false, sound: false, confetti: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/game-over-milestone.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/game-over-milestone.ts frontend/lib/game-over-milestone.test.ts
git commit -m "feat(game-over): pure milestone tier helper"
```

---

### Task 2: GameOverSummary component

**Files:**
- Create: `frontend/components/shared/GameOverSummary.tsx`
- Test: `frontend/components/shared/GameOverSummary.test.tsx`

**Interfaces:**
- Consumes: `gameOverMilestone` (Task 1); `LeaderboardGoal` from `@/lib/leaderboard-showcase` (`{ tone: "success"|"info"|"warning"; primary: string; secondary: string; rank?: number; pointsNeeded?: number; topTenReady: boolean }`); `formatScore(gameId, score)` from `@/lib/score-format`; `playSuccess()` from `@/lib/sounds`; `GAMES` / `GameId` from `@/lib/game-registry`.
- Produces:
  - `function GameOverSummary(props: { gameId: GameId; score: number; isTopScore: boolean; isNewRecord: boolean; best: number; goal: LeaderboardGoal | null }): JSX.Element`
  - Renders CSS classes `gameover-banner` and `gameover-confetti` (styled in Task 3).

- [ ] **Step 1: Write the failing test**

Create `frontend/components/shared/GameOverSummary.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameOverSummary } from "./GameOverSummary";
import type { LeaderboardGoal } from "@/lib/leaderboard-showcase";

const goalRanked: LeaderboardGoal = {
  tone: "success",
  primary: "Mint to publish this score around rank #4.",
  secondary: "This score is leaderboard-ready.",
  rank: 4,
  topTenReady: true,
};

const goalShort: LeaderboardGoal = {
  tone: "warning",
  primary: "Mint as a collectible score NFT.",
  secondary: "Needs 120 to beat #10 (8,540).",
  topTenReady: false,
};

describe("GameOverSummary", () => {
  it("Tier A (top-10) shows the high-score banner, confetti, and rank", () => {
    const html = renderToStaticMarkup(
      <GameOverSummary
        gameId="snake"
        score={8420}
        isTopScore
        isNewRecord
        best={8420}
        goal={goalRanked}
      />,
    );
    expect(html).toContain("NEW HIGH SCORE");
    expect(html).toContain("gameover-confetti");
    expect(html).toContain("Will rank #4");
  });

  it("Tier B (personal best, not top-10) is silent: no banner, no confetti", () => {
    const html = renderToStaticMarkup(
      <GameOverSummary
        gameId="snake"
        score={500}
        isTopScore={false}
        isNewRecord
        best={500}
        goal={goalShort}
      />,
    );
    expect(html).toContain("New personal best");
    expect(html).not.toContain("NEW HIGH SCORE");
    expect(html).not.toContain("gameover-confetti");
    expect(html).toContain("Needs 120 to beat #10");
  });

  it("Tier C (normal) shows the prior personal best and no celebration", () => {
    const html = renderToStaticMarkup(
      <GameOverSummary
        gameId="snake"
        score={120}
        isTopScore={false}
        isNewRecord={false}
        best={9000}
        goal={goalShort}
      />,
    );
    expect(html).toContain("Personal best:");
    expect(html).not.toContain("NEW HIGH SCORE");
    expect(html).not.toContain("New personal best");
  });

  it("shows a loading placeholder while goal is null", () => {
    const html = renderToStaticMarkup(
      <GameOverSummary
        gameId="snake"
        score={120}
        isTopScore={false}
        isNewRecord={false}
        best={9000}
        goal={null}
      />,
    );
    expect(html).toContain("Checking the board");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/shared/GameOverSummary.test.tsx`
Expected: FAIL — cannot resolve `./GameOverSummary`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/components/shared/GameOverSummary.tsx`:

```tsx
"use client";
import { useEffect, useRef } from "react";
import { GAMES, type GameId } from "@/lib/game-registry";
import { formatScore } from "@/lib/score-format";
import { playSuccess } from "@/lib/sounds";
import { gameOverMilestone } from "@/lib/game-over-milestone";
import type { LeaderboardGoal } from "@/lib/leaderboard-showcase";

const TONE_COLOR: Record<LeaderboardGoal["tone"], string> = {
  success: "#007700",
  warning: "#8a5a00",
  info: "#555555",
};

const CONFETTI = [
  { left: "8%", color: "#ff5050", delay: "0s" },
  { left: "20%", color: "#ffd700", delay: "0.10s" },
  { left: "33%", color: "#33cc66", delay: "0.05s" },
  { left: "46%", color: "#1084d0", delay: "0.15s" },
  { left: "59%", color: "#ff8c00", delay: "0.02s" },
  { left: "72%", color: "#cc66ff", delay: "0.12s" },
  { left: "85%", color: "#ffd700", delay: "0.08s" },
  { left: "92%", color: "#33cc66", delay: "0.18s" },
];

export function GameOverSummary({
  gameId,
  score,
  isTopScore,
  isNewRecord,
  best,
  goal,
}: {
  gameId: GameId;
  score: number;
  isTopScore: boolean;
  isNewRecord: boolean;
  best: number;
  goal: LeaderboardGoal | null;
}) {
  const game = GAMES[gameId];
  const milestone = gameOverMilestone({ isTopScore, isNewRecord });
  const dinged = useRef(false);

  useEffect(() => {
    if (milestone.sound && !dinged.current) {
      dinged.current = true;
      playSuccess();
    }
  }, [milestone.sound]);

  const rankText = goal
    ? goal.rank
      ? `Will rank #${goal.rank} on the board`
      : goal.secondary
    : "Checking the board…";
  const rankColor = goal ? TONE_COLOR[goal.tone] : "#555555";

  return (
    <div className="mb-2" style={{ position: "relative" }}>
      {milestone.confetti && (
        <div className="gameover-confetti" aria-hidden="true">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              style={{ left: c.left, background: c.color, animationDelay: c.delay }}
            />
          ))}
        </div>
      )}

      {milestone.tier === "leaderboard" && (
        <div
          className="gameover-banner mb-2 text-center"
          style={{
            background: "linear-gradient(90deg,#fff4b0,#ffd86b,#fff4b0)",
            border: "1px solid #c79a2e",
            color: "#7a5c00",
            fontWeight: "bold",
            padding: "4px 6px",
            fontSize: 12,
            letterSpacing: 0.5,
          }}
        >
          🏆 NEW HIGH SCORE — top-10 on this season&apos;s leaderboard!
        </div>
      )}

      <div className="text-xs" style={{ color: "#555555" }}>
        GAME OVER
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 24, fontWeight: "bold", lineHeight: 1.1 }}>
          {formatScore(gameId, score)}
        </span>
        <span aria-hidden="true" style={{ fontSize: 20 }}>
          {game.emoji}
        </span>
      </div>

      <div
        style={{
          marginTop: 2,
          fontWeight: goal?.tone === "success" ? "bold" : "normal",
          color: rankColor,
        }}
      >
        ▸ {rankText}
      </div>

      {isNewRecord ? (
        <div
          className={milestone.tier === "personal-best" ? "gameover-banner" : undefined}
          style={{ marginTop: 2, color: "#007700", fontWeight: "bold", fontSize: 12 }}
        >
          New personal best
        </div>
      ) : (
        <div className="text-xs" style={{ marginTop: 2, color: "#888888" }}>
          Personal best: <b>{formatScore(gameId, best)}</b>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/shared/GameOverSummary.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add frontend/components/shared/GameOverSummary.tsx frontend/components/shared/GameOverSummary.test.tsx
git commit -m "feat(game-over): GameOverSummary hero with tiered milestone feedback"
```

---

### Task 3: Milestone CSS (pop + confetti)

**Files:**
- Modify: `frontend/app/globals.css` (append near the existing `championConfetti` keyframe block, after line ~413)

**Interfaces:**
- Consumes: existing keyframes `championPop` and `championConfetti` (already in `globals.css`, already reduced-motion guarded for `.champion-*`).
- Produces: CSS classes `.gameover-banner` (pop) and `.gameover-confetti` / `.gameover-confetti span` (falling burst) referenced by `GameOverSummary` (Task 2), with their own reduced-motion guard.

- [ ] **Step 1: Append the CSS**

Add to the end of `frontend/app/globals.css`:

```css
/* ── Game-over milestone feedback ──────────────────────────────── */
/* Reuses the championPop / championConfetti keyframes (already defined
   above) so the mint dialog celebrates a top-10 run without new motion
   primitives. Scoped wrapper + its own reduced-motion guard. */
.gameover-banner {
  animation: championPop 0.5s ease-out both;
}

.gameover-confetti {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 0;
  pointer-events: none;
  overflow: visible;
}

.gameover-confetti span {
  position: absolute;
  top: -6px;
  width: 5px;
  height: 5px;
  animation: championConfetti 1.6s linear forwards;
}

@media (prefers-reduced-motion: reduce) {
  .gameover-banner {
    animation: none !important;
  }
  .gameover-confetti {
    display: none;
  }
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc clean; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/globals.css
git commit -m "feat(game-over): pop + confetti CSS for milestone banner"
```

---

### Task 4: Swap SharedMintDialog hero to GameOverSummary

**Files:**
- Modify: `frontend/components/shared/SharedMintDialog.tsx`

**Interfaces:**
- Consumes: `GameOverSummary` (Task 2). `hs` (already present: `const [hs] = useState(() => recordScore(gameId, score))` → `hs.isNewRecord`, `hs.best`). `goal` state (already present). `isTopScore`, `score`, `gameId` props (already present).

- [ ] **Step 1: Add the import**

After the existing import of `leaderboardGoal` (around line 28-31), add:

```tsx
import { GameOverSummary } from "@/components/shared/GameOverSummary";
```

- [ ] **Step 2: Replace the old hero block**

Find this block (the gold banner + the Game Over paragraph), currently right after `<div className="text-sm mint-dialog-enter">`:

```tsx
      {isTopScore && (
        <div
          className="mb-2 text-center"
          style={{
            background: "linear-gradient(90deg,#fff4b0,#ffd86b,#fff4b0)",
            border: "1px solid #c79a2e",
            color: "#7a5c00",
            fontWeight: "bold",
            padding: "4px 6px",
            fontSize: 12,
            letterSpacing: 0.5,
          }}
        >
          🏆 NEW HIGH SCORE — top-10 on this season&apos;s leaderboard!
        </div>
      )}
      <p className="mb-2">
        <b>Game Over</b> - Score: <b>{formatScore(gameId, score)}</b>
        <span className="block text-xs mt-1">
          {hs.isNewRecord ? (
            <b style={{ color: "#007700" }}>New personal best</b>
          ) : (
            <span className="text-gray-500">
              Personal best: <b>{formatScore(gameId, hs.best)}</b>
            </span>
          )}
        </span>
      </p>
```

Replace it with:

```tsx
      <GameOverSummary
        gameId={gameId}
        score={score}
        isTopScore={isTopScore}
        isNewRecord={hs.isNewRecord}
        best={hs.best}
        goal={goal}
      />
```

- [ ] **Step 3: Remove the now-duplicated goal lines from the gray box**

In the gray details box, replace this line:

```tsx
        <b>Play again is free.</b>{" "}
        {goal ? goal.primary : "Mint only if you want this exact score saved as an NFT."}
```

with (drop the `goal.primary` branch — the rank now lives in the hero):

```tsx
        <b>Play again is free.</b>{" "}
        Mint only if you want this exact score saved as an NFT.
```

Then delete this `goal.secondary` block entirely from the gray box:

```tsx
        {goal && (
          <span
            className="block mt-2"
            style={{
              color:
                goal.tone === "success"
                  ? "#007700"
                  : goal.tone === "warning"
                  ? "#8a5a00"
                  : "#555",
              fontWeight: goal.tone === "success" ? "bold" : "normal",
            }}
          >
            {goal.secondary}
          </span>
        )}
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc clean (note: `formatScore` is still used elsewhere in the file for the share section / nothing breaks); build succeeds.

If tsc reports `formatScore` unused, confirm it is still referenced; if genuinely unused, remove its import line. (As of this plan it remains used by `ShareScoreCard` indirectly — verify, do not blindly delete.)

- [ ] **Step 5: Visual spot-check**

Run: `npm run dev` (if CSS looks stale, stop and `rm -rf .next` then restart — known Turbopack persistent-cache gotcha). In a browser, open a game, end a run, and confirm the hero shows score + projected rank, and a top-10 run shows the banner + confetti.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/shared/SharedMintDialog.tsx
git commit -m "feat(game-over): use GameOverSummary hero in the mint dialog"
```

---

### Task 5: Demote details below actions + make Mint primary

**Files:**
- Modify: `frontend/components/shared/SharedMintDialog.tsx`

**Interfaces:**
- Consumes: existing `ACTION_ROW`, `PRIMARY_ACTION`, `SECONDARY_ACTION`, `TERTIARY_ACTION` style consts; the wallet-state branches already in the file.

- [ ] **Step 1: Move the gray details box below the wallet-state block**

Cut the entire gray details box (it begins `<div className="mb-3 text-xs"` and ends at its closing `</div>`, containing "Play again is free", mint cost, mints-remaining, risk, and session length) from its current position (above the `{!address ? ... : ...}` wallet-state conditional) and paste it **immediately after** that wallet-state conditional closes and **before** the share section (the `<div style={{ borderTop: "1px solid #d0d0c8", marginTop: 10, paddingTop: 8 }}>` block). Change its wrapper margin class from `mb-3` to `mt-3` so it sits as a trailing detail strip.

- [ ] **Step 2: Make Mint the primary action in the mint-form branch**

In the `address && !txId` branch, find the action row:

```tsx
          <div style={ACTION_ROW}>
            <button onClick={onPlayAgain} style={PRIMARY_ACTION}>
              Play Again
            </button>
            <button
              onClick={handleMint}
              disabled={isMintDisabled}
              style={{
                ...SECONDARY_ACTION,
                fontWeight: isTopScore ? "bold" : "normal",
              }}
            >
              {mintButtonLabel}
            </button>
            <button onClick={onClose} style={TERTIARY_ACTION}>
              Close
            </button>
          </div>
```

Replace with (Mint first + `.default` + primary styling; Play Again recedes to secondary):

```tsx
          <div style={ACTION_ROW}>
            <button
              onClick={handleMint}
              disabled={isMintDisabled}
              className="default"
              style={PRIMARY_ACTION}
            >
              {mintButtonLabel}
            </button>
            <button onClick={onPlayAgain} style={SECONDARY_ACTION}>
              Play Again
            </button>
            <button onClick={onClose} style={TERTIARY_ACTION}>
              Close
            </button>
          </div>
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc clean; build succeeds.

- [ ] **Step 4: Visual spot-check**

Run the dev server (mind the `.next` cache gotcha). End a run and confirm: Mint reads as the primary button, Play Again/Close recede, and the fee/risk/mints details now sit as a small gray strip below the buttons (above the share card).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/shared/SharedMintDialog.tsx
git commit -m "feat(game-over): demote fee/risk details below actions, Mint primary"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full gate**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all tests pass (≥ 588: prior 580 + 4 helper + 4 component); tsc clean; build succeeds.

- [ ] **Step 2: Playwright spot-check (one game, all tiers)**

With the dev server running (clear `.next` if CSS looks stale), drive a game to game-over and verify against the spec:
- Tier A (top-10): banner + confetti appear, a single `playSuccess()` ding plays.
- Tier B (personal best, not top-10): light pop on "New personal best", **silent**, no confetti.
- Reduced-motion (`prefers-reduced-motion`): banner/confetti motion disabled.
- Mute on: no ding on a Tier A run.

- [ ] **Step 3: Record outcome**

No commit. Report the gate output (test count, tsc, build) and the spot-check observations.

---

## Self-Review

**Spec coverage:**
- §3 milestone tiers → Task 1 (helper) + Task 2 (rendering) + Task 3 (motion). ✓
- §4 hierarchy (hero score, promoted rank, demoted details, primary Mint) → Task 2 (hero) + Task 4 (swap) + Task 5 (demote + primary). ✓
- §5 component boundary & files → all six files covered (2 new lib, 2 new component, globals.css, SharedMintDialog). ✓
- §6 testing (vitest, tsc, build, spot-check) → Tasks 1/2 tests, Task 6 gate + Playwright. ✓
- §7 non-goals → no pool/urgency/share-redesign/anti-cheat tasks present. ✓
- §8 smallest green-committable steps → six tasks, each ends in a commit. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `gameOverMilestone` signature/return identical across Tasks 1–2; `LeaderboardGoal` shape matches `lib/leaderboard-showcase.ts`; `GameOverSummary` props identical in Task 2 definition and Task 4 usage; `TONE_COLOR` keyed exactly by the three `tone` union members. ✓

**Note for executor:** Task 4 Step 4 — verify before removing the `formatScore` import; it may still be referenced. Do not delete a still-used import.
