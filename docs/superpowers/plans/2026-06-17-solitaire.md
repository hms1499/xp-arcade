# Klondike Solitaire (game id 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Klondike Solitaire as the 6th XP Arcade game — a pure engine, a 98.css board, and a window wired to `useGameSession` — plugging into the shared `xp-arcade-v4` registry under `game-id` 6 with no contract change.

**Architecture:** Mirror the existing Minesweeper structure. A pure, React-free `SolitaireEngine.ts` holds all game logic (deal, draw, move validation, auto-complete, win). A presentational `Card.tsx` + `SolitaireBoard.tsx` render it with 98.css. `SolitaireWindow.tsx` owns timing, draw-mode selection, click-to-move selection state, and submits the score on a ranked win. Scoring lives in a tiny pure `lib/solitaire-score.ts`. Score is `clamp(0, 9999, round(720000 / winSeconds))`, only a Draw-3 win mints.

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5 / Vitest 3 / 98.css. Run all commands from `frontend/`.

---

## Important conventions (read first)

- All commands run from `frontend/`.
- Run a single test file with: `npx vitest run <path>`.
- Full gate before declaring done: `npx tsc --noEmit && npm run lint && npm test && npm run build`.
- Gotcha (from prior sessions): stale `.next/**/* 2.*` duplicate files can break `tsc`. If `tsc` reports errors in files you didn't touch, run `find .next -name "* 2.*" -delete` and retry.
- Commit style: conventional prefixes, small green commits, stage explicit files, NO `Co-Authored-By` (project rule).
- `GameId` is a string union in `lib/game-registry.ts`. Adding `"solitaire"` makes every **exhaustive** `Record<GameId, …>` literal a compile error until an entry is added — Phase 1 fixes each one before moving on.

## File map

**Create:**
- `lib/solitaire-score.ts` — pure scoring (forward + inverse) + constant.
- `lib/solitaire-score.test.ts`
- `components/game/solitaire/SolitaireEngine.ts` — pure game logic.
- `components/game/solitaire/SolitaireEngine.test.ts`
- `components/game/solitaire/Card.tsx` — single-card renderer.
- `components/game/solitaire/SolitaireBoard.tsx` — board renderer.
- `components/game/solitaire/SolitaireWindow.tsx` — game window.
- `../contract/deployments/xp-arcade-v4-register-solitaire.mainnet-plan.yaml` — owner-run register plan (NOT executed here).

**Modify:**
- `lib/game-registry.ts` (+ `lib/game-registry.test.ts`) — add `solitaire` entry.
- `lib/score-risk.ts` — add `solitaire` to `PROFILES`.
- `lib/score-card.ts` — add `solitaire` to `GAME_BG`.
- `lib/daily-challenge.ts` — add `solitaire` to `DAILY_TARGETS`.
- `lib/metadata-svg.ts` — add `Solitaire` to `GAME_BG`.
- `lib/score-format.ts` — solitaire "Won in Ns".
- `lib/leaderboard-showcase.ts` — solitaire rarity thresholds + goal copy.
- `lib/player-stats.test.ts` — extend the literal `byGame` fixture.
- `hooks/useLeaderboardShowcase.test.ts` — extend the literal fixture.
- `components/desktop/Desktop.tsx` — points-suffix branch.
- `app/page.tsx` — render `<SolitaireWindow />`.

---

# Phase 1 — Registry & plumbing (game registered, icon appears, tsc green)

### Task 1: Register solitaire in the game registry

**Files:**
- Modify: `lib/game-registry.ts`
- Test: `lib/game-registry.test.ts`

- [ ] **Step 1: Add the failing test**

In `lib/game-registry.test.ts`, after the `registers minesweeper as game id 5` test (around line 91), add:

```ts
  it("registers solitaire as game id 6", () => {
    expect(GAME_IDS).toContain("solitaire");
    expect(GAMES.solitaire.onchainId).toBe(6);
    expect(GAMES.solitaire.label).toBe("Solitaire");
    expect(GAMES.solitaire.mintFeeUstx).toBe(BigInt(20_000));
    expect(GAMES.solitaire.metaSegment).toBe("solitaire");
    expect(GAMES.solitaire.nftAssetName).toBe("xp-score");
    expect(GAMES.solitaire.contractName).toBe("xp-arcade-v4");
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run lib/game-registry.test.ts`
Expected: FAIL — `GAMES.solitaire` is undefined / type error on `"solitaire"`.

- [ ] **Step 3: Add the registry entry**

In `lib/game-registry.ts`:

1. Extend the union (line 1):
```ts
export type GameId = "snake" | "tetris" | "pacman" | "breakout" | "minesweeper" | "solitaire";
```
2. Add to `GAME_METADATA` (after the `minesweeper` line):
```ts
  solitaire: { id: "solitaire", label: "Solitaire", emoji: "🃏", onchainId: 6, mintFeeUstx: BigInt(20_000), metaSegment: "solitaire", nftAssetName: "xp-score" },
```
3. Add `solitaire: SHARED_V4` to BOTH the `mainnet` and `testnet` objects in `GAME_CONTRACTS`:
```ts
  mainnet: { snake: SHARED_V4, tetris: SHARED_V4, pacman: SHARED_V4, breakout: SHARED_V4, minesweeper: SHARED_V4, solitaire: SHARED_V4 },
  testnet: { snake: SHARED_V4, tetris: SHARED_V4, pacman: SHARED_V4, breakout: SHARED_V4, minesweeper: SHARED_V4, solitaire: SHARED_V4 },
```
4. Append to `GAME_IDS`:
```ts
export const GAME_IDS: GameId[] = ["snake", "tetris", "pacman", "breakout", "minesweeper", "solitaire"];
```
5. Add the spread line inside `buildGameRegistry`'s `validateGameRegistry({ … })` object (after the `minesweeper:` line):
```ts
    solitaire: { ...GAME_METADATA.solitaire, ...contracts.solitaire },
```

- [ ] **Step 4: Run the registry test**

Run: `npx vitest run lib/game-registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/game-registry.ts lib/game-registry.test.ts
git commit -m "feat(solitaire): register Solitaire as game id 6"
```

---

### Task 2: Fix exhaustive `Record<GameId>` maps so tsc compiles

**Files:**
- Modify: `lib/score-risk.ts`, `lib/score-card.ts`, `lib/daily-challenge.ts`, `lib/metadata-svg.ts`

These four maps must each gain a `solitaire` entry or `tsc` fails. No new tests — the existing suite + `tsc` are the gate.

- [ ] **Step 1: score-risk PROFILES**

In `lib/score-risk.ts`, add to the `PROFILES` object after the `minesweeper` entry. Solitaire is time-derived like minesweeper, so risk is effectively inert (any win is valid):

```ts
  solitaire: {
    practicalHigh: 9_990,
    extreme: 9_999,
    maxPerMinute: 1_000_000,
    fastScore: 9_999,
    minDurationMs: 30_000,
  },
```

- [ ] **Step 2: score-card GAME_BG**

In `lib/score-card.ts`, add to `GAME_BG` after `minesweeper`:
```ts
  solitaire: "#0a5c2e",
```

- [ ] **Step 3: daily-challenge DAILY_TARGETS**

In `lib/daily-challenge.ts`, add to `DAILY_TARGETS` after `minesweeper` (4000 = an Epic win ≈ 3 min; this also adds Solitaire to the daily rotation, which is intended):
```ts
  solitaire: 4000,
```

- [ ] **Step 4: metadata-svg GAME_BG (string-keyed by label)**

In `lib/metadata-svg.ts`, add to the `GAME_BG` map after `Minesweeper`:
```ts
  Solitaire: "#0a5c2e",
```

- [ ] **Step 5: Verify tsc + full suite are green**

Run: `npx tsc --noEmit && npm test`
Expected: PASS. (If `tsc` flags unrelated files, run `find .next -name "* 2.*" -delete` and retry.)

- [ ] **Step 6: Commit**

```bash
git add lib/score-risk.ts lib/score-card.ts lib/daily-challenge.ts lib/metadata-svg.ts
git commit -m "feat(solitaire): add solitaire to score/risk/daily/svg game maps"
```

---

### Task 3: Extend literal test fixtures for the new game id

**Files:**
- Modify: `lib/player-stats.test.ts`, `hooks/useLeaderboardShowcase.test.ts`

Both build a full `Record<GameId, …>` literal and now miss `solitaire`.

- [ ] **Step 1: player-stats.test.ts**

Find the `byGame` literal fixture containing `minesweeper: { totalMints: 0, … }` (around line 18) and add an identical-shaped `solitaire` entry next to it:
```ts
        solitaire: { totalMints: 0, bestScore: 0, totalScore: 0, seasonsPlayed: 0, mintFeesUstx: 0 },
```
(Match the exact field set used by the surrounding `minesweeper` entry in that file; copy its shape verbatim.)

- [ ] **Step 2: useLeaderboardShowcase.test.ts**

Find each literal object keyed by all game ids containing a `minesweeper:` key and add a `solitaire:` entry mirroring the `minesweeper` value's shape (e.g. for a rows map: `solitaire: [],`; for a number map: `solitaire: null,`). Match the neighbouring `minesweeper` value type exactly in every such literal.

- [ ] **Step 3: Run both test files**

Run: `npx vitest run lib/player-stats.test.ts hooks/useLeaderboardShowcase.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/player-stats.test.ts hooks/useLeaderboardShowcase.test.ts
git commit -m "test(solitaire): extend game-id fixtures for solitaire"
```

---

# Phase 2 — Scoring module

### Task 4: solitaire-score (forward + inverse)

**Files:**
- Create: `lib/solitaire-score.ts`
- Test: `lib/solitaire-score.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/solitaire-score.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { SOLITAIRE_BONUS_K, solitaireScore, solitaireSeconds } from "./solitaire-score";

describe("solitaire-score", () => {
  it("uses the 720000 bonus constant", () => {
    expect(SOLITAIRE_BONUS_K).toBe(720_000);
  });

  it("maps win time to a bounded integer score", () => {
    expect(solitaireScore(120)).toBe(6000);
    expect(solitaireScore(180)).toBe(4000);
    expect(solitaireScore(300)).toBe(2400);
  });

  it("clamps very fast wins to the 9999 cap", () => {
    expect(solitaireScore(10)).toBe(9999);
    expect(solitaireScore(0)).toBe(9999); // guarded against divide-by-zero
  });

  it("never returns a negative or non-integer score", () => {
    const s = solitaireScore(99999);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
  });

  it("solitaireSeconds inverts the score back to win time", () => {
    expect(solitaireSeconds(6000)).toBe(120);
    expect(solitaireSeconds(4000)).toBe(180);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run lib/solitaire-score.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/solitaire-score.ts`:
```ts
/** Homage to Microsoft Solitaire's original end-game time bonus (700000/time). */
export const SOLITAIRE_BONUS_K = 720_000;

/** Win time (seconds) -> on-chain score. Bounded to [0, 9999], integer. */
export function solitaireScore(winSeconds: number): number {
  const seconds = Math.max(1, Math.floor(winSeconds));
  return Math.min(9999, Math.max(0, Math.round(SOLITAIRE_BONUS_K / seconds)));
}

/** Inverse of solitaireScore: stored score -> displayed win time (seconds). */
export function solitaireSeconds(score: number): number {
  const s = Math.max(1, Math.floor(score));
  return Math.round(SOLITAIRE_BONUS_K / s);
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/solitaire-score.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/solitaire-score.ts lib/solitaire-score.test.ts
git commit -m "feat(solitaire): pure score formula (720000/seconds, clamped)"
```

---

# Phase 3 — Game-aware display

### Task 5: score-format "Won in Ns"

**Files:**
- Modify: `lib/score-format.ts`
- Test: `lib/score-format.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create or extend `lib/score-format.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatScore, formatScoreValue } from "./score-format";

describe("score-format solitaire", () => {
  it("phrases solitaire scores as a win time", () => {
    expect(formatScore("solitaire", 6000)).toBe("Won in 120s");
    expect(formatScoreValue("solitaire", 6000)).toBe("120s");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run lib/score-format.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `lib/score-format.ts`, add the import at the top:
```ts
import { solitaireSeconds } from "./solitaire-score";
```
In `formatScore`, before the final `return String(score);`:
```ts
  if (gameId === "solitaire") return `Won in ${solitaireSeconds(score)}s`;
```
In `formatScoreValue`, before the final `return String(score);`:
```ts
  if (gameId === "solitaire") return `${solitaireSeconds(score)}s`;
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/score-format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/score-format.ts lib/score-format.test.ts
git commit -m "feat(solitaire): score-format shows win time"
```

---

### Task 6: leaderboard rarity thresholds + goal copy

**Files:**
- Modify: `lib/leaderboard-showcase.ts`
- Test: `lib/leaderboard-showcase.test.ts`

- [ ] **Step 1: Write the failing test**

In `lib/leaderboard-showcase.test.ts`, add (mirroring the existing minesweeper block):
```ts
describe("leaderboard-showcase solitaire", () => {
  it("uses solitaire rarity thresholds (2400/4000/6000)", () => {
    expect(scoreRarity(2399, "solitaire")).toBe("Common");
    expect(scoreRarity(2400, "solitaire")).toBe("Rare");
    expect(scoreRarity(4000, "solitaire")).toBe("Epic");
    expect(scoreRarity(6000, "solitaire")).toBe("Legendary");
  });

  it("phrases the solitaire gap in win-time, not points", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      player: `P${i}`,
      score: 5000 - i * 100,
    }));
    const goal = leaderboardGoal({ rows, score: 1000, gameId: "solitaire" });
    expect(goal.secondary).not.toContain("point");
  });
});
```
(Ensure `scoreRarity` and `leaderboardGoal` are imported in this test file; add them to the existing import if missing.)

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run lib/leaderboard-showcase.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement rarity thresholds**

In `lib/leaderboard-showcase.ts`, inside `scoreRarity`, after the `minesweeper` block and before the generic `if (score >= 1000)`:
```ts
  if (gameId === "solitaire") {
    if (score >= 6000) return "Legendary";
    if (score >= 4000) return "Epic";
    if (score >= 2400) return "Rare";
    return "Common";
  }
```

- [ ] **Step 4: Implement goal copy**

In `lib/leaderboard-showcase.ts`, in `leaderboardGoal`, the `gap` helper currently special-cases minesweeper. Both solitaire and minesweeper are time-based ("higher score = faster"), so a 1-point gap means "1s faster". Change the `gap` function to:
```ts
  const timeBased = gameId === "minesweeper" || gameId === "solitaire";
  const gap = (n: number) =>
    timeBased ? `${n}s faster` : `${n} more point${n === 1 ? "" : "s"}`;
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run lib/leaderboard-showcase.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/leaderboard-showcase.ts lib/leaderboard-showcase.test.ts
git commit -m "feat(solitaire): leaderboard rarity + time-based goal copy"
```

---

### Task 7: Desktop points-suffix branch

**Files:**
- Modify: `components/desktop/Desktop.tsx:225`

- [ ] **Step 1: Edit the suffix branch**

At `components/desktop/Desktop.tsx` line ~225, change:
```tsx
                  gameId === "minesweeper" ? "" : " points"
```
to:
```tsx
                  gameId === "minesweeper" || gameId === "solitaire" ? "" : " points"
```

- [ ] **Step 2: Verify tsc**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/desktop/Desktop.tsx
git commit -m "feat(solitaire): drop ' points' suffix for time-based solitaire"
```

---

# Phase 4 — Pure engine (TDD, one behaviour per task)

### Task 8: Card/deck types + `dealDeck` + `createGame`

**Files:**
- Create: `components/game/solitaire/SolitaireEngine.ts`
- Test: `components/game/solitaire/SolitaireEngine.test.ts`

- [ ] **Step 1: Write the failing test**

Create `components/game/solitaire/SolitaireEngine.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { makeDeck, dealDeck, createGame } from "./SolitaireEngine";

describe("SolitaireEngine deal", () => {
  it("makeDeck builds 52 unique cards", () => {
    const deck = makeDeck();
    expect(deck).toHaveLength(52);
    const keys = new Set(deck.map((c) => `${c.suit}${c.rank}`));
    expect(keys.size).toBe(52);
  });

  it("dealDeck lays out 28 tableau cards and the rest in stock", () => {
    const s = dealDeck(makeDeck(), 3);
    expect(s.tableau).toHaveLength(7);
    expect(s.foundations).toHaveLength(4);
    expect(s.tableau.reduce((n, p) => n + p.length, 0)).toBe(28);
    s.tableau.forEach((pile, i) => expect(pile).toHaveLength(i + 1));
    expect(s.stock).toHaveLength(24);
    expect(s.waste).toHaveLength(0);
    expect(s.drawMode).toBe(3);
    expect(s.won).toBe(false);
  });

  it("only the top card of each tableau pile is face-up", () => {
    const s = dealDeck(makeDeck(), 1);
    s.tableau.forEach((pile) => {
      pile.forEach((card, idx) =>
        expect(card.faceUp).toBe(idx === pile.length - 1),
      );
    });
    s.stock.forEach((card) => expect(card.faceUp).toBe(false));
  });

  it("createGame is deterministic under a seeded rng", () => {
    const rng = () => 0.42;
    const a = createGame(3, rng);
    const b = createGame(3, rng);
    expect(a.tableau).toEqual(b.tableau);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run components/game/solitaire/SolitaireEngine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement types + deal**

Create `components/game/solitaire/SolitaireEngine.ts`:
```ts
export type Suit = "S" | "H" | "D" | "C";
export type DrawMode = 1 | 3;
export type Card = { suit: Suit; rank: number; faceUp: boolean }; // rank 1..13

export type SolitaireState = {
  stock: Card[];
  waste: Card[];
  foundations: Card[][]; // 4 piles, build A..K by suit
  tableau: Card[][]; // 7 piles, build down alternating colour
  drawMode: DrawMode;
  moveCount: number;
  won: boolean;
};

const SUITS: Suit[] = ["S", "H", "D", "C"];

export function isRed(suit: Suit): boolean {
  return suit === "H" || suit === "D";
}

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) deck.push({ suit, rank, faceUp: false });
  }
  return deck;
}

function shuffle(deck: Card[], rng: () => number): Card[] {
  const out = deck.map((c) => ({ ...c }));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Deterministic deal from an already-ordered deck (top of deck dealt first). */
export function dealDeck(deck: Card[], drawMode: DrawMode): SolitaireState {
  const cards = deck.map((c) => ({ ...c, faceUp: false }));
  const tableau: Card[][] = [[], [], [], [], [], [], []];
  let idx = 0;
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      const card = cards[idx++];
      card.faceUp = row === col; // top card face-up
      tableau[col].push(card);
    }
  }
  const stock = cards.slice(idx); // remain face-down
  return {
    stock,
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    drawMode,
    moveCount: 0,
    won: false,
  };
}

export function createGame(drawMode: DrawMode, rng: () => number = Math.random): SolitaireState {
  return dealDeck(shuffle(makeDeck(), rng), drawMode);
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run components/game/solitaire/SolitaireEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/game/solitaire/SolitaireEngine.ts components/game/solitaire/SolitaireEngine.test.ts
git commit -m "feat(solitaire): engine deal (deck, dealDeck, createGame)"
```

---

### Task 9: `draw` (draw-N + waste recycle)

**Files:**
- Modify: `components/game/solitaire/SolitaireEngine.ts`
- Test: `components/game/solitaire/SolitaireEngine.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `SolitaireEngine.test.ts`:
```ts
import { draw } from "./SolitaireEngine"; // add to existing import line

describe("SolitaireEngine draw", () => {
  it("draw-3 moves up to three face-up cards to the waste", () => {
    const s = dealDeck(makeDeck(), 3);
    const after = draw(s);
    expect(after.waste).toHaveLength(3);
    expect(after.stock).toHaveLength(21);
    after.waste.forEach((c) => expect(c.faceUp).toBe(true));
  });

  it("draw-1 moves a single card", () => {
    const s = dealDeck(makeDeck(), 1);
    expect(draw(s).waste).toHaveLength(1);
  });

  it("recycles the waste back into the stock when stock is empty", () => {
    let s = dealDeck(makeDeck(), 3);
    for (let i = 0; i < 8; i++) s = draw(s); // exhaust 24-card stock
    expect(s.stock).toHaveLength(0);
    expect(s.waste).toHaveLength(24);
    const recycled = draw(s);
    expect(recycled.stock).toHaveLength(24);
    expect(recycled.waste).toHaveLength(0);
    recycled.stock.forEach((c) => expect(c.faceUp).toBe(false));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run components/game/solitaire/SolitaireEngine.test.ts`
Expected: FAIL — `draw` is not exported.

- [ ] **Step 3: Implement**

Add to `SolitaireEngine.ts`:
```ts
/** Deal `drawMode` cards stock->waste; if stock is empty, recycle the waste. */
export function draw(state: SolitaireState): SolitaireState {
  if (state.won) return state;
  if (state.stock.length === 0) {
    if (state.waste.length === 0) return state;
    const stock = [...state.waste].reverse().map((c) => ({ ...c, faceUp: false }));
    return { ...state, stock, waste: [], moveCount: state.moveCount + 1 };
  }
  const n = Math.min(state.drawMode, state.stock.length);
  const taken = state.stock.slice(state.stock.length - n).reverse();
  const stock = state.stock.slice(0, state.stock.length - n);
  const waste = [...state.waste, ...taken.map((c) => ({ ...c, faceUp: true }))];
  return { ...state, stock, waste, moveCount: state.moveCount + 1 };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run components/game/solitaire/SolitaireEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/game/solitaire/SolitaireEngine.ts components/game/solitaire/SolitaireEngine.test.ts
git commit -m "feat(solitaire): engine draw + waste recycle"
```

---

### Task 10: Move-validation predicates

**Files:**
- Modify: `components/game/solitaire/SolitaireEngine.ts`
- Test: `components/game/solitaire/SolitaireEngine.test.ts`

- [ ] **Step 1: Write the failing test**

Append:
```ts
import { canMoveToFoundation, canStackOnTableau } from "./SolitaireEngine"; // add to import

describe("SolitaireEngine move rules", () => {
  it("foundation: empty accepts only an Ace; then same suit ascending", () => {
    expect(canMoveToFoundation({ suit: "S", rank: 1, faceUp: true }, [])).toBe(true);
    expect(canMoveToFoundation({ suit: "S", rank: 2, faceUp: true }, [])).toBe(false);
    const acePile = [{ suit: "S" as const, rank: 1, faceUp: true }];
    expect(canMoveToFoundation({ suit: "S", rank: 2, faceUp: true }, acePile)).toBe(true);
    expect(canMoveToFoundation({ suit: "H", rank: 2, faceUp: true }, acePile)).toBe(false);
  });

  it("tableau: empty accepts only a King", () => {
    expect(canStackOnTableau({ suit: "S", rank: 13, faceUp: true }, null)).toBe(true);
    expect(canStackOnTableau({ suit: "S", rank: 12, faceUp: true }, null)).toBe(false);
  });

  it("tableau: stacks one lower onto the opposite colour", () => {
    const redSeven = { suit: "H" as const, rank: 7, faceUp: true };
    expect(canStackOnTableau({ suit: "S", rank: 6, faceUp: true }, redSeven)).toBe(true);
    expect(canStackOnTableau({ suit: "C", rank: 6, faceUp: true }, redSeven)).toBe(true);
    expect(canStackOnTableau({ suit: "H", rank: 6, faceUp: true }, redSeven)).toBe(false);
    expect(canStackOnTableau({ suit: "S", rank: 5, faceUp: true }, redSeven)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run components/game/solitaire/SolitaireEngine.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `SolitaireEngine.ts`:
```ts
export function canMoveToFoundation(card: Card, foundationPile: Card[]): boolean {
  if (foundationPile.length === 0) return card.rank === 1;
  const top = foundationPile[foundationPile.length - 1];
  return card.suit === top.suit && card.rank === top.rank + 1;
}

export function canStackOnTableau(card: Card, destTop: Card | null): boolean {
  if (destTop === null) return card.rank === 13;
  return isRed(card.suit) !== isRed(destTop.suit) && card.rank === destTop.rank - 1;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run components/game/solitaire/SolitaireEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/game/solitaire/SolitaireEngine.ts components/game/solitaire/SolitaireEngine.test.ts
git commit -m "feat(solitaire): move-validation predicates"
```

---

### Task 11: `selectableRun` (which face-up run a click grabs)

**Files:**
- Modify: `components/game/solitaire/SolitaireEngine.ts`
- Test: `components/game/solitaire/SolitaireEngine.test.ts`

- [ ] **Step 1: Write the failing test**

Append:
```ts
import { selectableRun } from "./SolitaireEngine"; // add to import

describe("SolitaireEngine selectableRun", () => {
  const pile = [
    { suit: "C" as const, rank: 9, faceUp: false },
    { suit: "H" as const, rank: 8, faceUp: true },
    { suit: "S" as const, rank: 7, faceUp: true }, // alternating, descending
  ];
  const state = { ...dealDeck(makeDeck(), 1), tableau: [pile, [], [], [], [], [], []] };

  it("grabs a valid alternating descending run from the clicked index", () => {
    expect(selectableRun(state, 0, 1)).toHaveLength(2); // 8H,7S
    expect(selectableRun(state, 0, 2)).toHaveLength(1); // 7S
  });

  it("returns null for a face-down card", () => {
    expect(selectableRun(state, 0, 0)).toBeNull();
  });

  it("returns null when the run below is not a valid sequence", () => {
    const broken = [
      { suit: "H" as const, rank: 8, faceUp: true },
      { suit: "S" as const, rank: 2, faceUp: true }, // not 7 -> invalid
    ];
    const st = { ...state, tableau: [broken, [], [], [], [], [], []] };
    expect(selectableRun(st, 0, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run components/game/solitaire/SolitaireEngine.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `SolitaireEngine.ts`:
```ts
/** The face-up alternating-descending run starting at `index`, or null if the
 *  card is face-down or the cards below it don't form a valid movable run. */
export function selectableRun(
  state: SolitaireState,
  tableauIndex: number,
  index: number,
): Card[] | null {
  const pile = state.tableau[tableauIndex];
  const card = pile[index];
  if (!card || !card.faceUp) return null;
  const run = pile.slice(index);
  for (let i = 1; i < run.length; i++) {
    if (!canStackOnTableau(run[i], run[i - 1])) return null;
  }
  return run;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run components/game/solitaire/SolitaireEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/game/solitaire/SolitaireEngine.ts components/game/solitaire/SolitaireEngine.test.ts
git commit -m "feat(solitaire): selectableRun"
```

---

### Task 12: `moveCards` (apply a validated move + flip exposed card)

**Files:**
- Modify: `components/game/solitaire/SolitaireEngine.ts`
- Test: `components/game/solitaire/SolitaireEngine.test.ts`

The move source/destination are addressed by a `PileRef`.

- [ ] **Step 1: Write the failing test**

Append:
```ts
import { moveCards, type PileRef } from "./SolitaireEngine"; // add to import

describe("SolitaireEngine moveCards", () => {
  function baseState(): SolitaireStateForTest {
    return {
      ...dealDeck(makeDeck(), 1),
      stock: [],
      waste: [{ suit: "S", rank: 1, faceUp: true }],
      foundations: [[], [], [], []],
      tableau: [
        [
          { suit: "C", rank: 5, faceUp: false },
          { suit: "H", rank: 8, faceUp: true },
        ],
        [{ suit: "S", rank: 9, faceUp: true }],
        [], [], [], [], [],
      ],
    };
  }

  it("moves waste Ace onto an empty foundation and increments moveCount", () => {
    const s = baseState();
    const from: PileRef = { kind: "waste" };
    const to: PileRef = { kind: "foundation", index: 0 };
    const after = moveCards(s, from, 0, to);
    expect(after.foundations[0]).toHaveLength(1);
    expect(after.waste).toHaveLength(0);
    expect(after.moveCount).toBe(s.moveCount + 1);
  });

  it("moves an 8H onto a 9S and flips the newly exposed tableau card", () => {
    const s = baseState();
    const from: PileRef = { kind: "tableau", index: 0 };
    const to: PileRef = { kind: "tableau", index: 1 };
    const after = moveCards(s, from, 1, to); // index 1 = the 8H
    expect(after.tableau[1].map((c) => c.rank)).toEqual([9, 8]);
    expect(after.tableau[0]).toHaveLength(1);
    expect(after.tableau[0][0].faceUp).toBe(true); // 5C flipped up
  });

  it("returns the same state for an illegal move", () => {
    const s = baseState();
    const from: PileRef = { kind: "tableau", index: 0 };
    const to: PileRef = { kind: "foundation", index: 0 };
    const after = moveCards(s, from, 1, to); // 8H cannot go to empty foundation
    expect(after).toBe(s);
  });
});
```

Add this helper type alias near the top of the test file (after imports) so the literal compiles:
```ts
type SolitaireStateForTest = import("./SolitaireEngine").SolitaireState;
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run components/game/solitaire/SolitaireEngine.test.ts`
Expected: FAIL — `moveCards` / `PileRef` not exported.

- [ ] **Step 3: Implement**

Add to `SolitaireEngine.ts`:
```ts
export type PileRef =
  | { kind: "tableau"; index: number }
  | { kind: "foundation"; index: number }
  | { kind: "waste" }
  | { kind: "stock" };

function clonePiles(piles: Card[][]): Card[][] {
  return piles.map((p) => p.map((c) => ({ ...c })));
}

/** The cards being moved, given a source pile + the card index within it. */
function movingCards(state: SolitaireState, from: PileRef, index: number): Card[] | null {
  if (from.kind === "waste") {
    const top = state.waste[state.waste.length - 1];
    return top ? [top] : null;
  }
  if (from.kind === "tableau") return selectableRun(state, from.index, index);
  return null; // foundation/stock are never move sources here
}

/** Apply a validated move. Returns the unchanged state if the move is illegal. */
export function moveCards(
  state: SolitaireState,
  from: PileRef,
  index: number,
  to: PileRef,
): SolitaireState {
  if (state.won) return state;
  const moving = movingCards(state, from, index);
  if (!moving || moving.length === 0) return state;

  if (to.kind === "foundation") {
    if (moving.length !== 1) return state;
    if (!canMoveToFoundation(moving[0], state.foundations[to.index])) return state;
  } else if (to.kind === "tableau") {
    const destPile = state.tableau[to.index];
    const destTop = destPile.length ? destPile[destPile.length - 1] : null;
    if (!canStackOnTableau(moving[0], destTop)) return state;
  } else {
    return state;
  }

  const next: SolitaireState = {
    ...state,
    waste: [...state.waste],
    foundations: clonePiles(state.foundations),
    tableau: clonePiles(state.tableau),
    moveCount: state.moveCount + 1,
  };

  // Remove from source.
  if (from.kind === "waste") {
    next.waste.pop();
  } else if (from.kind === "tableau") {
    const src = next.tableau[from.index];
    src.splice(index, moving.length);
    const exposed = src[src.length - 1];
    if (exposed) exposed.faceUp = true; // flip the newly revealed card
  }

  // Add to destination.
  const placed = moving.map((c) => ({ ...c, faceUp: true }));
  if (to.kind === "foundation") next.foundations[to.index].push(...placed);
  else if (to.kind === "tableau") next.tableau[to.index].push(...placed);

  next.won = isWonInternal(next);
  return next;
}

function isWonInternal(state: SolitaireState): boolean {
  return state.foundations.reduce((n, p) => n + p.length, 0) === 52;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run components/game/solitaire/SolitaireEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/game/solitaire/SolitaireEngine.ts components/game/solitaire/SolitaireEngine.test.ts
git commit -m "feat(solitaire): moveCards with exposed-card flip"
```

---

### Task 13: `sendToFoundation` (double-click helper) + `isWon`

**Files:**
- Modify: `components/game/solitaire/SolitaireEngine.ts`
- Test: `components/game/solitaire/SolitaireEngine.test.ts`

- [ ] **Step 1: Write the failing test**

Append:
```ts
import { sendToFoundation, isWon } from "./SolitaireEngine"; // add to import

describe("SolitaireEngine sendToFoundation + isWon", () => {
  it("auto-routes a card to the first legal foundation", () => {
    const s: SolitaireStateForTest = {
      ...dealDeck(makeDeck(), 1),
      stock: [],
      waste: [{ suit: "D", rank: 1, faceUp: true }],
      foundations: [[], [], [], []],
      tableau: [[], [], [], [], [], [], []],
    };
    const after = sendToFoundation(s, { kind: "waste" }, 0);
    const total = after.foundations.reduce((n, p) => n + p.length, 0);
    expect(total).toBe(1);
    expect(after.waste).toHaveLength(0);
  });

  it("no-ops when no foundation accepts the card", () => {
    const s: SolitaireStateForTest = {
      ...dealDeck(makeDeck(), 1),
      stock: [],
      waste: [{ suit: "D", rank: 5, faceUp: true }],
      foundations: [[], [], [], []],
      tableau: [[], [], [], [], [], [], []],
    };
    expect(sendToFoundation(s, { kind: "waste" }, 0)).toBe(s);
  });

  it("isWon is true only when all 52 are on foundations", () => {
    const full = ["S", "H", "D", "C"].map((suit) =>
      Array.from({ length: 13 }, (_, i) => ({ suit: suit as Suit, rank: i + 1, faceUp: true })),
    );
    const s: SolitaireStateForTest = {
      ...dealDeck(makeDeck(), 1),
      stock: [], waste: [], tableau: [[], [], [], [], [], [], []],
      foundations: full,
    };
    expect(isWon(s)).toBe(true);
    expect(isWon(dealDeck(makeDeck(), 1))).toBe(false);
  });
});
```
(Add `Suit` to the import from `./SolitaireEngine`.)

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run components/game/solitaire/SolitaireEngine.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `SolitaireEngine.ts`:
```ts
export function isWon(state: SolitaireState): boolean {
  return isWonInternal(state);
}

/** Move the addressed card to whatever foundation accepts it (double-click). */
export function sendToFoundation(
  state: SolitaireState,
  from: PileRef,
  index: number,
): SolitaireState {
  const moving = movingCards(state, from, index);
  if (!moving || moving.length !== 1) return state;
  for (let f = 0; f < 4; f++) {
    if (canMoveToFoundation(moving[0], state.foundations[f])) {
      return moveCards(state, from, index, { kind: "foundation", index: f });
    }
  }
  return state;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run components/game/solitaire/SolitaireEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/game/solitaire/SolitaireEngine.ts components/game/solitaire/SolitaireEngine.test.ts
git commit -m "feat(solitaire): sendToFoundation + isWon"
```

---

### Task 14: `canAutoComplete` + `autoComplete`

**Files:**
- Modify: `components/game/solitaire/SolitaireEngine.ts`
- Test: `components/game/solitaire/SolitaireEngine.test.ts`

- [ ] **Step 1: Write the failing test**

Append:
```ts
import { canAutoComplete, autoComplete } from "./SolitaireEngine"; // add to import

describe("SolitaireEngine auto-complete", () => {
  it("is available only when stock is empty and no tableau card is face-down", () => {
    const ready: SolitaireStateForTest = {
      ...dealDeck(makeDeck(), 1),
      stock: [],
      waste: [],
      tableau: [
        [{ suit: "S", rank: 1, faceUp: true }],
        [], [], [], [], [], [],
      ],
      foundations: [[], [], [], []],
    };
    expect(canAutoComplete(ready)).toBe(true);

    const faceDown = { ...ready, tableau: [[{ suit: "S" as const, rank: 1, faceUp: false }], [], [], [], [], [], []] };
    expect(canAutoComplete(faceDown)).toBe(false);

    const withStock = { ...ready, stock: [{ suit: "S" as const, rank: 2, faceUp: false }] };
    expect(canAutoComplete(withStock)).toBe(false);
  });

  it("autoComplete flushes everything to the foundations and wins", () => {
    // Build a state one move from done: foundations hold A..Q of every suit,
    // each pile's King sits face-up on a tableau column.
    const foundations = ["S", "H", "D", "C"].map((suit) =>
      Array.from({ length: 12 }, (_, i) => ({ suit: suit as Suit, rank: i + 1, faceUp: true })),
    );
    const tableau: SolitaireStateForTest["tableau"] = [
      [{ suit: "S", rank: 13, faceUp: true }],
      [{ suit: "H", rank: 13, faceUp: true }],
      [{ suit: "D", rank: 13, faceUp: true }],
      [{ suit: "C", rank: 13, faceUp: true }],
      [], [], [],
    ];
    const s: SolitaireStateForTest = {
      ...dealDeck(makeDeck(), 1), stock: [], waste: [], foundations, tableau,
    };
    const done = autoComplete(s);
    expect(isWon(done)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run components/game/solitaire/SolitaireEngine.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `SolitaireEngine.ts`:
```ts
/** True when the game can finish itself: stock empty and every tableau card up.
 *  (Waste cards are always face-up, so they don't block auto-complete.) */
export function canAutoComplete(state: SolitaireState): boolean {
  if (state.won) return false;
  if (state.stock.length > 0) return false;
  return state.tableau.every((pile) => pile.every((c) => c.faceUp));
}

/** Repeatedly send the lowest available waste/tableau top card to a foundation
 *  until nothing else can move. */
export function autoComplete(state: SolitaireState): SolitaireState {
  let s = state;
  let progressed = true;
  while (progressed && !isWonInternal(s)) {
    progressed = false;
    // Waste top.
    if (s.waste.length) {
      const next = sendToFoundation(s, { kind: "waste" }, s.waste.length - 1);
      if (next !== s) { s = next; progressed = true; continue; }
    }
    // Each tableau top.
    for (let t = 0; t < 7; t++) {
      const pile = s.tableau[t];
      if (!pile.length) continue;
      const next = sendToFoundation(s, { kind: "tableau", index: t }, pile.length - 1);
      if (next !== s) { s = next; progressed = true; break; }
    }
  }
  return s;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run components/game/solitaire/SolitaireEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/game/solitaire/SolitaireEngine.ts components/game/solitaire/SolitaireEngine.test.ts
git commit -m "feat(solitaire): canAutoComplete + autoComplete"
```

---

# Phase 5 — UI

### Task 15: `Card.tsx` renderer

**Files:**
- Create: `components/game/solitaire/Card.tsx`
- Test: `components/game/solitaire/Card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/game/solitaire/Card.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CardView } from "./Card";

describe("CardView", () => {
  it("shows rank + suit for a face-up card", () => {
    const { container } = render(
      <CardView card={{ suit: "H", rank: 1, faceUp: true }} />,
    );
    expect(container.textContent).toContain("A");
    expect(container.textContent).toContain("♥");
  });

  it("hides the face of a face-down card", () => {
    const { container } = render(
      <CardView card={{ suit: "H", rank: 1, faceUp: false }} />,
    );
    expect(container.textContent).not.toContain("A");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run components/game/solitaire/Card.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `components/game/solitaire/Card.tsx`:
```tsx
"use client";
import { type Card, isRed } from "./SolitaireEngine";

const SUIT_SYMBOL: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RANK_LABEL: Record<number, string> = {
  1: "A", 11: "J", 12: "Q", 13: "K",
};

export const CARD_W = 44;
export const CARD_H = 60;

export function CardView({
  card,
  selected = false,
  onClick,
  onDoubleClick,
}: {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}) {
  const label = RANK_LABEL[card.rank] ?? String(card.rank);
  const symbol = SUIT_SYMBOL[card.suit];
  const red = isRed(card.suit);
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.();
      }}
      style={{
        width: CARD_W,
        height: CARD_H,
        boxSizing: "border-box",
        borderRadius: 4,
        border: selected ? "2px solid #ffe000" : "1px solid #555",
        background: card.faceUp
          ? "#fff"
          : "repeating-linear-gradient(45deg,#1a4ea8,#1a4ea8 4px,#2a5ec8 4px,#2a5ec8 8px)",
        color: red ? "#c00000" : "#000",
        fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
        fontSize: 13,
        fontWeight: "bold",
        padding: 3,
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      {card.faceUp ? (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span>{label}</span>
          <span>{symbol}</span>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run components/game/solitaire/Card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/game/solitaire/Card.tsx components/game/solitaire/Card.test.tsx
git commit -m "feat(solitaire): Card renderer"
```

---

### Task 16: `SolitaireBoard.tsx` renderer

**Files:**
- Create: `components/game/solitaire/SolitaireBoard.tsx`
- Test: `components/game/solitaire/SolitaireBoard.test.tsx`

The board is presentational: it renders stock/waste/foundations/tableau and emits semantic click events. Selection logic stays in the window.

- [ ] **Step 1: Write the failing test**

Create `components/game/solitaire/SolitaireBoard.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { dealDeck, makeDeck } from "./SolitaireEngine";
import { SolitaireBoard } from "./SolitaireBoard";

describe("SolitaireBoard", () => {
  it("renders four foundation slots and seven tableau columns", () => {
    const { getByLabelText } = render(
      <SolitaireBoard state={dealDeck(makeDeck(), 3)} selected={null} on={{}} />,
    );
    expect(getByLabelText("Solitaire board")).toBeTruthy();
    for (let i = 0; i < 7; i++) expect(getByLabelText(`tableau ${i + 1}`)).toBeTruthy();
  });

  it("fires onStockClick when the stock pile is clicked", () => {
    const onStockClick = vi.fn();
    const { getByLabelText } = render(
      <SolitaireBoard state={dealDeck(makeDeck(), 3)} selected={null} on={{ onStockClick }} />,
    );
    fireEvent.click(getByLabelText("stock"));
    expect(onStockClick).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run components/game/solitaire/SolitaireBoard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `components/game/solitaire/SolitaireBoard.tsx`:
```tsx
"use client";
import { type SolitaireState, type PileRef } from "./SolitaireEngine";
import { CardView, CARD_W, CARD_H } from "./Card";

export type Selected = { tableauIndex: number; cardIndex: number } | { waste: true } | null;

export type BoardHandlers = {
  onStockClick?: () => void;
  onWasteClick?: () => void;
  onFoundationClick?: (index: number) => void;
  onTableauCardClick?: (tableauIndex: number, cardIndex: number) => void;
  onEmptyTableauClick?: (tableauIndex: number) => void;
  onDoubleClick?: (from: PileRef, index: number) => void;
};

const SLOT: React.CSSProperties = {
  width: CARD_W,
  height: CARD_H,
  borderRadius: 4,
  border: "1px dashed #2a7a4a",
  background: "rgba(255,255,255,0.06)",
};

function isWasteSelected(sel: Selected): boolean {
  return !!sel && "waste" in sel;
}

export function SolitaireBoard({
  state,
  selected,
  on,
}: {
  state: SolitaireState;
  selected: Selected;
  on: BoardHandlers;
}) {
  const wasteTop = state.waste[state.waste.length - 1] ?? null;
  return (
    <div
      aria-label="Solitaire board"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 10,
        background: "#0a5c2e",
        borderRadius: 6,
        userSelect: "none",
      }}
    >
      {/* Top row: stock, waste, spacer, 4 foundations */}
      <div style={{ display: "flex", gap: 8 }}>
        <div
          aria-label="stock"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); on.onStockClick?.(); }}
          style={{ ...SLOT, cursor: "pointer", background: state.stock.length ? "#1a4ea8" : SLOT.background }}
        />
        <div
          aria-label="waste"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); on.onWasteClick?.(); }}
          style={{ width: CARD_W, height: CARD_H }}
        >
          {wasteTop ? (
            <CardView
              card={wasteTop}
              selected={isWasteSelected(selected)}
              onClick={() => on.onWasteClick?.()}
              onDoubleClick={() => on.onDoubleClick?.({ kind: "waste" }, state.waste.length - 1)}
            />
          ) : (
            <div style={SLOT} />
          )}
        </div>
        <div style={{ width: CARD_W }} />
        {state.foundations.map((pile, f) => {
          const top = pile[pile.length - 1] ?? null;
          return (
            <div
              key={f}
              aria-label={`foundation ${f + 1}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); on.onFoundationClick?.(f); }}
              style={{ width: CARD_W, height: CARD_H, cursor: "pointer" }}
            >
              {top ? <CardView card={top} /> : <div style={SLOT} />}
            </div>
          );
        })}
      </div>

      {/* Tableau */}
      <div style={{ display: "flex", gap: 8 }}>
        {state.tableau.map((pile, t) => (
          <div
            key={t}
            aria-label={`tableau ${t + 1}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (pile.length === 0) on.onEmptyTableauClick?.(t);
            }}
            style={{ position: "relative", width: CARD_W, minHeight: CARD_H }}
          >
            {pile.length === 0 ? <div style={SLOT} /> : null}
            {pile.map((card, ci) => {
              const isSel =
                !!selected &&
                "tableauIndex" in selected &&
                selected.tableauIndex === t &&
                ci >= selected.cardIndex;
              return (
                <div key={ci} style={{ position: "absolute", top: ci * 18 }}>
                  <CardView
                    card={card}
                    selected={isSel}
                    onClick={() => on.onTableauCardClick?.(t, ci)}
                    onDoubleClick={() => on.onDoubleClick?.({ kind: "tableau", index: t }, ci)}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run components/game/solitaire/SolitaireBoard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/game/solitaire/SolitaireBoard.tsx components/game/solitaire/SolitaireBoard.test.tsx
git commit -m "feat(solitaire): board renderer with semantic click events"
```

---

### Task 17: `SolitaireWindow.tsx` (selection logic, timer, mint wiring)

**Files:**
- Create: `components/game/solitaire/SolitaireWindow.tsx`
- Test: `components/game/solitaire/SolitaireWindow.test.tsx`

Mirrors `MinesweeperWindow`: ranked = Draw-3, practice = Draw-1; submit once on a ranked win; timer freezes when auto-complete becomes available.

- [ ] **Step 1: Write the failing test**

Create `components/game/solitaire/SolitaireWindow.test.tsx` (a light smoke test — heavy logic is covered by the engine tests):
```tsx
import { describe, it, expect, vi } from "vitest";

// The window pulls in many stores; this test only asserts the module loads and
// the scoring wiring constant is correct. Full play-through is engine-tested.
import { solitaireScore } from "@/lib/solitaire-score";

describe("SolitaireWindow wiring", () => {
  it("a 2-minute win computes to a 6000 score", () => {
    expect(solitaireScore(120)).toBe(6000);
  });

  it("module imports without throwing", async () => {
    vi.stubGlobal("matchMedia", undefined);
    const mod = await import("./SolitaireWindow");
    expect(typeof mod.SolitaireWindow).toBe("function");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run components/game/solitaire/SolitaireWindow.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `components/game/solitaire/SolitaireWindow.tsx`:
```tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { GameShellWindow } from "@/components/shared/GameShellWindow";
import { SharedMintDialog } from "@/components/shared/SharedMintDialog";
import { useGameSession } from "@/hooks/useGameSession";
import { solitaireScore } from "@/lib/solitaire-score";
import {
  type DrawMode,
  type PileRef,
  type SolitaireState,
  autoComplete,
  canAutoComplete,
  createGame,
  draw,
  moveCards,
  selectableRun,
  sendToFoundation,
} from "./SolitaireEngine";
import { SolitaireBoard, type Selected } from "./SolitaireBoard";

const RANKED: DrawMode = 3;

export function SolitaireWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "game-solitaire"));
  const close = useWindows((s) => s.close);
  const { finalScore, showMint, isTopScore, riskReport, handleGameOver, handlePlayAgain } =
    useGameSession("solitaire");

  const [drawMode, setDrawMode] = useState<DrawMode>(RANKED);
  const [game, setGame] = useState<SolitaireState>(() => createGame(RANKED));
  const [selected, setSelected] = useState<Selected>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const frozenSecondsRef = useRef<number | null>(null);
  const submittedRef = useRef(false);

  // Live timer until auto-complete becomes available or the game is won.
  useEffect(() => {
    if (game.won || frozenSecondsRef.current != null) return;
    const id = window.setInterval(() => {
      if (startedAtRef.current != null) {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [game.won]);

  // Freeze the clock the moment the board can finish itself.
  useEffect(() => {
    if (frozenSecondsRef.current == null && canAutoComplete(game) && startedAtRef.current != null) {
      frozenSecondsRef.current = Math.floor((Date.now() - startedAtRef.current) / 1000);
    }
  }, [game]);

  // Submit the score once on a ranked win.
  useEffect(() => {
    if (game.won && drawMode === RANKED && !submittedRef.current) {
      submittedRef.current = true;
      const sec = frozenSecondsRef.current ?? elapsed;
      void handleGameOver(solitaireScore(sec));
    }
  }, [game.won, drawMode, elapsed, handleGameOver]);

  const newGame = useCallback((mode: DrawMode) => {
    setGame(createGame(mode));
    setSelected(null);
    setElapsed(0);
    startedAtRef.current = null;
    frozenSecondsRef.current = null;
    submittedRef.current = false;
  }, []);

  const ensureStarted = useCallback(() => {
    if (startedAtRef.current == null) startedAtRef.current = Date.now();
  }, []);

  const applyMove = useCallback((from: PileRef, index: number, to: PileRef) => {
    ensureStarted();
    setGame((g) => moveCards(g, from, index, to));
    setSelected(null);
  }, [ensureStarted]);

  const onStockClick = useCallback(() => {
    ensureStarted();
    setSelected(null);
    setGame((g) => draw(g));
  }, [ensureStarted]);

  const onWasteClick = useCallback(() => {
    if (game.waste.length === 0) return;
    setSelected((sel) => (sel && "waste" in sel ? null : { waste: true }));
  }, [game.waste.length]);

  const onFoundationClick = useCallback((f: number) => {
    if (!selected) return;
    if ("waste" in selected) applyMove({ kind: "waste" }, game.waste.length - 1, { kind: "foundation", index: f });
    else applyMove({ kind: "tableau", index: selected.tableauIndex }, selected.cardIndex, { kind: "foundation", index: f });
  }, [selected, game.waste.length, applyMove]);

  const onTableauCardClick = useCallback((t: number, ci: number) => {
    if (selected) {
      if ("waste" in selected) applyMove({ kind: "waste" }, game.waste.length - 1, { kind: "tableau", index: t });
      else applyMove({ kind: "tableau", index: selected.tableauIndex }, selected.cardIndex, { kind: "tableau", index: t });
      return;
    }
    if (selectableRun(game, t, ci)) {
      ensureStarted();
      setSelected({ tableauIndex: t, cardIndex: ci });
    }
  }, [selected, game, applyMove, ensureStarted]);

  const onEmptyTableauClick = useCallback((t: number) => {
    if (!selected) return;
    if ("waste" in selected) applyMove({ kind: "waste" }, game.waste.length - 1, { kind: "tableau", index: t });
    else applyMove({ kind: "tableau", index: selected.tableauIndex }, selected.cardIndex, { kind: "tableau", index: t });
  }, [selected, game.waste.length, applyMove]);

  const onDoubleClick = useCallback((from: PileRef, index: number) => {
    ensureStarted();
    setSelected(null);
    setGame((g) => sendToFoundation(g, from, index));
  }, [ensureStarted]);

  const onAutoFinish = useCallback(() => {
    setGame((g) => autoComplete(g));
  }, []);

  if (!w) return null;

  const liveScore = solitaireScore(frozenSecondsRef.current ?? elapsed);
  const practice = drawMode !== RANKED;
  const showAuto = canAutoComplete(game) && !game.won;

  return (
    <GameShellWindow gameId="solitaire" score={game.won && !practice ? liveScore : 0}>
      {showMint ? (
        <SharedMintDialog
          gameId="solitaire"
          score={finalScore}
          isTopScore={isTopScore}
          riskReport={riskReport}
          onClose={() => close(w.id)}
          onPlayAgain={() => {
            handlePlayAgain();
            newGame(drawMode);
          }}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif' }}>
            <label>
              Draw{" "}
              <select
                value={drawMode}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const m = Number(e.target.value) as DrawMode;
                  setDrawMode(m);
                  newGame(m);
                }}
              >
                <option value={3}>3 (ranked)</option>
                <option value={1}>1 (practice)</option>
              </select>
            </label>
            <span>⏱ {frozenSecondsRef.current ?? elapsed}s</span>
            <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); newGame(drawMode); }}>
              🂠 New
            </button>
            {showAuto && (
              <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onAutoFinish(); }}>
                ⚡ Auto-finish
              </button>
            )}
          </div>

          {practice && (
            <div style={{ fontSize: 10, color: "#8a5a00" }}>
              Practice — only Draw-3 is ranked &amp; mintable.
            </div>
          )}

          <div style={{ fontSize: 10, color: "#666" }}>
            Tip: click a card then a destination · double-click sends to a foundation.
          </div>

          <SolitaireBoard
            state={game}
            selected={selected}
            on={{ onStockClick, onWasteClick, onFoundationClick, onTableauCardClick, onEmptyTableauClick, onDoubleClick }}
          />

          {game.won && practice && (
            <div style={{ textAlign: "center", fontSize: 12 }}>
              <div style={{ fontWeight: "bold", color: "#007700" }}>
                Solved in {frozenSecondsRef.current ?? elapsed}s — practice run (not ranked)
              </div>
              <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setDrawMode(RANKED); newGame(RANKED); }}>
                Play Ranked (Draw-3)
              </button>
            </div>
          )}
        </div>
      )}
    </GameShellWindow>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run components/game/solitaire/SolitaireWindow.test.tsx`
Expected: PASS. (If the dynamic import fails on a missing store/global, adjust the smoke test's stubs — the wiring assertion is the essential part.)

- [ ] **Step 5: Commit**

```bash
git add components/game/solitaire/SolitaireWindow.tsx components/game/solitaire/SolitaireWindow.test.tsx
git commit -m "feat(solitaire): window with click-to-move, timer, mint wiring"
```

---

### Task 18: Render the window on the desktop

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Add the import + render**

In `app/page.tsx`, add the import after the `MinesweeperWindow` import (line 7):
```tsx
import { SolitaireWindow } from "@/components/game/solitaire/SolitaireWindow";
```
Add the render after `<MinesweeperWindow />` (line 23):
```tsx
        <SolitaireWindow />
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS. The desktop icon is auto-generated from `Object.values(GAMES)`, so no icon edit is needed.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(solitaire): mount SolitaireWindow on the desktop"
```

---

# Phase 6 — On-chain register plan (owner-run, NOT executed here)

### Task 19: Write the mainnet register plan file

**Files:**
- Create: `../contract/deployments/xp-arcade-v4-register-solitaire.mainnet-plan.yaml`

- [ ] **Step 1: Create the plan file**

Create `contract/deployments/xp-arcade-v4-register-solitaire.mainnet-plan.yaml`:
```yaml
id: 0
name: XP Arcade v4 register Solitaire (mainnet)
network: mainnet
stacks-node: https://api.hiro.so
bitcoin-node: http://blockstack:blockstacksystem@bitcoin.blockstack.com:8332
# PERMANENT, owner-only. Run with the deployer wallet:
#   clarinet deployments apply -p contract/deployments/xp-arcade-v4-register-solitaire.mainnet-plan.yaml --no-dashboard
# Never use -c on mainnet (it recomputes the fee). register-game freezes
# fee (u20000) + rarity thresholds (u2400 rare / u4000 epic / u6000 legend)
# forever. Confirm the season-end block below is still the current shared H
# used by games 1-5 before running; if the season rolled, use the live value.
plan:
  batches:
  - id: 0
    transactions:
    - transaction-type: contract-call
      contract-id: SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4
      expected-sender: SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV
      method: register-game
      parameters:
      - u6
      - '"Solitaire"'
      - u20000
      - u2400
      - u4000
      - u6000
      cost: 20000
    - transaction-type: contract-call
      contract-id: SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4
      expected-sender: SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV
      method: set-season-end-block
      parameters:
      - u6
      - u8470355
      cost: 10000
```

> NOTE: `u8470355` is the shared season-end block used by games 1–5 at the time
> of writing. Before running, confirm on-chain via `get-season-end-block` for an
> existing game; if the season has rolled, replace it with the current value.

- [ ] **Step 2: Commit (do NOT apply)**

```bash
git add ../contract/deployments/xp-arcade-v4-register-solitaire.mainnet-plan.yaml
git commit -m "chore(solitaire): mainnet register-game plan (owner-run)"
```

---

# Phase 7 — Final verification

### Task 20: Full gate

- [ ] **Step 1: Run the full gate**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all PASS. If `tsc` flags files you didn't touch: `find .next -name "* 2.*" -delete` then retry.

- [ ] **Step 2: Manual smoke (optional but recommended)**

Run `npm run dev`, open the desktop, launch `Solitaire.exe`, play a Draw-1 practice game to a win via click-to-move + double-click + auto-finish, confirm the timer freezes at auto-finish and a practice win does NOT show the mint dialog. Switch to Draw-3 and confirm a win opens `SharedMintDialog` with a sensible score.

- [ ] **Step 3: Done**

No further commit needed — the work was committed task-by-task. Hand off the register plan (Task 19) to the user to run with the deployer wallet, and note the branch is unpushed per project convention.

---

## Self-review notes (addressed)

- **Spec coverage:** rules (Tasks 8–14), Draw-3 ranked/Draw-1 practice (Task 17), win-only mint (Task 17), scoring `720000/seconds` + clamp (Task 4), frozen rarity 2400/4000/6000 (Tasks 6, 19), click-to-move + double-click (Tasks 16–17), auto-complete with frozen timer (Tasks 14, 17), all integration touchpoints (Tasks 1–3, 5–7, 18), contract register plan (Task 19), testing (every task). ✓
- **Exhaustive `Record<GameId>` maps** that would break `tsc` are each fixed in Phase 1 (score-risk, score-card, daily-challenge) + literal test fixtures (player-stats.test, useLeaderboardShowcase.test). ✓
- **Type consistency:** `PileRef`, `Selected`, `SolitaireState`, `DrawMode`, `solitaireScore`/`solitaireSeconds`, `canAutoComplete`/`autoComplete`, `selectableRun`, `moveCards`, `sendToFoundation` names match across engine, board, and window tasks. ✓
- **No drag-drop** (explicitly out of scope, v1). ✓
```
