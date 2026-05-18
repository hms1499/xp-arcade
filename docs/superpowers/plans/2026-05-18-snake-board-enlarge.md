# Snake Board Enlarge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Snake playfield render at 480×480px instead of 320×320 by changing one pixel-scale constant, with no gameplay change.

**Architecture:** The canvas size is `GRID * CELL`. Every drawn element derives from `CELL`/`GRID`, so raising `CELL` from 16 to 24 scales the whole board uniformly. `GRID` stays 20, so `createGame({ gridSize: GRID })` and therefore difficulty/speed/rules are unchanged. No test depends on `CELL`; verification is the existing suite staying green plus type-check, build, and a manual visual check. There is no meaningful unit test to add for a render constant, so none is fabricated.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, HTML canvas 2D, Vitest 3.

Spec: `docs/superpowers/specs/2026-05-18-snake-board-enlarge-design.md`. Repo root: `/Users/vanhuy/Desktop/xp-snake`; all commands run from `/Users/vanhuy/Desktop/xp-snake/frontend` unless noted. Branch for this work: `feat/snake-board-enlarge` (already created off `main`). Reliable type-check is `npx tsc --noEmit 2>&1 | grep -v '\.next/'` (empty = clean; raw `tsc` is noisy from pre-existing `.next/` cache errors — a known project quirk). Note: there are pre-existing uncommitted files (`.gitignore`, `CLAUDE.md`, untracked docs) that are NOT part of this work — never `git add -A`/`.`; stage only the one file this task touches.

---

### Task 1: Increase `CELL` from 16 to 24

**Files:**
- Modify: `frontend/components/game/GameCanvas.tsx:8`

- [ ] **Step 1: Capture the current baseline (sanity, pre-change)**

  Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && grep -n "const CELL" components/game/GameCanvas.tsx`
  Expected output exactly:
  ```
  8:const CELL = 16;
  ```
  If it is not `const CELL = 16;` on line 8, STOP and report — the file has drifted from the spec and the plan needs revisiting before editing.

- [ ] **Step 2: Change the constant**

  In `frontend/components/game/GameCanvas.tsx`, change line 8 from:
  ```ts
  const CELL = 16;
  ```
  to:
  ```ts
  const CELL = 24;
  ```
  Do not change anything else in the file (do NOT touch `const GRID = 20;` on line 9 — changing `GRID` would alter gameplay, which this task must not do).

- [ ] **Step 3: Verify the diff is exactly one line**

  Run (from repo root): `cd /Users/vanhuy/Desktop/xp-snake && git diff frontend/components/game/GameCanvas.tsx`
  Expected: exactly one changed line — `-const CELL = 16;` / `+const CELL = 24;`. Nothing else changed. If more lines differ, revert the extra changes.

- [ ] **Step 4: Type-check**

  Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npx tsc --noEmit 2>&1 | grep -v '\.next/'`
  Expected: empty output (no source-level type errors).

- [ ] **Step 5: Run the full test suite — no regressions**

  Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npm test`
  Expected: `Test Files 7 passed (7)` and `Tests 34 passed (34)`. The `snake-engine` tests do not depend on `CELL`; this confirms gameplay logic is unchanged.

- [ ] **Step 6: Production build**

  Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npm run build`
  Expected: build completes, exits 0, routes generated, no build errors.

- [ ] **Step 7: Manual visual smoke (canvas not unit-testable)**

  Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npm run dev`, open `http://localhost:3000`, open the Snake window.
  Confirm:
  - The board is visibly larger (~480×480) and fits inside the Snake window with no horizontal clipping or scrollbar.
  - Snake, food, dot-grid, `+1` popup, score-flash all render correctly at the larger scale (crisp, not blurry).
  - Play a round: movement speed/feel and difficulty are unchanged from before.
  - Die: the game-over overlay ("GAME OVER", SCORE, BEST/NEW PERSONAL BEST, "Press any key...") is centered and readable.
  - Stop the dev server when done (Ctrl+C).

- [ ] **Step 8: Commit**

  ```bash
  cd /Users/vanhuy/Desktop/xp-snake
  git add frontend/components/game/GameCanvas.tsx
  git commit -m "feat(game): enlarge Snake board to 480px (CELL 16->24)"
  ```
  (Global git convention: NO `Co-Authored-By` trailer. Stage only `GameCanvas.tsx`.)

---

## Self-Review

**Spec coverage:**
- Spec "Change" table: `CELL = 16` → `CELL = 24`, only `GameCanvas.tsx` → Task 1 Steps 2–3. ✓
- Spec "Why sufficient" (GRID unchanged, no engine/test impact) → Step 2 explicitly forbids touching `GRID`; Step 5 confirms 34/34. ✓
- Spec "Window fit" (480 fits 520px window, no window change) → Step 7 manual confirms no clipping; no other file touched. ✓
- Spec "Scope out" (fonts not scaled, Maximize unchanged) → no task touches fonts or window system; nothing to do, consistent with plan. ✓
- Spec "Verification" (tsc / npm test / build / manual) → Steps 4, 5, 6, 7 one-to-one. ✓
- Spec "Risk: single constant, no other change" → Step 3 enforces a one-line diff. ✓

**Placeholder scan:** No TBD/TODO. Every step has the exact command and expected output; the only code change shows full before/after. ✓

**Type consistency:** Only a numeric literal changes (`16` → `24`); no types, signatures, or names introduced or renamed. `CELL`/`GRID` identifiers untouched. ✓
