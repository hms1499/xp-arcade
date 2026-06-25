# Game-Over Mint Moment — Hierarchy & Micro-Feedback Polish

**Date:** 2026-06-25
**Status:** Design approved, pending spec review → plan

## 1. Context

The game-over → mint flow already exists. When a run ends, `useGameSession`
sets `showMint`, and each game window renders `SharedMintDialog`
(`components/shared/SharedMintDialog.tsx`, ~480 lines, shared by all 6 games).
That dialog already shows: score, personal best / new-record, a projected
leaderboard rank via `leaderboardGoal` (`"Mint to publish this score around
rank #X"`), mint fee, mints-remaining, risk report, connect-to-mint, and a
share card.

So this is **not a new feature** — it is a polish pass on an existing moment.
A senior UI review found the conversion mechanics are present but the
**visual hierarchy is flat** and there is **no emotional payoff** at the peak
moment (just finished a good run):

- The projected rank (the most motivating line) is buried in a gray box among
  fee/risk/mints text.
- The score is small; nothing reads as the "hero".
- Reaching a milestone (top-10 / personal best) has no celebratory feedback.

User decision (brainstorming): conversion is believed fine; the goal is
**hierarchy + light, Win95-appropriate micro-feedback**, not new conversion
mechanics (no pool/urgency levers added here).

## 2. Goal

Restructure the game-over portion of `SharedMintDialog` so the story
**score → projected rank → mint** reads top-to-bottom in ~2 seconds, and add
tiered milestone feedback that respects the Win95 aesthetic, reduced-motion,
and sound-mute.

## 3. Milestone tiers

Decided by data already available (`isTopScore` from `useGameSession`;
`isNewRecord` from `recordScore(gameId, score)`):

| Tier | Condition | Feedback |
|------|-----------|----------|
| **A — Leaderboard** | `isTopScore` (in top-10) | "🏆 NEW HIGH SCORE" banner **pop** + short **confetti** + **`playSuccess()` ding once** |
| **B — Personal best** | `isNewRecord` AND NOT `isTopScore` | "New personal best" line with a **light pop**; **no confetti, no sound** |
| **C — Normal** | otherwise | "Personal best: X" plain; no effects |

Rules:
- Pop/confetti are disabled under reduced-motion (reuse the existing
  `.champion-*` reduced-motion guards in `globals.css`).
- Sound is gated by mute (`playSuccess()` already checks `isSoundMuted()`).
- The ding fires **exactly once** on the leaderboard transition, guarded by a
  ref (mirrors `SystemDialog`'s ding-once pattern). `isTopScore` starts `false`
  and flips `true` after `useGameSession`'s async top-10 check, so the effect
  watches `isTopScore` and fires once when it first becomes true.
- **Tier B is fully silent** (explicit user requirement).

## 4. Visual hierarchy (approved layout)

```
┌─ 🐍 Snake ───────────────────────[_][□][x]┐
│ ✨🏆 NEW HIGH SCORE 🏆✨   ← Tier A: pop+confetti│
│                                            │
│  GAME OVER                                 │
│   8,420  🐍         ← HERO: large, bold     │
│   ▸ Will rank #4 on the board  ← prominent  │
│   New personal best   ← (Tier B pop here)   │
│ ─────────────────────────────────────────  │
│  [ Mint & enter · 1 STX ]  ← primary CTA    │
│  [ Play Again ]   [ Close ]                 │
│ ─────────────────────────────────────────  │
│  Play again free · fee 1 STX · 9 mints left │  ← demoted gray details
│  · risk · session 42s                       │
│ ─────────────────────────────────────────  │
│  Share or download this run  [card]         │  ← unchanged
└────────────────────────────────────────────┘
```

Core changes vs. today:
- Projected rank **promoted** to a prominent line directly under the score,
  tinted by `goal.tone` (success/warning/info) — no longer buried in the gray
  box. Source of the text: when `goal.rank` is present, render
  `"Will rank #${goal.rank} on the board"`; otherwise fall back to
  `goal.secondary` (e.g., `"Needs 120 to beat #10 (8,540)"`). While `goal` is
  null (still loading), render a neutral placeholder (e.g., "Checking the
  board…").
- Score becomes the hero: large (~24px) + game emoji.
- Mint button is the visually dominant action; Play Again / Close recede.
- Fee / mints-remaining / risk / session / "play again is free" are **moved
  into a small gray details zone below the actions** — all information kept,
  only de-prioritized visually.
- Wallet states (no-wallet connect / mint form / tx-progress) keep their logic;
  only styling changes so Mint reads as primary.

## 5. Component boundary & files

Approach: **extract a presentational `GameOverSummary`** (chosen over in-place
edit) because `SharedMintDialog` is already large and does too much; the hero
zone has no wallet/stacks dependency, so it tests in isolation.

**New files**
- `lib/game-over-milestone.ts` — pure
  `gameOverMilestone({ isTopScore, isNewRecord }): { tier: "leaderboard" |
  "personal-best" | "none"; celebrate: boolean; sound: boolean; confetti:
  boolean }`. Single source of truth for the tier decision.
- `lib/game-over-milestone.test.ts` — pure unit tests for all three branches
  (leaderboard ⇒ sound+confetti true; personal-best ⇒ celebrate true but
  sound+confetti false; none ⇒ all false).
- `components/shared/GameOverSummary.tsx` — hero zone: milestone banner + large
  score + game emoji + projected-rank line (tinted by `goal.tone`, with a
  loading placeholder while `goal` is null) + personal-best line. Fires
  `playSuccess()` once via a ref when `tier === "leaderboard"`. Imports only
  GAMES registry, `formatScore`, `playSuccess`, and the milestone helper — no
  wallet/stacks imports.
- `components/shared/GameOverSummary.test.tsx` — `renderToStaticMarkup`
  assertions: Tier A renders "NEW HIGH SCORE" + confetti markup; Tier B renders
  "New personal best" and omits confetti/banner; Tier C renders
  "Personal best: X"; projected-rank renders `goal.secondary`; placeholder when
  `goal` is null. (Effects do not run under `renderToStaticMarkup`, so the
  ding-once behavior is covered by the pure helper test, not here — matching the
  project's existing test style.)

**Edited files**
- `components/shared/SharedMintDialog.tsx` — replace the top section (top-score
  banner + Game Over score + personal-best + goal primary/secondary) with
  `<GameOverSummary gameId score isTopScore isNewRecord={hs.isNewRecord}
  best={hs.best} goal={goal} />`; relocate fee/mints/risk/session +
  "play again is free" into a demoted gray details block placed **after** the
  action buttons; restyle the mint button as primary. No change to
  wallet/tx/mint logic, the `goal` fetch, `recordScore`, or `ShareScoreCard`.
- `app/globals.css` — reuse `championPop` (banner pop) and `championConfetti`
  (confetti burst) keyframes, which already carry reduced-motion guards; add at
  most one small wrapper class if confetti needs positioning around the banner.

**Untouched:** Clarity contract, `useGameSession` (already supplies
`isTopScore`), `leaderboardGoal`, `ShareScoreCard`, the six game windows.

## 6. Testing

- `npm test` (vitest): new pure tests + new component tests green; existing
  suite stays green (currently 580).
- `npx tsc --noEmit` clean.
- `npm run build` succeeds.
- Manual / Playwright spot-check at the game-over screen for one game: Tier A
  shows banner+confetti and dings once; Tier B is silent with the light pop;
  reduced-motion disables motion; mute disables the ding.

## 7. Non-goals (YAGNI)

- No prize-pool or season-countdown levers added to the dialog (conversion
  mechanics out of scope).
- No share-card redesign.
- No changes to score trust / anti-cheat.
- No per-game custom celebration; one shared treatment for all six games.

## 8. Build approach

Per user preference, decompose into the **smallest possible green-committable
steps**, each a standalone commit:
1. Pure `gameOverMilestone` helper + its tests.
2. `GameOverSummary` component + its tests (wired to the helper; not yet used).
3. Swap `SharedMintDialog` top section to use `GameOverSummary` (behavior parity
   first, then the hierarchy/demotion restyle).
4. CSS wiring for pop/confetti (reuse champion keyframes).
5. Final verification (gate + spot-check).

Each step must leave tests/tsc/build green before committing.
