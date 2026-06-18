# Player Profile Live Rank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each player's live current-season rank per game on the Player Profile, using the already-cached leaderboard snapshot.

**Architecture:** Two pure, unit-tested helpers — `findPlayerRank` (reusing the existing `rankRows`) and an aggregator module `lib/player-ranks.ts` — feed a small, non-blocking UI addition to `PlayerProfileBody` (a per-game rank row + a header chip). Rank data is fetched in parallel with the existing NFT load via `fetchLeaderboardSnapshot()`; any failure silently omits rank UI. No contract change.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Vitest 3, `98.css` / inline Win95 styles.

## Global Constraints

- **No contract change.** Reads only, via the existing `/api/leaderboard` cache.
- **Path must not contain spaces** — keep working dir `Desktop/xp-snake/`.
- Rank UI must **never block or break** the profile; on error it is omitted.
- Rank semantics = **current-season** top-10 standing (what `get-top-ten` returns), distinct from historical best score derived from NFTs.
- Rank ordering must match the rest of the app: reuse `rankRows` (sort by score desc, tie-break by `player.localeCompare`).
- Git: conventional prefixes, small green commits, stage explicit files, **no `Co-Authored-By`**.
- Run the actual test/type-check and read output before claiming done.

---

### Task 1: `findPlayerRank` helper

**Files:**
- Modify: `frontend/lib/leaderboard-showcase.ts` (add export near `rankRows`, ~line 80)
- Test: `frontend/lib/leaderboard-showcase.test.ts` (add cases to existing file)

**Interfaces:**
- Consumes: existing `rankRows(rows: TopEntry[]): RankedEntry[]` and `type TopEntry = { player: string; score: number }`.
- Produces: `findPlayerRank(topTen: TopEntry[], address: string): number | null` — the player's positional rank (1-based) in the sorted board, or `null` if absent.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/lib/leaderboard-showcase.test.ts`, inside the existing `describe("leaderboard showcase helpers", ...)` block. Import `findPlayerRank` by adding it to the existing import list at the top of the file.

```ts
  it("findPlayerRank returns the player's positional rank", () => {
    const rows = [
      { player: "SP_B", score: 10 },
      { player: "SP_A", score: 40 },
      { player: "SP_C", score: 25 },
    ];
    expect(findPlayerRank(rows, "SP_A")).toBe(1);
    expect(findPlayerRank(rows, "SP_C")).toBe(2);
    expect(findPlayerRank(rows, "SP_B")).toBe(3);
  });

  it("findPlayerRank returns null when the player is not on the board", () => {
    const rows = [{ player: "SP_A", score: 40 }];
    expect(findPlayerRank(rows, "SP_X")).toBeNull();
    expect(findPlayerRank([], "SP_A")).toBeNull();
  });

  it("findPlayerRank breaks ties the same way rankRows does", () => {
    // Equal scores: rankRows tie-breaks by player.localeCompare, so SP_A < SP_B.
    const rows = [
      { player: "SP_B", score: 50 },
      { player: "SP_A", score: 50 },
    ];
    expect(findPlayerRank(rows, "SP_A")).toBe(1);
    expect(findPlayerRank(rows, "SP_B")).toBe(2);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run lib/leaderboard-showcase.test.ts`
Expected: FAIL — `findPlayerRank is not exported` / not defined.

- [ ] **Step 3: Implement `findPlayerRank`**

In `frontend/lib/leaderboard-showcase.ts`, add directly below the existing `rankRows` function (after line 80):

```ts
/** The player's positional rank (1-based) on a top-ten board, or null if the
 *  player is not on it. Uses the same ordering as rankRows so the rank matches
 *  every other leaderboard view. */
export function findPlayerRank(
  rows: TopEntry[],
  address: string,
): number | null {
  const entry = rankRows(rows).find((row) => row.player === address);
  return entry ? entry.rank : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run lib/leaderboard-showcase.test.ts`
Expected: PASS (all cases, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/leaderboard-showcase.ts frontend/lib/leaderboard-showcase.test.ts
git commit -m "feat(profile): add findPlayerRank helper"
```

---

### Task 2: `player-ranks` aggregator module

**Files:**
- Create: `frontend/lib/player-ranks.ts`
- Test: `frontend/lib/player-ranks.test.ts`

**Interfaces:**
- Consumes: `findPlayerRank` (Task 1); `GAME_IDS`, `GameId` from `lib/game-registry`; `LeaderboardSnapshot` from `lib/leaderboard-snapshot` (shape: `{ updatedAt: string; games: Record<GameId, { topTen: TopEntry[]; currentSeason: number | null; prizePool: number | null; seasonEndBlock: number | null }> }`).
- Produces:
  - `type LiveRanks = Record<GameId, number | null>`
  - `playerLiveRanks(snapshot: LeaderboardSnapshot, address: string): LiveRanks`
  - `bestLiveRank(ranks: LiveRanks): { gameId: GameId; rank: number } | null`

- [ ] **Step 1: Write the failing tests**

Create `frontend/lib/player-ranks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { playerLiveRanks, bestLiveRank, type LiveRanks } from "./player-ranks";
import { GAME_IDS, type GameId } from "./game-registry";
import type { LeaderboardSnapshot } from "./leaderboard-snapshot";

// Build a snapshot where each named game gets the given top-ten rows; all other
// games are empty boards.
function snapshotWith(
  boards: Partial<Record<GameId, { player: string; score: number }[]>>,
): LeaderboardSnapshot {
  const games = Object.fromEntries(
    GAME_IDS.map((id) => [
      id,
      {
        topTen: boards[id] ?? [],
        currentSeason: 1,
        prizePool: 0,
        seasonEndBlock: 0,
      },
    ]),
  ) as LeaderboardSnapshot["games"];
  return { updatedAt: "2026-06-18T00:00:00.000Z", games };
}

describe("player-ranks", () => {
  it("maps each game to the player's rank or null", () => {
    const snap = snapshotWith({
      snake: [
        { player: "SP_X", score: 100 },
        { player: "SP_ME", score: 90 },
      ],
      tetris: [{ player: "SP_OTHER", score: 50 }],
    });
    const ranks = playerLiveRanks(snap, "SP_ME");
    expect(ranks.snake).toBe(2);
    expect(ranks.tetris).toBeNull();
    expect(ranks.pacman).toBeNull();
  });

  it("returns null for every game when the address is nowhere", () => {
    const snap = snapshotWith({ snake: [{ player: "SP_X", score: 100 }] });
    const ranks = playerLiveRanks(snap, "SP_NOBODY");
    for (const id of GAME_IDS) expect(ranks[id]).toBeNull();
  });

  it("bestLiveRank picks the lowest rank number across games", () => {
    const ranks: LiveRanks = {
      snake: 3,
      tetris: 1,
      pacman: null,
      breakout: 5,
      minesweeper: null,
      solitaire: null,
    };
    expect(bestLiveRank(ranks)).toEqual({ gameId: "tetris", rank: 1 });
  });

  it("bestLiveRank returns null when the player is in no top-10", () => {
    const ranks: LiveRanks = {
      snake: null,
      tetris: null,
      pacman: null,
      breakout: null,
      minesweeper: null,
      solitaire: null,
    };
    expect(bestLiveRank(ranks)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run lib/player-ranks.test.ts`
Expected: FAIL — cannot find module `./player-ranks`.

- [ ] **Step 3: Implement the module**

Create `frontend/lib/player-ranks.ts`:

```ts
import { GAME_IDS, type GameId } from "./game-registry";
import { findPlayerRank } from "./leaderboard-showcase";
import type { LeaderboardSnapshot } from "./leaderboard-snapshot";

export type LiveRanks = Record<GameId, number | null>;

/** The player's current-season rank in every game (null where not ranked). */
export function playerLiveRanks(
  snapshot: LeaderboardSnapshot,
  address: string,
): LiveRanks {
  return Object.fromEntries(
    GAME_IDS.map((id) => [
      id,
      findPlayerRank(snapshot.games[id].topTen, address),
    ]),
  ) as LiveRanks;
}

/** The single best (lowest-number) live rank across all games, or null. */
export function bestLiveRank(
  ranks: LiveRanks,
): { gameId: GameId; rank: number } | null {
  let best: { gameId: GameId; rank: number } | null = null;
  for (const id of GAME_IDS) {
    const rank = ranks[id];
    if (rank == null) continue;
    if (!best || rank < best.rank) best = { gameId: id, rank };
  }
  return best;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run lib/player-ranks.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/player-ranks.ts frontend/lib/player-ranks.test.ts
git commit -m "feat(profile): add playerLiveRanks + bestLiveRank aggregator"
```

---

### Task 3: Wire live rank into `PlayerProfileBody`

**Files:**
- Modify: `frontend/components/player/PlayerProfileBody.tsx`

**Interfaces:**
- Consumes: `fetchLeaderboardSnapshot` from `lib/leaderboard-snapshot`; `playerLiveRanks`, `bestLiveRank`, `LiveRanks` from `lib/player-ranks`; existing `GAMES`, `GAME_IDS`, `GameId` (already imported).
- Produces: no new exports; renders a `Rank` row in each minted game card and a `Live rank` header chip.

- [ ] **Step 1: Add imports**

At the top of `frontend/components/player/PlayerProfileBody.tsx`, after the existing `computePlayerStats` import (line 8), add:

```ts
import { fetchLeaderboardSnapshot } from "@/lib/leaderboard-snapshot";
import { playerLiveRanks, bestLiveRank, type LiveRanks } from "@/lib/player-ranks";
```

- [ ] **Step 2: Add a module-level rank-label helper**

Near the other top-level helpers in the file (e.g. just above `function topGameLabel`), add:

```ts
function rankLabel(rank: number | null): string {
  if (rank == null) return "Not in top-10";
  return rank <= 3 ? `🏆 #${rank}` : `#${rank}`;
}
```

- [ ] **Step 3: Add rank state + parallel fetch effect**

Inside `PlayerProfileBody`, after the existing `const [filter, setFilter] = useState<ProfileFilter>("all");` line, add:

```ts
  const [rankState, setRankState] =
    useState<{ ranks: LiveRanks } | "loading" | "error">("loading");
```

Then, after the existing NFT-loading `useEffect` (the one that ends at line ~79), add a second effect:

```ts
  useEffect(() => {
    let cancelled = false;
    setRankState("loading");
    fetchLeaderboardSnapshot()
      .then((snap) => {
        if (!cancelled) setRankState({ ranks: playerLiveRanks(snap, address) });
      })
      .catch(() => {
        if (!cancelled) setRankState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [address]);
```

Then derive the two values the children need. Add directly after the existing `const stats = useMemo(...)` line:

```ts
  const ranks = typeof rankState === "object" ? rankState.ranks : null;
  const ranksLoading = rankState === "loading";
  const topLiveRank = ranks ? bestLiveRank(ranks) : null;
```

- [ ] **Step 4: Pass live-rank props to the header**

In the `<ProfileHeader ... />` JSX (around line 113), add two props before the closing `/>`:

```tsx
        liveRank={topLiveRank}
        ranksLoading={ranksLoading}
```

Update the `ProfileHeader` function signature (around line 288) to accept them. Add to the destructured params and the type:

```tsx
  liveRank,
  ranksLoading,
}: {
  address: string;
  isOwnProfile: boolean;
  totalMints?: number;
  bestScore?: number;
  topGame: string | null;
  levelInfo?: LevelInfo | null;
  onOpenMyNfts?: () => void;
  liveRank: { gameId: GameId; rank: number } | null;
  ranksLoading: boolean;
}) {
```

Then, in the chip row inside `ProfileHeader` (the `<div>` containing the three existing `<ProfileChip ... />` for NFTs / Best / Top game, around line 361), add a fourth chip after the `Top game` chip:

```tsx
        {ranksLoading ? (
          <ProfileChip label="Live rank" value="…" />
        ) : liveRank ? (
          <ProfileChip
            label="Live rank"
            value={`#${liveRank.rank} — ${GAMES[liveRank.gameId].label}`}
          />
        ) : null}
```

- [ ] **Step 5: Pass live-rank props to `GameBreakdown` and render the rank row**

In the `<GameBreakdown ... />` JSX (around line 130), add props:

```tsx
        <GameBreakdown
          stats={stats}
          active={filter}
          onSelect={setFilter}
          ranks={ranks}
          ranksLoading={ranksLoading}
        />
```

Update the `GameBreakdown` signature (around line 395) to accept them:

```tsx
function GameBreakdown({
  stats,
  active,
  onSelect,
  ranks,
  ranksLoading,
}: {
  stats: ReturnType<typeof computePlayerStats>;
  active: ProfileFilter;
  onSelect: (filter: ProfileFilter) => void;
  ranks: LiveRanks | null;
  ranksLoading: boolean;
}) {
```

Then, inside the per-game stats grid — the block that renders `Best` / `Seasons` / `Fees` when `gameStats.totalMints > 0` (around lines 457-478) — add a `Rank` row as the first pair, immediately after the opening `<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", ... }}>`:

```tsx
                  <span>Rank</span>
                  <b style={{ textAlign: "right", color: "#000" }}>
                    {ranksLoading ? "…" : rankLabel(ranks?.[id] ?? null)}
                  </b>
```

(The existing `Best` / `Seasons` / `Fees` rows follow unchanged.)

- [ ] **Step 6: Type-check, test, lint**

Run each and read the output:

```bash
cd frontend && npx tsc --noEmit
cd frontend && npm test
cd frontend && npm run lint
```

Expected: `tsc` clean (no errors); full Vitest suite green (including Tasks 1-2); lint clean.

- [ ] **Step 7: Manual verification in the running app**

```bash
cd frontend && npm run dev
```

Open the app, connect a wallet that holds Score NFTs (or open any ranked player's profile via the High Scores / Hall of Fame click-through). Confirm:
- A `Live rank` chip appears in the header when the player is in any game's top-10 (e.g. `#1 — Snake`), and is absent otherwise.
- Each minted game card shows a `Rank` row: `🏆 #N` for top-3, `#N` for 4-10, `Not in top-10` otherwise.
- The profile still renders fully if the leaderboard request is slow/blocked (rank shows `…`, then resolves or disappears — never an error, never a blank profile).

- [ ] **Step 8: Commit**

```bash
git add frontend/components/player/PlayerProfileBody.tsx
git commit -m "feat(profile): show live current-season rank per game on profile"
```

---

## Self-Review Notes

- **Spec coverage:** data source (Task 3 effect) ✓; `findPlayerRank` (Task 1) ✓; `playerLiveRanks` + `bestLiveRank` (Task 2) ✓; per-game rank row + header chip (Task 3) ✓; current-season semantics + "Not in top-10" (Task 1/2 null handling + `rankLabel`) ✓; parallel non-blocking load + `…` loading + error-omits-UI (Task 3 `rankState`) ✓; works for own + public profile (single `address` prop path) ✓; tests for all pure helpers (Tasks 1-2) ✓.
- **Type consistency:** `LiveRanks`, `playerLiveRanks`, `bestLiveRank`, `findPlayerRank`, `rankLabel` used with identical signatures across tasks. `bestLiveRank` returns `{ gameId: GameId; rank: number } | null`, matching the `liveRank` prop type in `ProfileHeader`.
- **No placeholders:** every code step shows full code; commands have expected output.
