# Arcade Champion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cross-game "Arcade Champion" ranking (a retro arcade attract-mode window + desktop panel) that scores each player by rank points summed across all six games, computed purely from the cached leaderboard snapshot.

**Architecture:** A pure logic module (`lib/arcade-champion.ts`) turns the per-game top-10 rows into a sorted `ChampionEntry[]`. A presentational `ChampionBoard` renders the podium / medal strips / NEW-CHAMPION banner from props (testable via `renderToStaticMarkup`). A thin window container fetches the snapshot (like `HighScoreWindow`), computes champions, and handles season-scoped banner persistence. A desktop panel reuses the showcase data already loaded by `useLeaderboardShowcase`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zustand 5, `98.css`, Vitest 3 with `react-dom/server` `renderToStaticMarkup` for component tests. No new dependencies. No contract change.

## Global Constraints

- **Path must not contain spaces** — keep work under `Desktop/xp-snake/`.
- **No new dependencies**; effects are pure CSS in `app/globals.css`.
- **Frontend-only**: no contract change, no new on-chain reads (snapshot-derived).
- **Honor `prefers-reduced-motion: reduce`**: animations disabled under that media query (scanlines may stay, they are static).
- **Win95 theme preserved**: window chrome via the existing `Window` component; flair lives only inside the content area.
- **Git (this project):** conventional prefixes (`feat:`/`refactor:`/`docs:`), **no `Co-Authored-By` trailer**, stage explicit files, every commit green (`npx tsc --noEmit`, `npm test`, `npm run lint`).
- **GameId order (medal strip + scan):** `snake, tetris, pacman, breakout, minesweeper, solitaire` (from `GAME_IDS`); emojis come from `GAMES[id].emoji`.

---

### Task 1: Cross-game rank-points scoring helper

**Files:**
- Create: `frontend/lib/arcade-champion.ts`
- Test: `frontend/lib/arcade-champion.test.ts`

**Interfaces:**
- Consumes: `GAME_IDS`, `GameId` from `@/lib/game-registry`; `TopEntry` from `@/lib/contract-calls`; `findPlayerRank` from `@/lib/leaderboard-showcase`.
- Produces:
  - `type RowsByGame = Record<GameId, TopEntry[]>`
  - `type ChampionEntry = { player: string; points: number; ranks: Record<GameId, number | null>; firsts: number; bestRank: number; gamesRanked: number }`
  - `rankPoints(rank: number): number`
  - `computeArcadeChampions(rows: RowsByGame): ChampionEntry[]`

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/arcade-champion.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { GAME_IDS, type GameId } from "./game-registry";
import type { TopEntry } from "./contract-calls";
import {
  rankPoints,
  computeArcadeChampions,
  type RowsByGame,
} from "./arcade-champion";

/** Players given highest-first; assigns descending scores so findPlayerRank
 *  yields rank = array position (1-based). */
function board(...players: string[]): TopEntry[] {
  return players.map((player, i) => ({ player, score: 1000 - i }));
}

/** Build a full RowsByGame, empty where unspecified. */
function rowsOf(partial: Partial<Record<GameId, TopEntry[]>>): RowsByGame {
  return GAME_IDS.reduce((acc, id) => {
    acc[id] = partial[id] ?? [];
    return acc;
  }, {} as RowsByGame);
}

describe("rankPoints", () => {
  it("awards 11 - rank inside the top 10, else 0", () => {
    expect(rankPoints(1)).toBe(10);
    expect(rankPoints(10)).toBe(1);
    expect(rankPoints(0)).toBe(0);
    expect(rankPoints(11)).toBe(0);
  });
});

describe("computeArcadeChampions", () => {
  it("sums rank points across games and sorts by total", () => {
    const rows = rowsOf({
      snake: board("A", "B"),   // A #1, B #2
      tetris: board("B", "C"),  // B #1, C #2
      pacman: board("B"),       // B #1
    });
    const champs = computeArcadeChampions(rows);
    expect(champs[0]).toMatchObject({ player: "B", points: 29, firsts: 2, gamesRanked: 3 });
    expect(champs.map((c) => c.player)).toEqual(["B", "A", "C"]);
  });

  it("excludes players not ranked in any game and handles an empty snapshot", () => {
    expect(computeArcadeChampions(rowsOf({}))).toEqual([]);
  });

  it("includes a player ranked in only one game", () => {
    const champs = computeArcadeChampions(rowsOf({ snake: board("solo") }));
    expect(champs).toHaveLength(1);
    expect(champs[0]).toMatchObject({ player: "solo", points: 10, gamesRanked: 1 });
  });

  it("tie-breaks equal points by more #1 finishes", () => {
    // P: snake #1 (10) + tetris #3 (8) = 18, firsts 1
    // Q: pacman #2 (9) + breakout #2 (9) = 18, firsts 0
    const rows = rowsOf({
      snake: board("P", "g"),            // P #1 -> 10
      tetris: board("h", "i", "P"),      // P #3 -> 8
      pacman: board("j", "Q"),           // Q #2 -> 9
      breakout: board("k", "Q"),         // Q #2 -> 9
    });
    const top2 = computeArcadeChampions(rows).slice(0, 2).map((c) => c.player);
    expect(top2).toEqual(["P", "Q"]); // equal 18 pts; P wins on firsts (1 > 0)
  });

  it("tie-breaks equal points and equal firsts by the better single rank", () => {
    const rows = rowsOf({
      snake: board("e", "P"),                 // P #2 -> 9
      tetris: board("f1", "f2", "f3", "P"),   // P #4 -> 7   (P: 16, firsts 0, bestRank 2)
      pacman: board("g1", "g2", "Q"),         // Q #3 -> 8
      breakout: board("h1", "h2", "Q"),       // Q #3 -> 8   (Q: 16, firsts 0, bestRank 3)
    });
    const champs = computeArcadeChampions(rows);
    const top2 = champs.slice(0, 2).map((c) => c.player);
    expect(top2).toEqual(["P", "Q"]); // 16 == 16, 0 == 0 firsts; P wins (bestRank 2 < 3)
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/arcade-champion.test.ts`
Expected: FAIL — `Failed to resolve import "./arcade-champion"` / functions not defined.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/lib/arcade-champion.ts`:

```ts
import { GAME_IDS, type GameId } from "./game-registry";
import type { TopEntry } from "./contract-calls";
import { findPlayerRank } from "./leaderboard-showcase";

export type RowsByGame = Record<GameId, TopEntry[]>;

export type ChampionEntry = {
  player: string;
  points: number;
  ranks: Record<GameId, number | null>;
  firsts: number;
  /** Best (lowest) single rank across games; 11 = unranked sentinel (real ranks 1..10). */
  bestRank: number;
  gamesRanked: number;
};

/** Top-10 placement of rank r earns 11 - r points (#1=10 ... #10=1); else 0. */
export function rankPoints(rank: number): number {
  return rank >= 1 && rank <= 10 ? 11 - rank : 0;
}

/** Cross-game ranking from the per-game top-10 rows. Players not in any game's
 *  top-10 are excluded. Sorted: points desc -> firsts desc -> bestRank asc ->
 *  address (deterministic final tiebreak). Pure; no I/O. */
export function computeArcadeChampions(rows: RowsByGame): ChampionEntry[] {
  const players = new Set<string>();
  for (const id of GAME_IDS) {
    for (const entry of rows[id] ?? []) players.add(entry.player);
  }

  const entries: ChampionEntry[] = [];
  for (const player of players) {
    const ranks = {} as Record<GameId, number | null>;
    let points = 0;
    let firsts = 0;
    let bestRank = 11;
    let gamesRanked = 0;
    for (const id of GAME_IDS) {
      const rank = findPlayerRank(rows[id] ?? [], player);
      ranks[id] = rank;
      if (rank != null) {
        points += rankPoints(rank);
        gamesRanked += 1;
        if (rank === 1) firsts += 1;
        if (rank < bestRank) bestRank = rank;
      }
    }
    if (gamesRanked > 0) {
      entries.push({ player, points, ranks, firsts, bestRank, gamesRanked });
    }
  }

  entries.sort(
    (a, b) =>
      b.points - a.points ||
      b.firsts - a.firsts ||
      a.bestRank - b.bestRank ||
      a.player.localeCompare(b.player),
  );
  return entries;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/arcade-champion.test.ts`
Expected: PASS (all `rankPoints` + `computeArcadeChampions` cases).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/arcade-champion.ts frontend/lib/arcade-champion.test.ts
git commit -m "feat(arcade-champion): cross-game rank-points scoring helper"
```

---

### Task 2: New-champion detection helper

**Files:**
- Modify: `frontend/lib/arcade-champion.ts` (append `detectNewChampion`)
- Modify: `frontend/lib/arcade-champion.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `ChampionEntry` (Task 1).
- Produces: `detectNewChampion(prevChampion: string | null, current: ChampionEntry[]): { player: string; dethroned: string | null } | null`

- [ ] **Step 1: Write the failing test**

Append to `frontend/lib/arcade-champion.test.ts`:

```ts
import { detectNewChampion } from "./arcade-champion";

function champ(player: string): import("./arcade-champion").ChampionEntry {
  return { player, points: 10, ranks: {} as never, firsts: 1, bestRank: 1, gamesRanked: 1 };
}

describe("detectNewChampion", () => {
  it("returns null on first-ever sight (no stored champion)", () => {
    expect(detectNewChampion(null, [champ("A")])).toBeNull();
  });

  it("returns null when the leader is unchanged", () => {
    expect(detectNewChampion("A", [champ("A"), champ("B")])).toBeNull();
  });

  it("returns null when there is no leader", () => {
    expect(detectNewChampion("A", [])).toBeNull();
  });

  it("reports the new leader and who was dethroned on a throne change", () => {
    expect(detectNewChampion("A", [champ("B"), champ("A")])).toEqual({
      player: "B",
      dethroned: "A",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/arcade-champion.test.ts`
Expected: FAIL — `detectNewChampion` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `frontend/lib/arcade-champion.ts`:

```ts
/** Detect a throne change for the NEW CHAMPION banner. `prevChampion` is the
 *  last-seen leader address (null on first sight). Returns null when there is
 *  no leader, on first sight (so no banner flashes), or when unchanged. */
export function detectNewChampion(
  prevChampion: string | null,
  current: ChampionEntry[],
): { player: string; dethroned: string | null } | null {
  const leader = current[0];
  if (!leader) return null;
  if (prevChampion === null) return null;
  if (leader.player === prevChampion) return null;
  return { player: leader.player, dethroned: prevChampion };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/arcade-champion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/arcade-champion.ts frontend/lib/arcade-champion.test.ts
git commit -m "feat(arcade-champion): new-champion detection helper"
```

---

### Task 3: ChampionBoard presentational component + CSS

**Files:**
- Create: `frontend/components/champion/ChampionBoard.tsx`
- Create: `frontend/components/champion/ChampionBoard.test.tsx`
- Modify: `frontend/app/globals.css` (append keyframes + reduced-motion block)

**Interfaces:**
- Consumes: `ChampionEntry` (Task 1); `GAME_IDS`, `GAMES` from `@/lib/game-registry`; `shortPlayer` from `@/lib/leaderboard-showcase`.
- Produces: `ChampionBoard` (default-free named export) with props:
  `{ champions: ChampionEntry[]; season: number | null; address: string | null; newChampion: { player: string; dethroned: string | null } | null; lastUpdated: Date | null }`

- [ ] **Step 1: Append CSS to `frontend/app/globals.css`**

Append at end of `frontend/app/globals.css`:

```css
/* ---- Arcade Champion ---- */
.champion-screen {
  position: relative;
  background:
    repeating-linear-gradient(
      0deg,
      rgba(0, 0, 0, 0.25) 0px,
      rgba(0, 0, 0, 0.25) 1px,
      transparent 1px,
      transparent 3px
    ),
    radial-gradient(ellipse at center, #0b1026 0%, #05060f 100%);
  color: #e7ecff;
  overflow: hidden;
}
.champion-marquee {
  color: #ffe169;
  text-shadow: 0 0 4px #ffb800, 0 0 12px #ff7a00;
  animation: championFlicker 3.2s infinite;
}
@keyframes championFlicker {
  0%, 92%, 100% { opacity: 1; }
  93% { opacity: 0.55; }
  96% { opacity: 0.9; }
}
.champion-pop { animation: championPop 0.5s ease-out both; }
@keyframes championPop {
  0% { transform: scale(0.6); opacity: 0; }
  70% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); }
}
.champion-crown { animation: championBob 2.4s ease-in-out infinite; }
@keyframes championBob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
.champion-you { animation: championYouPulse 1.8s ease-in-out infinite; }
@keyframes championYouPulse {
  0%, 100% { box-shadow: 0 0 0 1px #ffcf33, 0 0 6px rgba(255, 207, 51, 0.5); }
  50% { box-shadow: 0 0 0 1px #ffcf33, 0 0 12px rgba(255, 207, 51, 0.9); }
}
.champion-banner { animation: championPop 0.5s ease-out both; }
.champion-confetti span {
  position: absolute;
  top: -8px;
  width: 5px;
  height: 5px;
  animation: championConfetti 1.6s linear forwards;
}
@keyframes championConfetti {
  to { transform: translateY(260px) rotate(360deg); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .champion-marquee,
  .champion-pop,
  .champion-crown,
  .champion-you,
  .champion-banner,
  .champion-confetti span {
    animation: none !important;
  }
  .champion-confetti { display: none; }
}
```

- [ ] **Step 2: Write the failing test**

Create `frontend/components/champion/ChampionBoard.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChampionBoard } from "./ChampionBoard";
import type { ChampionEntry } from "@/lib/arcade-champion";
import type { GameId } from "@/lib/game-registry";

function entry(player: string, points: number, ranks: Partial<Record<GameId, number>>): ChampionEntry {
  const full = {
    snake: null, tetris: null, pacman: null,
    breakout: null, minesweeper: null, solitaire: null,
  } as Record<GameId, number | null>;
  for (const k of Object.keys(ranks) as GameId[]) full[k] = ranks[k]!;
  const ranked = Object.values(full).filter((r) => r != null) as number[];
  return {
    player,
    points,
    ranks: full,
    firsts: ranked.filter((r) => r === 1).length,
    bestRank: ranked.length ? Math.min(...ranked) : 11,
    gamesRanked: ranked.length,
  };
}

const champs: ChampionEntry[] = [
  entry("SP1111111111111111111111111111111111AAAA", 29, { snake: 1, tetris: 1, pacman: 1 }),
  entry("SP2222222222222222222222222222222222BBBB", 18, { snake: 2, breakout: 1 }),
  entry("SP3333333333333333333333333333333333CCCC", 9, { tetris: 2 }),
];

describe("ChampionBoard", () => {
  it("renders the marquee, season, and the leader's points", () => {
    const html = renderToStaticMarkup(
      <ChampionBoard champions={champs} season={3} address={null} newChampion={null} lastUpdated={new Date()} />,
    );
    expect(html).toContain("ARCADE CHAMPION");
    expect(html).toContain("Season 3");
    expect(html).toContain("29");
  });

  it("shows an empty state when there are no champions", () => {
    const html = renderToStaticMarkup(
      <ChampionBoard champions={[]} season={null} address={null} newChampion={null} lastUpdated={null} />,
    );
    expect(html).toContain("No ranked players yet");
  });

  it("renders the NEW CHAMPION banner on a throne change", () => {
    const html = renderToStaticMarkup(
      <ChampionBoard
        champions={champs}
        season={3}
        address={null}
        newChampion={{ player: champs[0].player, dethroned: champs[1].player }}
        lastUpdated={new Date()}
      />,
    );
    expect(html).toContain("NEW CHAMPION");
  });

  it("marks the connected wallet's row as YOU", () => {
    const html = renderToStaticMarkup(
      <ChampionBoard champions={champs} season={3} address={champs[1].player} newChampion={null} lastUpdated={new Date()} />,
    );
    expect(html).toContain("YOU");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run components/champion/ChampionBoard.test.tsx`
Expected: FAIL — cannot resolve `./ChampionBoard`.

- [ ] **Step 4: Write the implementation**

Create `frontend/components/champion/ChampionBoard.tsx`:

```tsx
"use client";
import { GAME_IDS, GAMES, type GameId } from "@/lib/game-registry";
import { shortPlayer } from "@/lib/leaderboard-showcase";
import type { ChampionEntry } from "@/lib/arcade-champion";

const PODIUM_ORDER = [1, 0, 2]; // silver, gold, bronze (gold center)
const PODIUM_HEIGHT: Record<number, number> = { 0: 64, 1: 48, 2: 40 };
const PODIUM_COLOR: Record<number, string> = { 0: "#ffd700", 1: "#c0c0c0", 2: "#cd7f32" };
const CONFETTI_COLORS = ["#ffd700", "#19d1ff", "#ff4fd8", "#7CFC00", "#ffffff"];

function Confetti() {
  return (
    <div className="champion-confetti" aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {Array.from({ length: 18 }).map((_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 53) % 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(i % 6) * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

function MedalStrip({ ranks }: { ranks: Record<GameId, number | null> }) {
  return (
    <span style={{ display: "inline-flex", gap: 4, fontSize: 10, fontFamily: "monospace" }}>
      {GAME_IDS.map((id) => {
        const rank = ranks[id];
        const lit = rank != null;
        return (
          <span key={id} title={`${GAMES[id].label}${lit ? ` #${rank}` : ""}`} style={{ opacity: lit ? 1 : 0.25 }}>
            {GAMES[id].emoji}
            {lit ? rank : "·"}
          </span>
        );
      })}
    </span>
  );
}

export function ChampionBoard({
  champions,
  season,
  address,
  newChampion,
  lastUpdated,
}: {
  champions: ChampionEntry[];
  season: number | null;
  address: string | null;
  newChampion: { player: string; dethroned: string | null } | null;
  lastUpdated: Date | null;
}) {
  const podium = PODIUM_ORDER.map((i) => champions[i]).filter(Boolean) as ChampionEntry[];

  return (
    <div className="champion-screen" style={{ padding: 10, minHeight: 320, fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif' }}>
      <Confetti />

      {newChampion && (
        <div
          className="champion-banner"
          style={{
            background: "linear-gradient(90deg,#fff4b0,#ffd86b,#fff4b0)",
            color: "#7a5c00",
            fontWeight: "bold",
            textAlign: "center",
            padding: "3px 6px",
            marginBottom: 8,
            fontSize: 11,
          }}
        >
          🎉 NEW CHAMPION 🎉 {shortPlayer(newChampion.player)}
          {newChampion.dethroned ? ` dethroned ${shortPlayer(newChampion.dethroned)}` : ""}
        </div>
      )}

      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <div className="champion-marquee" style={{ fontSize: 18, fontWeight: "bold", letterSpacing: 3 }}>
          ★ ARCADE CHAMPION ★
        </div>
        <div style={{ fontSize: 10, color: "#9fb0e6" }}>
          {season != null ? `Season ${season} · ` : ""}live
        </div>
      </div>

      {champions.length === 0 ? (
        <div style={{ textAlign: "center", color: "#9fb0e6", padding: "24px 0", fontSize: 12 }}>
          No ranked players yet. Mint a top-10 score in any game to enter the race.
        </div>
      ) : (
        <>
          {/* Podium */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 10, marginBottom: 12 }}>
            {podium.map((c) => {
              const place = champions.indexOf(c);
              return (
                <div key={c.player} className="champion-pop" style={{ textAlign: "center", width: 84 }}>
                  {place === 0 && <div className="champion-crown" style={{ fontSize: 18 }}>👑</div>}
                  <div style={{ fontSize: 10, fontFamily: "monospace" }}>{shortPlayer(c.player)}</div>
                  <div style={{ fontWeight: "bold", color: "#ffe169" }}>{c.points} pts</div>
                  <div
                    style={{
                      height: PODIUM_HEIGHT[place],
                      background: PODIUM_COLOR[place],
                      color: "#1a1a1a",
                      fontWeight: "bold",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "3px 3px 0 0",
                    }}
                  >
                    #{place + 1}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Full ranking */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {champions.map((c, i) => {
              const isMe = c.player === address;
              return (
                <div
                  key={c.player}
                  className={isMe ? "champion-you" : undefined}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "26px 88px 1fr auto",
                    alignItems: "center",
                    gap: 6,
                    padding: "2px 6px",
                    fontSize: 11,
                    background: isMe ? "rgba(255,207,51,0.12)" : "rgba(255,255,255,0.03)",
                    borderRadius: 3,
                  }}
                >
                  <span style={{ fontWeight: "bold", color: "#ffe169" }}>#{i + 1}</span>
                  <span style={{ fontFamily: "monospace", color: "#cfe" }}>
                    {isMe ? "YOU" : shortPlayer(c.player)}
                  </span>
                  <MedalStrip ranks={c.ranks} />
                  <span style={{ fontWeight: "bold", fontFamily: "monospace" }}>{c.points} pts</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ marginTop: 8, fontSize: 9, color: "#7e8cc0", textAlign: "center" }}>
        {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Loading"}
        {" · cross-game rank points · resets each season"}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run components/champion/ChampionBoard.test.tsx`
Expected: PASS (4 cases).

- [ ] **Step 6: Commit**

```bash
git add frontend/components/champion/ChampionBoard.tsx frontend/components/champion/ChampionBoard.test.tsx frontend/app/globals.css
git commit -m "feat(arcade-champion): champion board UI with podium, medal strips, confetti"
```

---

### Task 4: Arcade Champion window container + registration + launch entries

**Files:**
- Modify: `frontend/state/window-manager.ts:5-12` (add `"arcade-champion"` to `WindowType`)
- Create: `frontend/components/windows/ArcadeChampionWindow.tsx`
- Modify: `frontend/app/page.tsx` (import + mount `<ArcadeChampionWindow />`)
- Modify: `frontend/components/desktop/StartMenu.tsx:155` (add a MenuItem after Hall of Fame)
- Modify: `frontend/components/desktop/Desktop.tsx:135` (add a DesktopIcon after Hall of Fame)

**Interfaces:**
- Consumes: `computeArcadeChampions`, `RowsByGame` (Task 1); `ChampionBoard` (Task 3); `fetchLeaderboardSnapshot` from `@/lib/leaderboard-snapshot`; `useWindows` + `Window`.
- Produces: `ArcadeChampionWindow` React component (mounted once in `page.tsx`); `WindowType` now includes `"arcade-champion"`. In this task the window passes `newChampion={null}` (banner wiring comes in Task 5).

- [ ] **Step 1: Register the window type**

In `frontend/state/window-manager.ts`, change the `WindowType` union (currently lines 5-12) to add `"arcade-champion"`:

```ts
export type WindowType =
  | `game-${GameId}`
  | "highscore"
  | "hall-of-fame"
  | "arcade-champion"
  | "mynfts"
  | "season-admin"
  | "player-profile"
  | "browser";
```

- [ ] **Step 2: Create the window container**

Create `frontend/components/windows/ArcadeChampionWindow.tsx`:

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { Window } from "@/components/windows/Window";
import { ChampionBoard } from "@/components/champion/ChampionBoard";
import { fetchLeaderboardSnapshot } from "@/lib/leaderboard-snapshot";
import { computeArcadeChampions, type RowsByGame } from "@/lib/arcade-champion";
import { GAME_IDS } from "@/lib/game-registry";

function rowsFromSnapshot(games: Awaited<ReturnType<typeof fetchLeaderboardSnapshot>>["games"]): RowsByGame {
  return GAME_IDS.reduce((acc, id) => {
    acc[id] = games[id]?.topTen ?? [];
    return acc;
  }, {} as RowsByGame);
}

export function ArcadeChampionWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "arcade-champion"));
  const address = useWallet((s) => s.address);
  const [rows, setRows] = useState<RowsByGame | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const open = !!w;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    function load() {
      fetchLeaderboardSnapshot()
        .then((snap) => {
          if (cancelled) return;
          setRows(rowsFromSnapshot(snap.games));
          setSeason(snap.games.snake?.currentSeason ?? null);
          setLastUpdated(new Date());
        })
        .catch(() => {});
    }
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open]);

  const champions = useMemo(() => (rows ? computeArcadeChampions(rows) : []), [rows]);

  if (!w) return null;

  return (
    <Window id={w.id} title="👑 Arcade Champion" width={460}>
      <ChampionBoard
        champions={champions}
        season={season}
        address={address}
        newChampion={null}
        lastUpdated={lastUpdated}
      />
    </Window>
  );
}
```

- [ ] **Step 3: Mount the window in `frontend/app/page.tsx`**

Add the import after the `HallOfFameWindow` import (line 10) and mount it after `<HallOfFameWindow />` (line 28):

```tsx
import { ArcadeChampionWindow } from "@/components/windows/ArcadeChampionWindow";
```

```tsx
        <HallOfFameWindow />
        <ArcadeChampionWindow />
```

- [ ] **Step 4: Add the Start-menu entry**

In `frontend/components/desktop/StartMenu.tsx`, add directly after the "Hall of Fame" `MenuItem` (ends at line 155):

```tsx
          <MenuItem
            icon="👑"
            label="Arcade Champion"
            onClick={() => { openWin("arcade-champion"); onClose(); }}
          />
```

- [ ] **Step 5: Add the desktop icon**

In `frontend/components/desktop/Desktop.tsx`, add directly after the "Hall of Fame" `DesktopIcon` (ends at line 135):

```tsx
        <DesktopIcon
          label="Arcade Champion"
          emoji="👑"
          onOpen={() => open("arcade-champion")}
        />
```

- [ ] **Step 6: Verify build + types + lint**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npm run lint`
Expected: tsc clean; all tests pass (no new test, existing suite green); lint clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/state/window-manager.ts frontend/components/windows/ArcadeChampionWindow.tsx frontend/app/page.tsx frontend/components/desktop/StartMenu.tsx frontend/components/desktop/Desktop.tsx
git commit -m "feat(arcade-champion): window with podium board + Start menu and desktop launchers"
```

---

### Task 5: NEW CHAMPION banner + season-scoped persistence

**Files:**
- Create: `frontend/lib/champion-seen.ts`
- Create: `frontend/lib/champion-seen.test.ts`
- Modify: `frontend/components/windows/ArcadeChampionWindow.tsx` (wire detection + persistence)

**Interfaces:**
- Consumes: `detectNewChampion`, `ChampionEntry` (Task 2); `computeArcadeChampions` (Task 1).
- Produces:
  - `loadSeenChampion(season: number | null): string | null`
  - `saveSeenChampion(season: number | null, player: string): void`

- [ ] **Step 1: Write the failing test for persistence helpers**

Create `frontend/lib/champion-seen.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { loadSeenChampion, saveSeenChampion } from "./champion-seen";

describe("champion-seen persistence", () => {
  beforeEach(() => sessionStorage.clear());

  it("returns null before anything is stored", () => {
    expect(loadSeenChampion(3)).toBeNull();
  });

  it("round-trips a champion per season key", () => {
    saveSeenChampion(3, "SP_A");
    expect(loadSeenChampion(3)).toBe("SP_A");
  });

  it("isolates by season so a new season starts empty (no false positive)", () => {
    saveSeenChampion(3, "SP_A");
    expect(loadSeenChampion(4)).toBeNull();
  });

  it("uses an 'unknown' bucket when the season is null", () => {
    saveSeenChampion(null, "SP_Z");
    expect(loadSeenChampion(null)).toBe("SP_Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/champion-seen.test.ts`
Expected: FAIL — cannot resolve `./champion-seen`.

- [ ] **Step 3: Write the persistence helpers**

Create `frontend/lib/champion-seen.ts`:

```ts
/** Session-scoped memory of the last-seen arcade champion, keyed by season so a
 *  season rollover starts empty (the new season's first champion does not flash
 *  the NEW CHAMPION banner). */
function key(season: number | null): string {
  return `arcade-champ-seen:${season ?? "unknown"}`;
}

export function loadSeenChampion(season: number | null): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(key(season));
  } catch {
    return null;
  }
}

export function saveSeenChampion(season: number | null, player: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key(season), player);
  } catch {
    /* storage blocked → no-op */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/champion-seen.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the banner into the window**

In `frontend/components/windows/ArcadeChampionWindow.tsx`:

Add imports:

```tsx
import { computeArcadeChampions, detectNewChampion, type RowsByGame } from "@/lib/arcade-champion";
import { loadSeenChampion, saveSeenChampion } from "@/lib/champion-seen";
```

(remove the old `computeArcadeChampions` import line so it is not duplicated).

Add banner state below the other `useState` hooks:

```tsx
  const [newChampion, setNewChampion] = useState<{ player: string; dethroned: string | null } | null>(null);
```

Replace the `champions` memo and add a detection effect:

```tsx
  const champions = useMemo(() => (rows ? computeArcadeChampions(rows) : []), [rows]);

  useEffect(() => {
    if (!open || champions.length === 0) return;
    const prev = loadSeenChampion(season);
    const change = detectNewChampion(prev, champions);
    if (change) setNewChampion(change);
    saveSeenChampion(season, champions[0].player);
  }, [open, season, champions]);
```

Pass it to the board (replace `newChampion={null}`):

```tsx
        newChampion={newChampion}
```

- [ ] **Step 6: Verify build + types + lint + tests**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npm run lint`
Expected: tsc clean; tests pass; lint clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/champion-seen.ts frontend/lib/champion-seen.test.ts frontend/components/windows/ArcadeChampionWindow.tsx
git commit -m "feat(arcade-champion): NEW CHAMPION banner with season-scoped persistence"
```

---

### Task 6: Desktop attract-mode champion panel

**Files:**
- Create: `frontend/components/desktop/DesktopChampionPanel.tsx`
- Create: `frontend/components/desktop/DesktopChampionPanel.test.tsx`
- Modify: `frontend/components/desktop/Desktop.tsx` (compute champions from `leaderboard.rowsByGame`, detect a live throne change, render the panel)

**Interfaces:**
- Consumes: `ChampionEntry`, `computeArcadeChampions` (Task 1); `shortPlayer` from `@/lib/leaderboard-showcase`; `useWindows`.
- Produces: `DesktopChampionPanel` with props `{ entries: ChampionEntry[]; isNew: boolean; onOpen: () => void }`.

- [ ] **Step 1: Write the failing test**

Create `frontend/components/desktop/DesktopChampionPanel.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DesktopChampionPanel } from "./DesktopChampionPanel";
import type { ChampionEntry } from "@/lib/arcade-champion";
import type { GameId } from "@/lib/game-registry";

function entry(player: string, points: number): ChampionEntry {
  return {
    player,
    points,
    ranks: {} as Record<GameId, number | null>,
    firsts: 1,
    bestRank: 1,
    gamesRanked: 1,
  };
}

describe("DesktopChampionPanel", () => {
  it("shows the reigning champion and points", () => {
    const html = renderToStaticMarkup(
      <DesktopChampionPanel entries={[entry("SP_AAAAAAAA_BBBB", 29)]} isNew={false} onOpen={() => {}} />,
    );
    expect(html).toContain("Arcade Champion");
    expect(html).toContain("29");
  });

  it("renders an awaiting state with no entries", () => {
    const html = renderToStaticMarkup(
      <DesktopChampionPanel entries={[]} isNew={false} onOpen={() => {}} />,
    );
    expect(html).toContain("Awaiting");
  });

  it("shows a NEW! pip on a throne change", () => {
    const html = renderToStaticMarkup(
      <DesktopChampionPanel entries={[entry("SP_AAAAAAAA_BBBB", 29)]} isNew onOpen={() => {}} />,
    );
    expect(html).toContain("NEW!");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run components/desktop/DesktopChampionPanel.test.tsx`
Expected: FAIL — cannot resolve `./DesktopChampionPanel`.

- [ ] **Step 3: Write the panel**

Create `frontend/components/desktop/DesktopChampionPanel.tsx`:

```tsx
"use client";
import { shortPlayer } from "@/lib/leaderboard-showcase";
import type { ChampionEntry } from "@/lib/arcade-champion";

const panelStyle: React.CSSProperties = {
  width: 300,
  background: "#c0c0c0",
  border: "2px solid",
  borderColor: "#ffffff #808080 #808080 #ffffff",
  boxShadow: "2px 2px 0 #000000",
  fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
  fontSize: 11,
};

export function DesktopChampionPanel({
  entries,
  isNew,
  onOpen,
}: {
  entries: ChampionEntry[];
  isNew: boolean;
  onOpen: () => void;
}) {
  const champ = entries[0] ?? null;
  return (
    <section style={panelStyle}>
      <div
        style={{
          background: "linear-gradient(90deg, #000080, #1084d0)",
          color: "#ffffff",
          fontWeight: "bold",
          padding: "3px 6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>👑 Arcade Champion{isNew ? <span className="champion-you" style={{ marginLeft: 6, color: "#ffe169" }}>NEW!</span> : null}</span>
        <button onMouseDown={(e) => e.stopPropagation()} onClick={onOpen} style={{ fontSize: 10, height: 18, padding: "0 6px" }}>
          Open
        </button>
      </div>
      <div style={{ padding: 8 }}>
        {champ ? (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onOpen}
            style={{ width: "100%", display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 8, alignItems: "center", textAlign: "left" }}
            title="Open Arcade Champion"
          >
            <span style={{ fontSize: 22 }}>👑</span>
            <span style={{ fontFamily: "monospace" }}>{shortPlayer(champ.player)}</span>
            <span style={{ fontWeight: "bold", color: "#000080" }}>{champ.points} pts</span>
          </button>
        ) : (
          <div style={{ color: "#555", textAlign: "center", padding: "6px 0" }}>Awaiting ranked scores…</div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run components/desktop/DesktopChampionPanel.test.tsx`
Expected: PASS (3 cases).

- [ ] **Step 5: Wire the panel into `frontend/components/desktop/Desktop.tsx`**

Add imports near the other showcase imports (after line 16):

```tsx
import { DesktopChampionPanel } from "./DesktopChampionPanel";
import { computeArcadeChampions } from "@/lib/arcade-champion";
import { useMemo } from "react";
```

(Merge `useMemo` into the existing `import { useEffect, useRef, useState } from "react";` line instead of a second import if preferred.)

Inside the `Desktop` component, after the existing leaderboard change effect, compute champions + a live throne-change flag:

```tsx
  const champions = useMemo(
    () => computeArcadeChampions(leaderboard.rowsByGame),
    [leaderboard.rowsByGame],
  );
  const prevChampRef = useRef<string | null>(null);
  const [championIsNew, setChampionIsNew] = useState(false);
  useEffect(() => {
    const leader = champions[0]?.player ?? null;
    if (leader && prevChampRef.current && leader !== prevChampRef.current) {
      setChampionIsNew(true);
      const t = setTimeout(() => setChampionIsNew(false), 8000);
      prevChampRef.current = leader;
      return () => clearTimeout(t);
    }
    if (leader) prevChampRef.current = leader;
  }, [champions]);
```

Render the panel just before `<DesktopLeaderboardShowcase ... />` (line 153):

```tsx
      <DesktopChampionPanel
        entries={champions}
        isNew={championIsNew}
        onOpen={() => open("arcade-champion")}
      />
```

- [ ] **Step 6: Verify build + types + lint + full tests**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npm run lint`
Expected: tsc clean; all tests pass; lint clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/desktop/DesktopChampionPanel.tsx frontend/components/desktop/DesktopChampionPanel.test.tsx frontend/components/desktop/Desktop.tsx
git commit -m "feat(arcade-champion): desktop attract-mode champion panel"
```

---

## Final verification (after all tasks)

- [ ] Run the full gate: `cd frontend && npx tsc --noEmit && npx vitest run && npm run lint`
- [ ] Manual smoke (optional): `npm run dev`, open Start → 👑 Arcade Champion, confirm podium + medal strips render; resize browser to confirm the desktop panel shows the reigning champion; toggle OS "reduce motion" and confirm animations stop while content stays readable.

## Notes / decisions baked into this plan

- **Season anchor:** the cross-game "season" label + banner key use `snake`'s `currentSeason` (the anchor game). Games may technically be on different seasons; one anchor keeps the subtitle and persistence key simple and stable.
- **Count-up → CSS pop:** the spec's "count-up" points reveal is implemented as a pure-CSS `championPop` scale-in (`.champion-pop`), so it needs no JS and is auto-disabled under `prefers-reduced-motion`.
- **Two new-champion signals:** the window banner persists across opens via `sessionStorage` (`champion-seen.ts`); the desktop panel's `NEW!` pip is a lighter, in-session signal driven by a ref in `Desktop.tsx`. Both are intentional and independent.
