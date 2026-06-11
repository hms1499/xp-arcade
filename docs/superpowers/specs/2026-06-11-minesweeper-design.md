# Minesweeper (game id 5) — Design Spec

**Status:** Approved 2026-06-11 — ready for implementation plan.

**Author session:** 2026-06-11

## 1. Motivation

XP Arcade has four games (Snake, Tetris, Pac-Man, XP Bricks) wired into the
single on-chain registry `xp-arcade-v4`. Minesweeper is the next iconic Win95
title on the roadmap. It is the first **time-based** game in the arcade ("faster
is better"), which is the opposite of the contract's score model ("higher is
better"). The whole design hinges on mapping time → score **once, permanently**,
because `register-game` fee + rarity thresholds cannot be changed after the
on-chain call.

## 2. Key constraints (verified in code)

- `register-game(game-id, name, fee, rare-min, epic-min, legend-min)` is
  owner-only and **permanent** — no update function, only `set-game-active`
  toggles a game. (`contract/contracts/xp-arcade-v4.clar:79`)
- Score is a `uint`, capped at `MAX-SCORE u9999`; **higher = better**; one
  unsorted top-10 per `game-id`; rarity is `compute-rarity` from the three
  `*-min` thresholds. (`xp-arcade-v4.clar:36,100,285`)
- Score is **client-trusted** — no on-chain anti-cheat. We do NOT add anti-cheat
  scope. `MAX-SCORE` + mint cap (10/game/season) bound abuse.
- **No contract change / redeploy.** `register-game(u5, …)` works on the live v4
  contract as-is. The only on-chain actions are two owner-only calls (§9).
- Path must stay at `Desktop/xp-snake/`; `.clar` files ASCII only.

## 3. Decisions (approved)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Difficulty scope | **Play all 3 (Beginner/Intermediate/Expert) locally; only Intermediate is "ranked" — mints + leaderboards** | Keeps the iconic Win95 difficulty menu; keeps one clean on-chain score meaning; avoids permanently encoding difficulty into score. |
| D2 | Ranked board | **Intermediate: 16×16, 40 mines** | Sweet spot: honest times spread ~40–250s (meaningful leaderboard), still winnable by casual players (more mints → healthier prize pool), square board fits mobile. Beginner is too easy (scores pin to ceiling); Expert too hard (pool starves). |
| D3 | Score formula | **`score = clamp(0, 9999 - elapsedSeconds)`** | Simple, strictly monotonic (faster ⇒ strictly higher), trivially invertible for display ("Cleared in N s"). |
| D4 | What mints | **Only a completed WIN mints / counts** | A loss (hit a mine) shows a game-over screen with Play Again, no NFT. |
| D5 | Mint fee | **0.02 STX (`u20000`)** | Consistent with Tetris/Pac-Man/Bricks. |
| D6 | Rarity thresholds (PERMANENT) | rare-min `u9819` (<180s), epic-min `u9909` (<90s), legend-min `u9959` (<40s) | Defined in time-space, converted to score-space. Tuned for Intermediate honest play. |
| D7 | Identity | `id: "minesweeper"`, `onchainId: 5`, label `"Minesweeper"`, emoji 💣, `metaSegment: "mines"`, `nftAssetName: "xp-score"` | Matches registry shape. |

> **Permanent-on-chain values to sign off before §9 runs:** fee `u20000`,
> rare-min `u9819`, epic-min `u9909`, legend-min `u9959`. These freeze forever.

## 4. Architecture overview

Minesweeper follows the exact pattern of the existing games:

```
components/game/minesweeper/
  MinesweeperEngine.ts        # pure game logic (TDD), no React/DOM
  MinesweeperEngine.test.ts   # vitest unit tests
  MinesweeperBoard.tsx        # DOM/CSS-grid renderer (Win95 cells)
  MinesweeperWindow.tsx       # window shell + win/loss → mint wiring
```

The grid is rendered as a DOM/CSS grid of buttons (authentic 98.css beveled
cells with left-click reveal / right-click flag), not a `<canvas>` — Minesweeper
is discrete and click-driven, so DOM is simpler and more accessible than canvas.
(Snake/Tetris/Pac-Man/Breakout use canvas because they animate continuously;
Minesweeper does not.)

### 4.1 MinesweeperEngine (pure, isolated unit)

**What it does:** owns board state and the rules. **Interface:**

- `createBoard(difficulty): Board` — Beginner 9×9/10, Intermediate 16×16/40,
  Expert 16×30/99. **First-click safety:** mines are placed *after* the first
  reveal so the first click is never a mine (classic behavior).
- `reveal(board, r, c): Board` — flood-fill empties; reveals a mine ⇒ `status:
  "lost"`; all non-mine cells revealed ⇒ `status: "won"`.
- `toggleFlag(board, r, c): Board`.
- Exposes `status: "playing" | "won" | "lost"`, `minesLeft`, and per-cell
  `{ mine, revealed, flagged, adjacent }`.

**Depends on:** nothing (no React, no time, no chain). Timing lives in the
window, not the engine, so the engine is deterministic and fully unit-testable.

### 4.2 MinesweeperWindow (integration unit)

Mirrors `BreakoutWindow.tsx`: uses `useGameSession("minesweeper")`,
`GameShellWindow`, `SharedMintDialog`. Differences driven by win/loss:

- Tracks `startedAt` on first reveal of a ranked game; on **win**, computes
  `elapsedSeconds`, derives `score = clamp(0, 9999 - elapsedSeconds)`, and calls
  `handleGameOver(score)` → `SharedMintDialog`.
- On **loss**, shows an in-window "💥 Boom — Play Again" state and does **not**
  open the mint dialog (D4).
- Difficulty selector (Beginner/Intermediate/Expert). Non-Intermediate play is
  clearly labelled **"Practice — only Intermediate is ranked"**; a win there does
  not mint.

`GameShellWindow`'s live `score` prop shows the running clock-derived score (or a
plain timer) for the ranked board.

## 5. Score display (cross-cutting)

On-chain the score is a generic `uint`, but `9952` is meaningless to a human.
Add one pure helper and route all human-facing score rendering through it:

```ts
// lib/score-format.ts
formatScore(gameId, score): string
// minesweeper → `Cleared in ${9999 - score}s`
// others       → String(score)
```

Apply in: `SharedMintDialog`, `HighScoreWindow`, `HallOfFameWindow`,
`DesktopLeaderboardShowcase`, `LeaderboardTicker`, the metadata route
(`name`/`description`), and `metadata-svg` (the OG/NFT card). Leaderboard
**ordering stays by raw `score`** (the contract already sorts by it); only the
*label* changes. This keeps a single source of truth for the inversion.

## 6. Registry + wiring changes

Most arcade chrome enumerates `GAMES` dynamically (`Object.keys(GAMES)` in
Desktop, StartMenu, Taskbar, leaderboard ticker/showcase, High Score tabs), so
adding the registry entry auto-wires icons, Start-menu entries, taskbar labels,
and per-game leaderboard tabs.

- **`lib/game-registry.ts`** — add `"minesweeper"` to the `GameId` union,
  `GAME_METADATA`, `GAME_IDS`, and both `GAME_CONTRACTS.mainnet/.testnet`
  (→ `SHARED_V4`); extend `buildGameRegistry`/`validateGameRegistry`.
- **`state/window-manager.ts`** — `game-${GameId}` template auto-extends; no edit
  needed beyond the registry.
- **`app/page.tsx`** — mount `<MinesweeperWindow />`.
- **`lib/score-risk.ts`** — **must** add a `minesweeper` profile (the function
  indexes `PROFILES[gameId]`; a missing entry would throw). Expected-range/rate
  tuned for a near-ceiling time score.
- Verify 5-game layouts: Desktop icon grid, Start menu, High Score tabs, and the
  leaderboard showcase/ticker still lay out cleanly with a fifth game.

## 7. Testing

- `MinesweeperEngine.test.ts` (TDD, written first): first-click safety, flood
  fill on empties, win detection (all non-mines revealed), loss on mine, flag
  toggling, `minesLeft` accounting.
- `lib/score-format.test.ts`: minesweeper inversion + passthrough for others;
  clamp at 0 and at 9999.
- `lib/game-registry.test.ts`: update expected game count/ids to include
  minesweeper (id 5).
- `lib/score-risk.test.ts`: minesweeper profile present, no throw.
- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` all green
  before claiming done (per CLAUDE.md verification rule).
- E2E (`e2e/`): a light smoke that the Minesweeper window opens; full mint flow
  stays manual (live-wallet smoke, HANDOFF §2).

## 8. Out of scope (MVP discipline)

- Score anti-cheat / server-signed times — explicitly out (project stance).
- Encoding difficulty into the on-chain score (rejected in D1).
- Per-difficulty separate leaderboards (only one `game-id` exists).
- Custom question-mark (`?`) cell marking, chord-click (left+right) — optional
  polish, not required for v1.
- Any change to `xp-arcade-v4.clar`.

## 9. Irreversible operational steps (owner wallet, AFTER build + local tests)

These run on mainnet with the **deployer wallet** (`SP2CMK…3SV`) via a Clarinet
plan (`-p <plan> -d --no-dashboard`, never `-c` on mainnet). The MCP `aibtc`
wallet is NOT the owner and cannot run these.

1. `register-game(u5, "Minesweeper", u20000, u9819, u9909, u9959)` — **freezes
   fee + rarity forever.**
2. `set-season-end-block(u5, H)` — same deadline block `H` as the other four
   games (read the current value first; reuse it).
3. After registration, redeploy the frontend (registry now lists 5 games) and
   verify `npm run health:production` covers Minesweeper (pool + top-10 +
   endBlock present for game 5).

Build order: implement game + frontend + tests and validate on simnet/local
first; only run steps 1–2 on mainnet when the user is ready (they cost real STX
and are permanent).

## 10. Risks / notes carried forward

- **Time score is forgeable** (client-trusted): a "0-second win" (score 9999) is
  indistinguishable from a legit instant Beginner-style clear. Accepted — same
  trust model as the other games; Intermediate honest play still produces a
  credible spread among honest players.
- **Rarity is permanent.** D6 thresholds are the single highest-stakes choice;
  confirm before §9.
- **Mobile:** 16×16 with right-click-to-flag needs a touch affordance
  (long-press or a flag-mode toggle) via the existing `TouchControls` pattern.
