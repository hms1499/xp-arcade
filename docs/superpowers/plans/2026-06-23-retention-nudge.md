# Retention Nudge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show one theme-native, loss-aversion in-app nudge (Win95 system-tray balloon) on app load that pulls the player back into a game, using only signals already available client-side.

**Architecture:** A pure decision function `selectNudge(signals)` picks the highest-priority eligible nudge from three candidate evaluators (rank-drop → season-closing → streak-risk). A `RetentionBalloon` component gathers signals from existing stores/fetchers, calls the engine, and renders a reusable `TrayBalloon` shell extracted from the existing `WalletBalloon`. Persistence (rank snapshot + per-kind daily dedup) lives in small load/save helpers mirroring `lib/daily-challenge.ts`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zustand 5, Vitest 3. Frontend only — no contract, no API, no new deps.

## Global Constraints

- Frontend only. No contract change, no API route, no new npm dependency.
- Path must not contain spaces (Vitest breaks on `%20`).
- All work under `frontend/`. Run gates from `frontend/`.
- Persistence helpers MUST be SSR-guarded (`typeof window === "undefined"` → no-op/default) and wrapped in try/catch (blocked storage → no-op), matching `lib/daily-challenge.ts`.
- Reuse existing modules — do NOT reimplement: `viewStreak`/`todayKey`/`dailyGame` (`lib/daily-challenge.ts`), `playerLiveRanks`/`LiveRanks` (`lib/player-ranks.ts`), `fetchLeaderboardSnapshot` (`lib/leaderboard-snapshot.ts`), `deriveCountdown`/`isCountdownUrgent`/`formatCountdown` (`lib/season-countdown.ts`), `getSeasonEndBlockForGame` (`lib/contract-calls.ts`), `getCurrentStacksBlockHeight` (`lib/stacks-api.ts`), `blocksToEta` (`lib/season-blocks.ts`), `GAMES`/`GAME_IDS`/`GameId` (`lib/game-registry.ts`), `useWindows` (`state/window-manager.ts`), `useWallet` (`state/wallet.ts`), `useDailyChallenge` (`state/daily-challenge.ts`).
- Window CTA targets: High Scores = `open("highscore", { initialTab: gameId })`; launch game = `open(\`game-${gameId}\`)`.
- Commit message prefixes: conventional (`feat:`, `refactor:`, `test:`). No `Co-Authored-By`. Stage explicit files. Do NOT push.
- Final gate (must pass before the feature is done): `npx tsc --noEmit`, `npm test`, `npm run lint`.

### Resolved design decisions (supersede spec §9 open questions)

- **Rank source:** `fetchLeaderboardSnapshot()` (cached/deduped) → `playerLiveRanks(snap, address)`.
- **`hasSeasonScore` collapses into `ranks[g] != null`.** A player counts as "in the season" for game `g` exactly when they hold a live rank there. There is no separate `hasSeasonScore` input. Consequence: `season-closing` and `rank-drop` only fire for a connected, on-board player; a disconnected player can only ever receive `streak-risk`.
- **Countdowns are precomputed by the component** (imperatively, only for ranked games) and passed into the pure engine as `countdowns: Partial<Record<GameId, Countdown>>`. The engine never fetches.

### Final `NudgeSignals` shape (defined in Task 2, consumed Tasks 3–6)

```ts
export type NudgeSignals = {
  address: string | null;
  streak: StreakView;                          // viewStreak(dailyState, today)
  dailyGame: GameId;                           // dailyGame(today)
  ranks: LiveRanks | null;                     // null when disconnected
  lastSeenRanks: LiveRanks | null;             // null on first-ever visit / new address
  countdowns: Partial<Record<GameId, Countdown>>; // populated for ranked games only
  shownToday: Partial<Record<NudgeKind, boolean>>;
};
```

---

### Task 1: Rank snapshot persistence — `lib/last-seen-ranks.ts`

**Files:**
- Create: `frontend/lib/last-seen-ranks.ts`
- Test: `frontend/lib/last-seen-ranks.test.ts`

**Interfaces:**
- Consumes: `LiveRanks` from `@/lib/player-ranks`.
- Produces:
  - `LAST_SEEN_RANKS_KEY: string`
  - `loadLastSeenRanks(address: string): LiveRanks | null`
  - `saveLastSeenRanks(address: string, ranks: LiveRanks): void`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/last-seen-ranks.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  LAST_SEEN_RANKS_KEY,
  loadLastSeenRanks,
  saveLastSeenRanks,
} from "./last-seen-ranks";
import type { LiveRanks } from "./player-ranks";

const RANKS: LiveRanks = {
  snake: 3, tetris: null, pacman: null,
  breakout: null, minesweeper: null, solitaire: null,
};

describe("last-seen-ranks", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when nothing stored", () => {
    expect(loadLastSeenRanks("SP123")).toBeNull();
  });

  it("round-trips ranks for the same address", () => {
    saveLastSeenRanks("SP123", RANKS);
    expect(loadLastSeenRanks("SP123")).toEqual(RANKS);
  });

  it("isolates by address (wallet switch → null)", () => {
    saveLastSeenRanks("SP123", RANKS);
    expect(loadLastSeenRanks("SP999")).toBeNull();
  });

  it("returns null on corrupt JSON", () => {
    localStorage.setItem(LAST_SEEN_RANKS_KEY, "{not json");
    expect(loadLastSeenRanks("SP123")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/last-seen-ranks.test.ts`
Expected: FAIL — cannot find module `./last-seen-ranks`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/lib/last-seen-ranks.ts
import type { LiveRanks } from "./player-ranks";

export const LAST_SEEN_RANKS_KEY = "xp-arcade:last-ranks";

type Stored = { address: string; ranks: LiveRanks };

export function loadLastSeenRanks(address: string): LiveRanks | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_SEEN_RANKS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (parsed.address !== address || parsed.ranks == null) return null;
    return parsed.ranks as LiveRanks;
  } catch {
    return null;
  }
}

export function saveLastSeenRanks(address: string, ranks: LiveRanks): void {
  if (typeof window === "undefined") return;
  try {
    const payload: Stored = { address, ranks };
    window.localStorage.setItem(LAST_SEEN_RANKS_KEY, JSON.stringify(payload));
  } catch {
    /* storage blocked → no-op */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/last-seen-ranks.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/last-seen-ranks.ts frontend/lib/last-seen-ranks.test.ts
git commit -m "feat(retention): per-address last-seen rank snapshot persistence"
```

---

### Task 2: Nudge types + per-kind daily dedup — `lib/retention-nudge.ts`

**Files:**
- Create: `frontend/lib/retention-nudge.ts`
- Test: `frontend/lib/retention-nudge.test.ts`

**Interfaces:**
- Consumes: `GameId` (`@/lib/game-registry`), `StreakView` (`@/lib/daily-challenge`), `LiveRanks` (`@/lib/player-ranks`), `Countdown` (`@/lib/season-countdown`).
- Produces:
  - `type NudgeKind = "rank-drop" | "season-closing" | "streak-risk"`
  - `type NudgeTarget = { window: "highscore"; gameId: GameId } | { window: "game"; gameId: GameId }`
  - `type Nudge = { kind: NudgeKind; icon: string; title: string; body: string; cta: { label: string; target: NudgeTarget } }`
  - `type NudgeSignals` (the shape in Global Constraints)
  - `NUDGE_SHOWN_KEY: string`
  - `loadNudgeShown(): Partial<Record<NudgeKind, string>>`
  - `markNudgeShown(kind: NudgeKind, day: string): void`
  - `shownTodayMap(stored, today): Partial<Record<NudgeKind, boolean>>`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/retention-nudge.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  NUDGE_SHOWN_KEY,
  loadNudgeShown,
  markNudgeShown,
  shownTodayMap,
} from "./retention-nudge";

describe("nudge dedup persistence", () => {
  beforeEach(() => localStorage.clear());

  it("loads empty when nothing stored", () => {
    expect(loadNudgeShown()).toEqual({});
  });

  it("records and reloads a kind's shown date", () => {
    markNudgeShown("streak-risk", "2026-06-23");
    expect(loadNudgeShown()["streak-risk"]).toBe("2026-06-23");
  });

  it("shownTodayMap marks only kinds shown on `today`", () => {
    const stored = { "streak-risk": "2026-06-23", "rank-drop": "2026-06-22" };
    expect(shownTodayMap(stored, "2026-06-23")).toEqual({ "streak-risk": true });
  });

  it("returns empty on corrupt JSON", () => {
    localStorage.setItem(NUDGE_SHOWN_KEY, "{nope");
    expect(loadNudgeShown()).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/retention-nudge.test.ts`
Expected: FAIL — cannot find module `./retention-nudge`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/lib/retention-nudge.ts
import type { GameId } from "./game-registry";
import type { StreakView } from "./daily-challenge";
import type { LiveRanks } from "./player-ranks";
import type { Countdown } from "./season-countdown";

export type NudgeKind = "rank-drop" | "season-closing" | "streak-risk";

export type NudgeTarget =
  | { window: "highscore"; gameId: GameId }
  | { window: "game"; gameId: GameId };

export type Nudge = {
  kind: NudgeKind;
  icon: string;
  title: string;
  body: string;
  cta: { label: string; target: NudgeTarget };
};

export type NudgeSignals = {
  address: string | null;
  streak: StreakView;
  dailyGame: GameId;
  ranks: LiveRanks | null;
  lastSeenRanks: LiveRanks | null;
  countdowns: Partial<Record<GameId, Countdown>>;
  shownToday: Partial<Record<NudgeKind, boolean>>;
};

export const NUDGE_SHOWN_KEY = "xp-arcade:nudge";

export function loadNudgeShown(): Partial<Record<NudgeKind, string>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(NUDGE_SHOWN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<NudgeKind, string>>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function markNudgeShown(kind: NudgeKind, day: string): void {
  if (typeof window === "undefined") return;
  try {
    const next = { ...loadNudgeShown(), [kind]: day };
    window.localStorage.setItem(NUDGE_SHOWN_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked → no-op */
  }
}

export function shownTodayMap(
  stored: Partial<Record<NudgeKind, string>>,
  today: string,
): Partial<Record<NudgeKind, boolean>> {
  const out: Partial<Record<NudgeKind, boolean>> = {};
  for (const [kind, day] of Object.entries(stored)) {
    if (day === today) out[kind as NudgeKind] = true;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/retention-nudge.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/retention-nudge.ts frontend/lib/retention-nudge.test.ts
git commit -m "feat(retention): nudge types + per-kind daily dedup persistence"
```

---

### Task 3: `streakRiskCandidate` evaluator

**Files:**
- Modify: `frontend/lib/retention-nudge.ts`
- Test: `frontend/lib/retention-nudge.test.ts`

**Interfaces:**
- Consumes: `NudgeSignals`, `GAMES` (`@/lib/game-registry`).
- Produces: `streakRiskCandidate(signals: NudgeSignals): Nudge | null`

- [ ] **Step 1: Write the failing test (append to existing test file)**

```ts
import { streakRiskCandidate } from "./retention-nudge";
import type { NudgeSignals } from "./retention-nudge";

function baseSignals(over: Partial<NudgeSignals> = {}): NudgeSignals {
  return {
    address: null,
    streak: { currentStreak: 0, bestStreak: 0, completedToday: false },
    dailyGame: "snake",
    ranks: null,
    lastSeenRanks: null,
    countdowns: {},
    shownToday: {},
    ...over,
  };
}

describe("streakRiskCandidate", () => {
  it("fires when streak alive and not completed today", () => {
    const n = streakRiskCandidate(baseSignals({
      streak: { currentStreak: 4, bestStreak: 9, completedToday: false },
      dailyGame: "tetris",
    }));
    expect(n?.kind).toBe("streak-risk");
    expect(n?.cta.target).toEqual({ window: "game", gameId: "tetris" });
    expect(n?.body).toContain("4");
  });

  it("does not fire when already completed today", () => {
    expect(streakRiskCandidate(baseSignals({
      streak: { currentStreak: 4, bestStreak: 9, completedToday: true },
    }))).toBeNull();
  });

  it("does not fire when streak is zero", () => {
    expect(streakRiskCandidate(baseSignals({
      streak: { currentStreak: 0, bestStreak: 9, completedToday: false },
    }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/retention-nudge.test.ts`
Expected: FAIL — `streakRiskCandidate` is not exported.

- [ ] **Step 3: Write minimal implementation (append to `retention-nudge.ts`)**

```ts
import { GAMES } from "./game-registry";

export function streakRiskCandidate(signals: NudgeSignals): Nudge | null {
  const { streak, dailyGame } = signals;
  if (streak.currentStreak <= 0 || streak.completedToday) return null;
  const game = GAMES[dailyGame].label;
  return {
    kind: "streak-risk",
    icon: "🔥",
    title: "Keep your streak",
    body: `${streak.currentStreak}-day streak — play today's ${game} challenge to keep it.`,
    cta: { label: "Play now", target: { window: "game", gameId: dailyGame } },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/retention-nudge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/retention-nudge.ts frontend/lib/retention-nudge.test.ts
git commit -m "feat(retention): streak-risk nudge candidate"
```

---

### Task 4: `seasonClosingCandidate` evaluator

**Files:**
- Modify: `frontend/lib/retention-nudge.ts`
- Test: `frontend/lib/retention-nudge.test.ts`

**Interfaces:**
- Consumes: `NudgeSignals`, `isCountdownUrgent`/`formatCountdown` (`@/lib/season-countdown`), `GAMES`, `GAME_IDS` (`@/lib/game-registry`).
- Produces: `seasonClosingCandidate(signals: NudgeSignals): Nudge | null`

- [ ] **Step 1: Write the failing test (append)**

```ts
import { seasonClosingCandidate } from "./retention-nudge";
import type { Countdown } from "./season-countdown";

const urgent = (endsAt: Date): Countdown => ({
  state: "live", endsAt, days: 0, hours: 5, minutes: 0, seconds: 0,
});
const notUrgent = (endsAt: Date): Countdown => ({
  state: "live", endsAt, days: 3, hours: 0, minutes: 0, seconds: 0,
});

describe("seasonClosingCandidate", () => {
  it("fires for an urgent countdown on a ranked game", () => {
    const n = seasonClosingCandidate(baseSignals({
      address: "SP1",
      ranks: { snake: 2, tetris: null, pacman: null, breakout: null, minesweeper: null, solitaire: null },
      countdowns: { snake: urgent(new Date(Date.now() + 5 * 3600_000)) },
    }));
    expect(n?.kind).toBe("season-closing");
    expect(n?.cta.target).toEqual({ window: "highscore", gameId: "snake" });
  });

  it("does not fire when the countdown is not urgent", () => {
    expect(seasonClosingCandidate(baseSignals({
      address: "SP1",
      ranks: { snake: 2, tetris: null, pacman: null, breakout: null, minesweeper: null, solitaire: null },
      countdowns: { snake: notUrgent(new Date(Date.now() + 3 * 86400_000)) },
    }))).toBeNull();
  });

  it("picks the soonest-ending urgent game when several qualify", () => {
    const soon = new Date(Date.now() + 1 * 3600_000);
    const later = new Date(Date.now() + 6 * 3600_000);
    const n = seasonClosingCandidate(baseSignals({
      address: "SP1",
      ranks: { snake: 2, tetris: 5, pacman: null, breakout: null, minesweeper: null, solitaire: null },
      countdowns: { snake: urgent(later), tetris: urgent(soon) },
    }));
    expect(n?.cta.target).toEqual({ window: "highscore", gameId: "tetris" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/retention-nudge.test.ts`
Expected: FAIL — `seasonClosingCandidate` is not exported.

- [ ] **Step 3: Write minimal implementation (append; extend imports)**

```ts
import { GAMES, GAME_IDS } from "./game-registry"; // GAME_IDS added to existing import
import { isCountdownUrgent, formatCountdown } from "./season-countdown";

export function seasonClosingCandidate(signals: NudgeSignals): Nudge | null {
  const { ranks, countdowns } = signals;
  if (!ranks) return null;
  let best: { gameId: GameId; c: Countdown; endsMs: number } | null = null;
  for (const id of GAME_IDS) {
    if (ranks[id] == null) continue;          // only games the player is on
    const c = countdowns[id];
    if (!c || !isCountdownUrgent(c)) continue;
    const endsMs = "endsAt" in c ? c.endsAt.getTime() : Number.POSITIVE_INFINITY;
    if (!best || endsMs < best.endsMs) best = { gameId: id, c, endsMs };
  }
  if (!best) return null;
  const game = GAMES[best.gameId].label;
  const when = formatCountdown(best.c);
  return {
    kind: "season-closing",
    icon: "⏳",
    title: "Season ending soon",
    body: `${game} season closes ${when || "soon"}. Lock in your rank.`,
    cta: { label: "View standings", target: { window: "highscore", gameId: best.gameId } },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/retention-nudge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/retention-nudge.ts frontend/lib/retention-nudge.test.ts
git commit -m "feat(retention): season-closing nudge candidate"
```

---

### Task 5: `rankDropCandidate` evaluator

**Files:**
- Modify: `frontend/lib/retention-nudge.ts`
- Test: `frontend/lib/retention-nudge.test.ts`

**Interfaces:**
- Consumes: `NudgeSignals`, `GAMES`, `GAME_IDS`.
- Produces: `rankDropCandidate(signals: NudgeSignals): Nudge | null`

- [ ] **Step 1: Write the failing test (append)**

```ts
import { rankDropCandidate } from "./retention-nudge";
import type { LiveRanks } from "./player-ranks";

const r = (over: Partial<LiveRanks>): LiveRanks => ({
  snake: null, tetris: null, pacman: null,
  breakout: null, minesweeper: null, solitaire: null, ...over,
});

describe("rankDropCandidate", () => {
  it("fires when a held top-10 rank fell off the board", () => {
    const n = rankDropCandidate(baseSignals({
      address: "SP1",
      lastSeenRanks: r({ snake: 3 }),
      ranks: r({ snake: null }),
    }));
    expect(n?.kind).toBe("rank-drop");
    expect(n?.cta.target).toEqual({ window: "highscore", gameId: "snake" });
  });

  it("fires when a held rank dropped places (3 → 5)", () => {
    const n = rankDropCandidate(baseSignals({
      address: "SP1",
      lastSeenRanks: r({ snake: 3 }),
      ranks: r({ snake: 5 }),
    }));
    expect(n?.kind).toBe("rank-drop");
  });

  it("does not fire when rank improved (3 → 2)", () => {
    expect(rankDropCandidate(baseSignals({
      address: "SP1",
      lastSeenRanks: r({ snake: 3 }),
      ranks: r({ snake: 2 }),
    }))).toBeNull();
  });

  it("does not fire without an address", () => {
    expect(rankDropCandidate(baseSignals({
      address: null,
      lastSeenRanks: r({ snake: 3 }),
      ranks: r({ snake: 9 }),
    }))).toBeNull();
  });

  it("does not fire without a prior snapshot", () => {
    expect(rankDropCandidate(baseSignals({
      address: "SP1",
      lastSeenRanks: null,
      ranks: r({ snake: 9 }),
    }))).toBeNull();
  });

  it("picks the most painful loss (best previously-held rank)", () => {
    const n = rankDropCandidate(baseSignals({
      address: "SP1",
      lastSeenRanks: r({ snake: 6, tetris: 2 }),
      ranks: r({ snake: null, tetris: null }),
    }));
    expect(n?.cta.target).toEqual({ window: "highscore", gameId: "tetris" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/retention-nudge.test.ts`
Expected: FAIL — `rankDropCandidate` is not exported.

- [ ] **Step 3: Write minimal implementation (append)**

```ts
export function rankDropCandidate(signals: NudgeSignals): Nudge | null {
  const { address, ranks, lastSeenRanks } = signals;
  if (!address || !ranks || !lastSeenRanks) return null;
  let best: { gameId: GameId; held: number } | null = null;
  for (const id of GAME_IDS) {
    const held = lastSeenRanks[id];
    if (held == null || held < 1 || held > 10) continue; // must have held top-10
    const now = ranks[id];
    const dropped = now == null || now > held;            // off board or fell places
    if (!dropped) continue;
    if (!best || held < best.held) best = { gameId: id, held }; // best-held = most painful
  }
  if (!best) return null;
  const game = GAMES[best.gameId].label;
  return {
    kind: "rank-drop",
    icon: "⚠️",
    title: "You've been bumped",
    body: `Someone passed your ${game} score — reclaim your spot.`,
    cta: { label: "Reclaim rank", target: { window: "highscore", gameId: best.gameId } },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/retention-nudge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/retention-nudge.ts frontend/lib/retention-nudge.test.ts
git commit -m "feat(retention): rank-drop nudge candidate"
```

---

### Task 6: `selectNudge` — priority + dedup

**Files:**
- Modify: `frontend/lib/retention-nudge.ts`
- Test: `frontend/lib/retention-nudge.test.ts`

**Interfaces:**
- Consumes: the three candidate functions + `NudgeSignals.shownToday`.
- Produces: `selectNudge(signals: NudgeSignals): Nudge | null`

- [ ] **Step 1: Write the failing test (append)**

```ts
import { selectNudge } from "./retention-nudge";

describe("selectNudge", () => {
  const connected = baseSignals({
    address: "SP1",
    streak: { currentStreak: 4, bestStreak: 9, completedToday: false },
    lastSeenRanks: r({ snake: 3 }),
    ranks: r({ snake: null }),
    countdowns: { snake: urgent(new Date(Date.now() + 3600_000)) },
  });

  it("prefers rank-drop over season-closing and streak-risk", () => {
    expect(selectNudge(connected)?.kind).toBe("rank-drop");
  });

  it("falls to season-closing when rank-drop was shown today", () => {
    expect(selectNudge({ ...connected, shownToday: { "rank-drop": true } })?.kind)
      .toBe("season-closing");
  });

  it("falls to streak-risk when higher kinds were shown today", () => {
    expect(selectNudge({
      ...connected,
      shownToday: { "rank-drop": true, "season-closing": true },
    })?.kind).toBe("streak-risk");
  });

  it("returns null when nothing qualifies", () => {
    expect(selectNudge(baseSignals())).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/retention-nudge.test.ts`
Expected: FAIL — `selectNudge` is not exported.

- [ ] **Step 3: Write minimal implementation (append)**

```ts
export function selectNudge(signals: NudgeSignals): Nudge | null {
  const candidates: Array<(s: NudgeSignals) => Nudge | null> = [
    rankDropCandidate,      // priority 1
    seasonClosingCandidate, // priority 2
    streakRiskCandidate,    // priority 3
  ];
  for (const candidate of candidates) {
    const nudge = candidate(signals);
    if (nudge && !signals.shownToday[nudge.kind]) return nudge;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/retention-nudge.test.ts`
Expected: PASS (full file).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/retention-nudge.ts frontend/lib/retention-nudge.test.ts
git commit -m "feat(retention): selectNudge priority + daily dedup"
```

---

### Task 7: Extract `TrayBalloon` shell; refactor `WalletBalloon`

**Files:**
- Create: `frontend/components/desktop/TrayBalloon.tsx`
- Create: `frontend/components/desktop/TrayBalloon.test.tsx`
- Modify: `frontend/components/desktop/WalletBalloon.tsx`

**Interfaces:**
- Produces: `TrayBalloon` React component with props
  `{ icon: string; title: string; body: string; ctaLabel: string; onCta: () => void; onDismiss: () => void; ariaLabel: string }`.
- `WalletBalloon` keeps its current behavior (3s show / 8s auto-hide / sessionStorage `"balloon-dismissed"`), now rendering `<TrayBalloon … />`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/components/desktop/TrayBalloon.test.tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TrayBalloon } from "./TrayBalloon";

describe("TrayBalloon", () => {
  const props = {
    icon: "🔥", title: "Keep your streak", body: "Play today's challenge.",
    ctaLabel: "Play now", ariaLabel: "Dismiss streak reminder",
  };

  it("renders title, body, icon and CTA", () => {
    render(<TrayBalloon {...props} onCta={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText("Keep your streak")).toBeInTheDocument();
    expect(screen.getByText("Play today's challenge.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play now" })).toBeInTheDocument();
  });

  it("fires onCta and onDismiss", () => {
    const onCta = vi.fn();
    const onDismiss = vi.fn();
    render(<TrayBalloon {...props} onCta={onCta} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Play now" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss streak reminder" }));
    expect(onCta).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/desktop/TrayBalloon.test.tsx`
Expected: FAIL — cannot find module `./TrayBalloon`.

- [ ] **Step 3: Write `TrayBalloon.tsx` (move the markup verbatim from `WalletBalloon`)**

```tsx
// frontend/components/desktop/TrayBalloon.tsx
"use client";

export function TrayBalloon({
  icon, title, body, ctaLabel, onCta, onDismiss, ariaLabel,
}: {
  icon: string;
  title: string;
  body: string;
  ctaLabel: string;
  onCta: () => void;
  onDismiss: () => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="tray-balloon"
      style={{
        position: "fixed", bottom: 36, right: 8, width: 220,
        background: "#ffffe1", border: "1px solid #000000", padding: "8px 10px",
        fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif', fontSize: 11,
        zIndex: 60, boxShadow: "2px 2px 6px rgba(0,0,0,0.3)",
      }}
    >
      <button
        type="button" aria-label={ariaLabel} onClick={onDismiss}
        style={{
          position: "absolute", top: 4, right: 6, background: "none",
          border: "none", cursor: "pointer", fontSize: 10, color: "#666", padding: 0,
        }}
      >
        ✕
      </button>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div>
          <div style={{ fontWeight: "bold", marginBottom: 2 }}>{title}</div>
          <div style={{ color: "#444", marginBottom: 6, lineHeight: 1.4 }}>{body}</div>
          <button type="button" onClick={onCta} style={{ fontSize: 10, padding: "2px 10px" }}>
            {ctaLabel}
          </button>
        </div>
      </div>
      <div style={{
        position: "absolute", bottom: -8, right: 18, width: 0, height: 0,
        borderLeft: "7px solid transparent", borderRight: "7px solid transparent",
        borderTop: "8px solid #000000",
      }} />
      <div style={{
        position: "absolute", bottom: -7, right: 19, width: 0, height: 0,
        borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
        borderTop: "7px solid #ffffe1",
      }} />
    </div>
  );
}
```

- [ ] **Step 4: Run the TrayBalloon test to verify it passes**

Run: `npx vitest run components/desktop/TrayBalloon.test.tsx`
Expected: PASS.

- [ ] **Step 5: Refactor `WalletBalloon.tsx` to use `TrayBalloon`**

Replace the entire returned JSX (the inline `<div className="wallet-balloon">…</div>` block, lines ~34–97) with:

```tsx
  return (
    <TrayBalloon
      icon="🦊"
      title="Connect your wallet"
      body="Save scores on-chain & mint NFTs"
      ctaLabel="Connect Now"
      onCta={connect}
      onDismiss={dismiss}
      ariaLabel="Dismiss wallet reminder"
    />
  );
```

Add the import at the top: `import { TrayBalloon } from "./TrayBalloon";`. Keep all existing state/effects (`visible`, the 3s/8s timers, `dismiss`, the `if (!visible || address) return null;` guard) unchanged.

- [ ] **Step 6: Run the existing WalletBalloon tests + TrayBalloon test**

Run: `npx vitest run components/desktop/WalletBalloon components/desktop/TrayBalloon.test.tsx`
Expected: PASS (existing WalletBalloon tests still green).

- [ ] **Step 7: Commit**

```bash
git add frontend/components/desktop/TrayBalloon.tsx frontend/components/desktop/TrayBalloon.test.tsx frontend/components/desktop/WalletBalloon.tsx
git commit -m "refactor(desktop): extract reusable TrayBalloon shell from WalletBalloon"
```

---

### Task 8: Signal collector — `lib/collect-nudge-signals.ts`

Isolates the async/network gathering behind injected fetchers so it is unit-testable without a DOM or real network.

**Files:**
- Create: `frontend/lib/collect-nudge-signals.ts`
- Test: `frontend/lib/collect-nudge-signals.test.ts`

**Interfaces:**
- Consumes: `NudgeSignals`, `NudgeKind` (`@/lib/retention-nudge`); `LeaderboardSnapshot` (`@/lib/leaderboard-snapshot`); `LiveRanks`/`playerLiveRanks` (`@/lib/player-ranks`); `DailyChallengeState`/`viewStreak`/`dailyGame`/`todayKey` (`@/lib/daily-challenge`); `deriveCountdown`/`Countdown` (`@/lib/season-countdown`); `blocksToEta` (`@/lib/season-blocks`); `GAME_IDS`/`GameId` (`@/lib/game-registry`).
- Produces:
  ```ts
  type CollectDeps = {
    address: string | null;
    dailyState: DailyChallengeState;
    shownToday: Partial<Record<NudgeKind, boolean>>;
    lastSeenRanks: LiveRanks | null;
    fetchSnapshot: () => Promise<LeaderboardSnapshot>;
    fetchTip: () => Promise<number>;
    now?: number;
  };
  collectNudgeSignals(deps: CollectDeps): Promise<NudgeSignals>
  ```
- Behavior: when `address` is null, skip all network and return signals with `ranks: null`, `countdowns: {}`. When connected: fetch the snapshot once → `ranks` via `playerLiveRanks`. The snapshot already carries `games[g].seasonEndBlock` (`GameLeaderboard`), so no per-game end-block fetch is needed — for each ranked game with a positive `seasonEndBlock`, fetch the chain tip **once** and `deriveCountdown` → `countdowns[g]`. `streak` = `viewStreak(dailyState, today)`, `dailyGame` = `dailyGame(today)`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/collect-nudge-signals.test.ts
import { describe, expect, it, vi } from "vitest";
import { collectNudgeSignals } from "./collect-nudge-signals";
import type { LeaderboardSnapshot } from "./leaderboard-snapshot";

const dailyState = { lastCompletedDate: null, currentStreak: 2, bestStreak: 5 };

const emptyGame = { topTen: [], currentSeason: null, prizePool: null, seasonEndBlock: null };

function snapshotWith(snakeAddr: string, snakeEndBlock: number): LeaderboardSnapshot {
  return {
    games: {
      snake: {
        topTen: [{ player: snakeAddr, score: 100 }],
        currentSeason: 1, prizePool: 0, seasonEndBlock: snakeEndBlock,
      },
      tetris: { ...emptyGame }, pacman: { ...emptyGame },
      breakout: { ...emptyGame }, minesweeper: { ...emptyGame }, solitaire: { ...emptyGame },
    },
  } as unknown as LeaderboardSnapshot;
}

describe("collectNudgeSignals", () => {
  it("skips network when disconnected", async () => {
    const fetchSnapshot = vi.fn();
    const fetchTip = vi.fn();
    const s = await collectNudgeSignals({
      address: null, dailyState, shownToday: {}, lastSeenRanks: null,
      fetchSnapshot, fetchTip,
    });
    expect(fetchSnapshot).not.toHaveBeenCalled();
    expect(fetchTip).not.toHaveBeenCalled();
    expect(s.ranks).toBeNull();
    expect(s.countdowns).toEqual({});
    expect(s.dailyGame).toBeDefined();
  });

  it("fetches ranks + a countdown only for ranked games with an end block", async () => {
    const fetchTip = vi.fn(async () => 990);
    const s = await collectNudgeSignals({
      address: "SP1", dailyState, shownToday: {}, lastSeenRanks: null,
      fetchSnapshot: async () => snapshotWith("SP1", 1000),
      fetchTip, now: Date.now(),
    });
    expect(s.ranks?.snake).toBe(1);
    expect(s.countdowns.snake).toBeDefined();
    expect(s.countdowns.tetris).toBeUndefined();
    expect(fetchTip).toHaveBeenCalledTimes(1); // one tip read, reused for all ranked games
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/collect-nudge-signals.test.ts`
Expected: FAIL — cannot find module `./collect-nudge-signals`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/lib/collect-nudge-signals.ts
import { GAME_IDS, type GameId } from "./game-registry";
import {
  type DailyChallengeState, dailyGame, todayKey, viewStreak,
} from "./daily-challenge";
import { playerLiveRanks, type LiveRanks } from "./player-ranks";
import type { LeaderboardSnapshot } from "./leaderboard-snapshot";
import { deriveCountdown, type Countdown } from "./season-countdown";
import { blocksToEta } from "./season-blocks";
import type { NudgeKind, NudgeSignals } from "./retention-nudge";

export type CollectDeps = {
  address: string | null;
  dailyState: DailyChallengeState;
  shownToday: Partial<Record<NudgeKind, boolean>>;
  lastSeenRanks: LiveRanks | null;
  fetchSnapshot: () => Promise<LeaderboardSnapshot>;
  fetchTip: () => Promise<number>;
  now?: number;
};

export async function collectNudgeSignals(deps: CollectDeps): Promise<NudgeSignals> {
  const now = deps.now ?? Date.now();
  const today = todayKey(new Date(now));
  const base: NudgeSignals = {
    address: deps.address,
    streak: viewStreak(deps.dailyState, today),
    dailyGame: dailyGame(today),
    ranks: null,
    lastSeenRanks: deps.lastSeenRanks,
    countdowns: {},
    shownToday: deps.shownToday,
  };
  if (!deps.address) return base;

  const snap = await deps.fetchSnapshot();
  const ranks = playerLiveRanks(snap, deps.address);
  // seasonEndBlock ships inside the snapshot — only ranked games with a positive
  // end block need a countdown, and the chain tip is fetched once for all of them.
  const ranked = GAME_IDS.filter(
    (g) => ranks[g] != null && (snap.games[g]?.seasonEndBlock ?? 0) > 0,
  );

  const countdowns: Partial<Record<GameId, Countdown>> = {};
  if (ranked.length > 0) {
    const tip = await deps.fetchTip();
    for (const g of ranked) {
      const endBlock = snap.games[g]!.seasonEndBlock as number;
      countdowns[g] = deriveCountdown(
        { kind: "block", reached: tip >= endBlock, endsAt: blocksToEta(endBlock, tip), endBlock },
        now,
      );
    }
  }
  return { ...base, ranks, countdowns };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/collect-nudge-signals.test.ts`
Expected: PASS.

> If the `LeaderboardSnapshot` / `GameLeaderboard` shape differs from `{ topTen: [{ player, score }] }` (check `lib/leaderboard-reads.ts` for the real `findPlayerRank` field names), adjust the test fixture to match the real type — the implementation only calls `playerLiveRanks`, which already knows the shape.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/collect-nudge-signals.ts frontend/lib/collect-nudge-signals.test.ts
git commit -m "feat(retention): async nudge-signal collector with injected fetchers"
```

---

### Task 9: `RetentionBalloon` component

**Files:**
- Create: `frontend/components/desktop/RetentionBalloon.tsx`
- Create: `frontend/components/desktop/RetentionBalloon.test.tsx`

**Interfaces:**
- Consumes: `collectNudgeSignals` (`@/lib/collect-nudge-signals`), `selectNudge`/`loadNudgeShown`/`markNudgeShown`/`shownTodayMap` (`@/lib/retention-nudge`), `loadLastSeenRanks`/`saveLastSeenRanks` (`@/lib/last-seen-ranks`), `fetchLeaderboardSnapshot` (`@/lib/leaderboard-snapshot`), `getCurrentStacksBlockHeight` (`@/lib/stacks-api`), `todayKey`/`loadDailyState` (`@/lib/daily-challenge`), `useWallet`, `useWindows`, `TrayBalloon`.
- Produces: `RetentionBalloon` (default desktop component, no props).
- Coordination: renders only when `address` is present OR sessionStorage `"balloon-dismissed" === "1"` (never stacks with `WalletBalloon`).

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/components/desktop/RetentionBalloon.test.tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const open = vi.fn();
vi.mock("@/state/window-manager", () => ({
  useWindows: (sel: (s: { open: typeof open }) => unknown) => sel({ open }),
}));
vi.mock("@/state/wallet", () => ({
  useWallet: (sel: (s: { address: string | null }) => unknown) => sel({ address: "SP1" }),
}));
vi.mock("@/lib/collect-nudge-signals", () => ({
  collectNudgeSignals: vi.fn(async () => ({
    address: "SP1",
    streak: { currentStreak: 4, bestStreak: 9, completedToday: false },
    dailyGame: "snake",
    ranks: { snake: null, tetris: null, pacman: null, breakout: null, minesweeper: null, solitaire: null },
    lastSeenRanks: { snake: 3, tetris: null, pacman: null, breakout: null, minesweeper: null, solitaire: null },
    countdowns: {},
    shownToday: {},
  })),
}));

import { RetentionBalloon } from "./RetentionBalloon";

afterEach(() => { vi.clearAllMocks(); localStorage.clear(); });

describe("RetentionBalloon", () => {
  it("shows the selected nudge and its CTA opens the target window", async () => {
    render(<RetentionBalloon />);
    const cta = await screen.findByRole("button", { name: "Reclaim rank" });
    fireEvent.click(cta);
    expect(open).toHaveBeenCalledWith("highscore", { initialTab: "snake" });
  });

  it("marks the kind shown today after rendering", async () => {
    render(<RetentionBalloon />);
    await screen.findByRole("button", { name: "Reclaim rank" });
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("xp-arcade:nudge") ?? "{}");
      expect(stored["rank-drop"]).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/desktop/RetentionBalloon.test.tsx`
Expected: FAIL — cannot find module `./RetentionBalloon`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/components/desktop/RetentionBalloon.tsx
"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@/state/wallet";
import { useWindows } from "@/state/window-manager";
import { TrayBalloon } from "./TrayBalloon";
import { collectNudgeSignals } from "@/lib/collect-nudge-signals";
import {
  type Nudge, type NudgeTarget,
  selectNudge, loadNudgeShown, markNudgeShown, shownTodayMap,
} from "@/lib/retention-nudge";
import { loadLastSeenRanks, saveLastSeenRanks } from "@/lib/last-seen-ranks";
import { fetchLeaderboardSnapshot } from "@/lib/leaderboard-snapshot";
import { getCurrentStacksBlockHeight } from "@/lib/stacks-api";
import { loadDailyState, todayKey } from "@/lib/daily-challenge";

const SHOW_DELAY_MS = 3500;
const AUTO_HIDE_MS = 9000;

function walletBalloonGone(): boolean {
  return typeof sessionStorage !== "undefined"
    && sessionStorage.getItem("balloon-dismissed") === "1";
}

export function RetentionBalloon() {
  const address = useWallet((s) => s.address);
  const open = useWindows((s) => s.open);
  const [nudge, setNudge] = useState<Nudge | null>(null);

  useEffect(() => {
    // Never stack on top of the wallet balloon.
    if (!address && !walletBalloonGone()) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const signals = await collectNudgeSignals({
          address: address ?? null,
          dailyState: loadDailyState(),
          shownToday: shownTodayMap(loadNudgeShown(), todayKey()),
          lastSeenRanks: address ? loadLastSeenRanks(address) : null,
          fetchSnapshot: fetchLeaderboardSnapshot,
          fetchTip: getCurrentStacksBlockHeight,
        });
        if (cancelled) return;
        const picked = selectNudge(signals);
        // Refresh the rank snapshot AFTER selecting (so we don't lose the signal).
        if (address && signals.ranks) saveLastSeenRanks(address, signals.ranks);
        if (picked) {
          markNudgeShown(picked.kind, todayKey());
          setNudge(picked);
        }
      } catch {
        /* read failed → no nudge this load */
      }
    }, SHOW_DELAY_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [address]);

  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(() => setNudge(null), AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [nudge]);

  if (!nudge) return null;

  function go(target: NudgeTarget) {
    if (target.window === "highscore") open("highscore", { initialTab: target.gameId });
    else open(`game-${target.gameId}`);
    setNudge(null);
  }

  return (
    <TrayBalloon
      icon={nudge.icon}
      title={nudge.title}
      body={nudge.body}
      ctaLabel={nudge.cta.label}
      onCta={() => go(nudge.cta.target)}
      onDismiss={() => setNudge(null)}
      ariaLabel={`Dismiss ${nudge.kind} reminder`}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/desktop/RetentionBalloon.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/desktop/RetentionBalloon.tsx frontend/components/desktop/RetentionBalloon.test.tsx
git commit -m "feat(retention): RetentionBalloon — gather signals, pick + render nudge"
```

---

### Task 10: Mount `RetentionBalloon` in `SystemTray` + full gate

**Files:**
- Modify: `frontend/components/desktop/SystemTray.tsx`

**Interfaces:**
- Consumes: `RetentionBalloon`.

- [ ] **Step 1: Mount the component**

In `SystemTray.tsx`, add the import near the existing `WalletBalloon` import:

```tsx
import { RetentionBalloon } from "./RetentionBalloon";
```

Then, immediately after the existing `<WalletBalloon />` (the last child before the tray's closing `</div>`), add:

```tsx
      <WalletBalloon />
      <RetentionBalloon />
```

- [ ] **Step 2: Type-check**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Full test suite**

Run (from `frontend/`): `npm test`
Expected: PASS (all suites, including the new ones and the unchanged WalletBalloon tests).

- [ ] **Step 4: Lint**

Run (from `frontend/`): `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/desktop/SystemTray.tsx
git commit -m "feat(retention): mount RetentionBalloon in system tray"
```

---

## Self-Review

**Spec coverage:**
- Nudge engine + 3 priorities + dedup → Tasks 2–6. ✓
- Rank snapshot persistence (per-address, post-select refresh) → Task 1 + wired in Task 9. ✓
- `TrayBalloon` extraction + `RetentionBalloon` + WalletBalloon coordination → Tasks 7, 9. ✓
- Mount in SystemTray → Task 10. ✓
- Testing (engine exhaustive, snapshot isolation, component CTA/dedup, TrayBalloon, WalletBalloon still green) → Tasks 1–9. ✓
- Spec §9 open questions (rank source, `hasSeasonScore`→`ranks!=null`, countdown collection) → resolved in "Resolved design decisions" and Task 8. ✓
- YAGNI exclusions (no push/backend/multi-balloon) → honored. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step is complete. The one conditional note (Task 8 fixture shape) points the engineer to the authoritative type and does not block implementation. ✓

**Type consistency:** `NudgeSignals`, `Nudge`, `NudgeTarget`, `NudgeKind` defined in Task 2 and used unchanged in Tasks 3–9. CTA target `{ window: "highscore" | "game"; gameId }` maps to `open("highscore", { initialTab })` / `open(\`game-${gameId}\`)` consistently (engine Tasks 4/5 emit `"highscore"`, component Task 9 consumes it). `collectNudgeSignals` deps/return match Task 9's call site. ✓
