# Solitaire (Klondike) — Design Spec

**Date:** 2026-06-17
**Status:** Approved (design), pending implementation plan
**Game id:** 6 (on-chain), shared contract `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4`

## 1. Summary

Add **Klondike Solitaire** as the 6th game in XP Arcade — the last iconic
Windows-95 title still missing. It plugs into the existing shared
`xp-arcade-v4` registry under a new `game-id` (6); **no contract change**.
The build mirrors the established Minesweeper pattern: a pure engine, a 98.css
board renderer, and a window that wires the engine to `useGameSession`.

## 2. Game rules (Klondike, Win95-faithful)

- **Layout:** 1 stock + 1 waste, 4 foundations (build up by suit A→K),
  7 tableau piles (build down, alternating colour). Standard 28-card tableau
  deal (pile *i* holds *i* cards, top card face-up, rest face-down).
- **Draw modes:**
  - **Draw-3 = ranked / mintable** (the on-chain leaderboard mode), unlimited
    stock redeals.
  - **Draw-1 = practice** (never mints) — same "only one config is ranked"
    mechanism as Minesweeper Intermediate-only.
- **Win:** all 52 cards moved to foundations.
- **Auto-complete:** when no face-down cards remain anywhere, surface a
  "⚡ Auto-finish" button. Triggering it sends remaining cards to foundations.
  **The timer stops at the moment auto-complete becomes available / is
  triggered** — animation time is never penalised.
- **Timer:** starts on the first card move (mirrors Minesweeper starting its
  clock on first reveal), runs until win.

## 3. Scoring

Only a **completed win** mints (consistent with Minesweeper). Every win yields
a positive score, so every minted score is a genuine win.

```
score = clamp(0, 9999, round(720000 / winSeconds))
```

`720000` is a deliberate homage to Microsoft Solitaire's original end-game
time bonus (`700000 / time`). Curve reference:

| Win time | Score |
|----------|-------|
| ≤72s (effectively unreachable by hand) | 9999 (cap) |
| 90s  | 8000 |
| 120s | 6000 |
| 180s | 4000 |
| 300s (5 min) | 2400 |
| 600s (10 min) | 1200 |

`winSeconds` is `max(1, elapsedSecondsAtWin)` to avoid divide-by-zero; the
clamp enforces the on-chain `MAX-SCORE u9999`.

### Rarity thresholds — FROZEN FOREVER at `register-game`

These are set once on-chain and **can never be changed** (same constraint as
Minesweeper's `u9819 / u9909 / u9959`). Approved values:

- 🟦 **Rare ≥ 2400** (win in ≤ ~5 min)
- 🟪 **Epic ≥ 4000** (win in ≤ ~3 min)
- 🟧 **Legendary ≥ 6000** (win in ≤ ~2 min)
- Common = any win below 2400.

The client rarity helper (`leaderboard-showcase.ts`) must mirror these exact
thresholds, as it does for Minesweeper.

## 4. Interaction model

**Click-to-move** (no HTML5 drag-and-drop in v1 — explicitly out of scope, YAGNI):

- Click a face-up card (or a valid descending run in a tableau pile) → it
  highlights as the current selection.
- Click a legal destination (tableau pile or foundation) → the move applies.
  Clicking the selection again, or an illegal target, clears/keeps selection
  sensibly (no-op on illegal).
- **Double-click a card → send it straight to a foundation** if legal (the
  classic Windows shortcut).
- Click the stock → draw (3 cards in ranked, 1 in practice); clicking an empty
  stock with cards in waste recycles the waste back to stock.

Rationale: far simpler to build and unit-test than drag-drop, mobile-friendly,
and still feels authentic.

## 5. Architecture

Follows the Minesweeper directory pattern under
`frontend/components/game/solitaire/`.

### `SolitaireEngine.ts` — pure, no React
- **State:** `{ stock: Card[], waste: Card[], foundations: Card[][] (4),
  tableau: Card[][] (7), drawMode: 1 | 3, moveCount: number }` where
  `Card = { suit: "S"|"H"|"D"|"C", rank: 1..13, faceUp: boolean }`.
- **Functions (all pure, return new state):**
  - `createGame(drawMode, seed?)` — deterministic deal when seeded (enables
    reproducible tests).
  - `draw(state)` — draw / recycle stock per draw mode.
  - `selectableRun(state, pile, index)` — the face-up descending run a click
    grabs.
  - `moveCards(state, from, to)` — validated move (tableau↔tableau,
    waste→tableau/foundation, tableau→foundation). Illegal moves return state
    unchanged.
  - `sendToFoundation(state, source)` — the double-click helper.
  - `canAutoComplete(state)` — true when no face-down cards remain.
  - `autoComplete(state)` — flush everything to foundations.
  - `isWon(state)` — all 52 on foundations.
- **No timing, no scoring, no React** — those live in the window.

### `SolitaireBoard.tsx` + `Card.tsx`
- Presentational only. 98.css styling, red suits (H/D) vs black (S/C),
  face-down card back, selection highlight, empty-pile drop targets.
- Props: current state + click/double-click callbacks. No internal game logic.

### `SolitaireWindow.tsx`
- Mirrors `MinesweeperWindow`: holds engine state, runs the live timer, exposes
  the **Draw-3 (ranked) / Draw-1 (practice)** selector, and on a ranked win
  submits the computed score exactly once via `useGameSession("solitaire")`
  (guarded by a `submittedRef`, like Minesweeper). Renders `SharedMintDialog`
  via `GameShellWindow`. Practice wins show a "not ranked" notice + "Play
  Ranked" button; no mint.

## 6. Integration touchpoints (verified against current code)

- **`lib/game-registry.ts`** (+ `game-registry.test.ts`): add `"solitaire"` to
  `GameId`, `GAME_METADATA`, `GAME_CONTRACTS` (both networks → `SHARED_V4`),
  and `GAME_IDS`. Values: `onchainId: 6`, `mintFeeUstx: 20_000n`,
  `emoji: "🃏"`, `label: "Solitaire"`, `metaSegment: "solitaire"`,
  `nftAssetName: "xp-score"`. The `game-${GameId}` template literal in
  `state/window-manager.ts` auto-creates the `game-solitaire` window type — no
  manual edit there.
- **`app/page.tsx`**: import + render `SolitaireWindow`.
- **`components/desktop/Desktop.tsx`**: add the desktop icon; reuse the existing
  "no points suffix" branch (the one currently special-casing `minesweeper`) so
  the leaderboard label isn't "… points" for a time-based score.
- **Game-aware display helpers** (extend the existing `minesweeper` branches):
  - `lib/score-format.ts`: solitaire → `"Won in Ns"`, decoding the win time
    from the stored score as `winSeconds = round(720000 / score)` (the inverse
    of the scoring formula), mirroring how Minesweeper decodes
    `seconds = 9999 - score`.
  - `lib/leaderboard-showcase.ts`: solitaire rarity thresholds 2400/4000/6000 +
    goal copy phrased as a win-time / score goal, not "points".
  - `lib/score-risk.ts`, `lib/metadata-svg.ts`, `lib/score-card.ts`: add a
    solitaire entry (colour, risk heuristic, card colour) alongside the others.

## 7. Contract / on-chain (no code change)

`xp-arcade-v4` already supports registering new games. Implementation produces a
**deployment plan file only** (owner runs it with the deployer wallet, exactly
like Minesweeper):

```
contract/deployments/xp-arcade-v4-register-solitaire.mainnet-plan.yaml
  batch 0:
    register-game(u6, "Solitaire", u20000, u2400, u4000, u6000)
    set-season-end-block(u6, <current shared season-end block>)
```

The season-end block must be the **current** shared `H` used by games 1–5
(confirm on-chain before running; if the season rolled, use the live value).
This step is **not** executed by the implementation — it is handed to the user.

## 8. Testing

Target: `tsc --noEmit`, `lint`, full Vitest suite, and `build` all green.

- **Engine:** valid deal (52 cards, 28 in tableau, 7 face-up tops); legal vs
  illegal moves for every move type; draw-3 cycle + waste recycle; `seed`
  determinism; `canAutoComplete` only when no face-down cards; win detection;
  scoring formula incl. clamp at both ends and rarity-threshold mapping.
- **Window/board:** ranked win submits exactly once; practice win does not mint;
  timer stops at auto-complete; selection/illegal-move click behaviour.
- **Registry:** existing parametrised tests extended for game id 6.

## 9. Out of scope (v1)

- HTML5 drag-and-drop (click-to-move only).
- Spider / FreeCell variants.
- Undo / hint / move-count scoring.
- Persisted in-progress games.
