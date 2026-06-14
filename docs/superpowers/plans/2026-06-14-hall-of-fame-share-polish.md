# Hall of Fame — Season Share + Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players share a whole season's Hall-of-Fame leaderboard via a public page + OG card, and polish the Hall of Fame window (highlight the connected wallet, nicer loading/empty states, per-game hero ordering).

**Architecture:** Read-only against `xp-arcade-v4`. A new `lib/season-lookup.ts` resolves a season (live via `get-top-ten` + pool, closed via `get-season-prize` snapshot). A new route `app/share/season/[game]/[season]/` mirrors the existing per-score share route (`page.tsx` + `opengraph-image.tsx`). The Hall of Fame window gains a per-season share control and three visual refinements. No contract changes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, `next/og`, Vitest, `@stacks/transactions`.

**Spec:** `docs/superpowers/specs/2026-06-14-hall-of-fame-share-polish-design.md`

**Run all commands from `frontend/`.**

## File structure

- Create: `frontend/lib/season-lookup.ts` — resolve a season to a typed leaderboard snapshot.
- Create: `frontend/lib/season-lookup.test.ts` — unit tests.
- Modify: `frontend/lib/share.ts` — add `seasonShareUrl` + `xSeasonIntentUrl`.
- Modify: `frontend/lib/share.test.ts` — tests for the new helpers.
- Create: `frontend/components/shared/SeasonShareActions.tsx` — Share/Copy buttons for a season.
- Create: `frontend/app/share/season/[game]/[season]/opengraph-image.tsx` — 1200×630 PNG card.
- Create: `frontend/app/share/season/[game]/[season]/page.tsx` — public HTML page + OG meta.
- Modify: `frontend/components/windows/HallOfFameWindow.tsx` — wire share control + Part B polish.

---

### Task 1: `lib/season-lookup.ts` — resolve a season leaderboard

**Files:**
- Create: `frontend/lib/season-lookup.ts`
- Test: `frontend/lib/season-lookup.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/season-lookup.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getCurrentSeasonForGame,
  getTopTenForGame,
  getPrizePoolBalanceForGame,
  getSeasonPrizeForGame,
} from "./contract-calls";
import { fetchSeasonLookup } from "./season-lookup";

vi.mock("./contract-calls", () => ({
  getCurrentSeasonForGame: vi.fn(),
  getTopTenForGame: vi.fn(),
  getPrizePoolBalanceForGame: vi.fn(),
  getSeasonPrizeForGame: vi.fn(),
}));

const currentSeason = vi.mocked(getCurrentSeasonForGame);
const topTen = vi.mocked(getTopTenForGame);
const pool = vi.mocked(getPrizePoolBalanceForGame);
const seasonPrize = vi.mocked(getSeasonPrizeForGame);

describe("fetchSeasonLookup", () => {
  beforeEach(() => {
    currentSeason.mockReset();
    topTen.mockReset();
    pool.mockReset();
    seasonPrize.mockReset();
  });

  it("resolves the live current season from top-ten + pool, ranked desc", async () => {
    currentSeason.mockResolvedValueOnce(2);
    topTen.mockResolvedValueOnce([
      { player: "SPB", score: 100 },
      { player: "SPA", score: 300 },
    ]);
    pool.mockResolvedValueOnce(770000);

    const data = await fetchSeasonLookup("snake", 2);

    expect(data).toEqual({
      gameId: "snake",
      gameName: "Snake",
      emoji: "🐍",
      season: 2,
      status: "live",
      totalUstx: 770000,
      rows: [
        { player: "SPA", score: 300, rank: 1 },
        { player: "SPB", score: 100, rank: 2 },
      ],
    });
    expect(seasonPrize).not.toHaveBeenCalled();
  });

  it("resolves a closed season from the snapshot", async () => {
    currentSeason.mockResolvedValueOnce(3);
    seasonPrize.mockResolvedValueOnce({
      total: 500000,
      topTen: [{ player: "SPX", score: 42 }],
    });

    const data = await fetchSeasonLookup("snake", 1);

    expect(data).toMatchObject({
      season: 1,
      status: "closed",
      totalUstx: 500000,
      rows: [{ player: "SPX", score: 42, rank: 1 }],
    });
    expect(topTen).not.toHaveBeenCalled();
  });

  it("returns null for a future season", async () => {
    currentSeason.mockResolvedValueOnce(2);
    expect(await fetchSeasonLookup("snake", 5)).toBeNull();
  });

  it("returns null for a non-positive or non-integer season", async () => {
    expect(await fetchSeasonLookup("snake", 0)).toBeNull();
    expect(await fetchSeasonLookup("snake", 1.5)).toBeNull();
    expect(currentSeason).not.toHaveBeenCalled();
  });

  it("returns null when the live season has no minted scores", async () => {
    currentSeason.mockResolvedValueOnce(1);
    topTen.mockResolvedValueOnce([]);
    pool.mockResolvedValueOnce(0);
    expect(await fetchSeasonLookup("snake", 1)).toBeNull();
  });

  it("returns null when a closed-season snapshot is missing", async () => {
    currentSeason.mockResolvedValueOnce(3);
    seasonPrize.mockResolvedValueOnce(null);
    expect(await fetchSeasonLookup("snake", 1)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/season-lookup.test.ts`
Expected: FAIL — `fetchSeasonLookup` is not exported / module not found.

- [ ] **Step 3: Write the implementation**

Create `frontend/lib/season-lookup.ts`:

```ts
import {
  getCurrentSeasonForGame,
  getTopTenForGame,
  getPrizePoolBalanceForGame,
  getSeasonPrizeForGame,
} from "@/lib/contract-calls";
import { rankRows } from "@/lib/leaderboard-showcase";
import { GAMES, type GameId } from "@/lib/game-registry";

export type SeasonRow = { player: string; score: number; rank: number };

export type SeasonLookup = {
  gameId: GameId;
  gameName: string;
  emoji: string;
  season: number;
  status: "live" | "closed";
  totalUstx: number;
  rows: SeasonRow[];
};

// Returns null for unknown / future / empty seasons. Network errors propagate
// so server callers can return 500 and crawlers retry (matches score-lookup.ts).
export async function fetchSeasonLookup(
  gameId: GameId,
  season: number,
): Promise<SeasonLookup | null> {
  if (!Number.isInteger(season) || season < 1) return null;

  const currentSeason = await getCurrentSeasonForGame(gameId);
  if (season > currentSeason) return null;

  let status: "live" | "closed";
  let totalUstx: number;
  let topTen: Array<{ player: string; score: number }>;

  if (season === currentSeason) {
    status = "live";
    const [rows, prizePool] = await Promise.all([
      getTopTenForGame(gameId),
      getPrizePoolBalanceForGame(gameId),
    ]);
    if (rows.length === 0) return null;
    topTen = rows;
    totalUstx = prizePool;
  } else {
    status = "closed";
    const prize = await getSeasonPrizeForGame(gameId, season);
    if (!prize || prize.topTen.length === 0) return null;
    topTen = prize.topTen;
    totalUstx = prize.total;
  }

  return {
    gameId,
    gameName: GAMES[gameId].label,
    emoji: GAMES[gameId].emoji,
    season,
    status,
    totalUstx,
    rows: rankRows(topTen),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/season-lookup.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/season-lookup.ts frontend/lib/season-lookup.test.ts
git commit -m "feat(hall-of-fame): season-lookup resolves live + closed leaderboards"
```

---

### Task 2: Season share-link helpers

**Files:**
- Modify: `frontend/lib/share.ts`
- Test: `frontend/lib/share.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `frontend/lib/share.test.ts` (add the two new names to the existing import from `./share`, then add these describe blocks):

```ts
describe("seasonShareUrl", () => {
  it("links to the season share page using the game slug", () => {
    expect(seasonShareUrl("snake", 1)).toBe(
      "http://localhost:3000/share/season/snake/1",
    );
  });
});

describe("xSeasonIntentUrl", () => {
  it("builds an X intent for a season leaderboard", () => {
    const u = new URL(xSeasonIntentUrl("pacman", 2));
    expect(u.origin + u.pathname).toBe("https://x.com/intent/post");
    expect(u.searchParams.get("text")).toBe(
      "👾 Pac-Man Season 2 Hall of Fame on XP Arcade 🕹️",
    );
    expect(u.searchParams.get("url")).toBe(
      "http://localhost:3000/share/season/pacman/2",
    );
  });
});
```

Update the import line at the top of the test file to:

```ts
import {
  scoreShareUrl,
  xIntentUrl,
  shareTitle,
  shareDescription,
  resolveMintedTokenId,
  seasonShareUrl,
  xSeasonIntentUrl,
} from "./share";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/share.test.ts`
Expected: FAIL — `seasonShareUrl` / `xSeasonIntentUrl` not exported.

- [ ] **Step 3: Write the implementation**

Append to `frontend/lib/share.ts` (the file already imports `stacks`, `GAMES`, and `type GameId`):

```ts
export function seasonShareUrl(gameId: GameId, season: number): string {
  return `${stacks.appUrl}/share/season/${gameId}/${season}`;
}

export function xSeasonIntentUrl(gameId: GameId, season: number): string {
  const u = new URL("https://x.com/intent/post");
  u.searchParams.set(
    "text",
    `${GAMES[gameId].emoji} ${GAMES[gameId].label} Season ${season} Hall of Fame on XP Arcade 🕹️`,
  );
  u.searchParams.set("url", seasonShareUrl(gameId, season));
  return u.toString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/share.test.ts`
Expected: PASS (existing + 2 new tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/share.ts frontend/lib/share.test.ts
git commit -m "feat(hall-of-fame): season share-link + X-intent helpers"
```

---

### Task 3: `SeasonShareActions` component

**Files:**
- Create: `frontend/components/shared/SeasonShareActions.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/components/shared/SeasonShareActions.tsx`:

```tsx
"use client";
import { useState } from "react";
import { type GameId } from "@/lib/game-registry";
import { seasonShareUrl, xSeasonIntentUrl } from "@/lib/share";

export function SeasonShareActions({
  gameId,
  season,
}: {
  gameId: GameId;
  season: number;
}) {
  const [copied, setCopied] = useState(false);

  function handleShareOnX() {
    window.open(xSeasonIntentUrl(gameId, season), "_blank", "noopener");
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(seasonShareUrl(gameId, season));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable (permissions / insecure context) — leave label as-is
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      <button
        type="button"
        onClick={handleShareOnX}
        style={{ fontSize: 10, padding: "1px 6px" }}
      >
        Share
      </button>
      <button
        type="button"
        onClick={handleCopy}
        style={{ fontSize: 10, padding: "1px 6px" }}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/shared/SeasonShareActions.tsx
git commit -m "feat(hall-of-fame): SeasonShareActions Share/Copy control"
```

---

### Task 4: OG image route for a season

**Files:**
- Create: `frontend/app/share/season/[game]/[season]/opengraph-image.tsx`

- [ ] **Step 1: Write the route**

Create `frontend/app/share/season/[game]/[season]/opengraph-image.tsx`:

```tsx
import { ImageResponse } from "next/og";
import { fetchSeasonLookup } from "@/lib/season-lookup";
import { GAME_BG } from "@/lib/score-card";
import { GAME_IDS, type GameId } from "@/lib/game-registry";
import { shortPlayer } from "@/lib/leaderboard-showcase";
import { formatScoreValue } from "@/lib/score-format";

export const alt = "XP Arcade Hall of Fame season card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function Image({
  params,
}: {
  params: Promise<{ game: string; season: string }>;
}) {
  const { game, season } = await params;
  const gameId = (GAME_IDS as string[]).includes(game) ? (game as GameId) : null;
  const seasonNum = Number(season);
  // Like the score image route: fall back to a generic branded card rather than
  // erroring — a generic unfurl beats a broken one.
  const data =
    gameId && Number.isInteger(seasonNum) && seasonNum > 0
      ? await fetchSeasonLookup(gameId, seasonNum).catch(() => null)
      : null;

  const bg = gameId ? GAME_BG[gameId] : "#1a1a2e";
  const heading = data
    ? `${data.emoji} ${data.gameName} · Season ${data.season}`
    : "XP Arcade";
  const rows = data ? data.rows.slice(0, 5) : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: `linear-gradient(135deg, ${bg}, #101010)`,
          padding: 54,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            background: "#c0c0c0",
            border: "3px solid #ffffff",
            borderRightColor: "#404040",
            borderBottomColor: "#404040",
            padding: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#000080",
              color: "#ffffff",
              padding: "10px 20px",
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            <span>{heading}</span>
            <span style={{ fontSize: 20, fontWeight: 400 }}>
              XP Arcade on Stacks
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flexGrow: 1,
              background: "#efefef",
              border: "2px solid #808080",
              margin: "16px 8px 8px",
              padding: "14px 40px",
            }}
          >
            <span
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: "#111111",
                marginBottom: 8,
              }}
            >
              {data ? `HALL OF FAME · TOP ${rows.length}` : "Play. Mint. Climb."}
            </span>
            {rows.map((r, i) => (
              <div
                key={r.player}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 40,
                  fontWeight: 700,
                  color: "#111111",
                  padding: "4px 0",
                }}
              >
                <span>
                  {MEDALS[i] ?? `#${r.rank}`} {shortPlayer(r.player)}
                </span>
                <span>{data ? formatScoreValue(data.gameId, r.score) : ""}</span>
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "6px 12px",
              fontSize: 22,
              color: "#111111",
            }}
          >
            <span>
              {data
                ? `Prize pool: ${(data.totalUstx / 1_000_000).toFixed(4)} STX`
                : "On-chain arcade scores"}
            </span>
            <span>xp-snake.vercel.app</span>
          </div>
        </div>
      </div>
    ),
    { ...size, emoji: "twemoji" },
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (If `shortPlayer` import triggers a client-boundary error, replace its use with an inline `const short = (p: string) => \`${p.slice(0, 5)}…${p.slice(-4)}\`;` — `shortPlayer` is a pure string helper, so this is equivalent.)

- [ ] **Step 3: Commit**

```bash
git add frontend/app/share/season/[game]/[season]/opengraph-image.tsx
git commit -m "feat(hall-of-fame): server-rendered season OG card"
```

---

### Task 5: Public season share page

**Files:**
- Create: `frontend/app/share/season/[game]/[season]/page.tsx`

- [ ] **Step 1: Write the page**

Create `frontend/app/share/season/[game]/[season]/page.tsx`:

```tsx
import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchSeasonLookup, type SeasonLookup } from "@/lib/season-lookup";
import { GAME_IDS, type GameId } from "@/lib/game-registry";
import { shortPlayer } from "@/lib/leaderboard-showcase";
import { formatScoreValue } from "@/lib/score-format";

// Closed seasons are immutable; the live season refreshes within ~5 min.
export const revalidate = 300;

function parseGameId(game: string): GameId | null {
  return (GAME_IDS as string[]).includes(game) ? (game as GameId) : null;
}

function parseSeason(season: string): number | null {
  const n = Number(season);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const lookupOrNull = cache(
  async (game: string, season: string): Promise<SeasonLookup | null> => {
    const gameId = parseGameId(game);
    const seasonNum = parseSeason(season);
    if (!gameId || !seasonNum) return null;
    return fetchSeasonLookup(gameId, seasonNum);
  },
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ game: string; season: string }>;
}): Promise<Metadata> {
  const { game, season } = await params;
  const data = await lookupOrNull(game, season);
  if (!data) return { title: "XP Arcade" };
  const title = `${data.gameName} — Season ${data.season} Hall of Fame · XP Arcade`;
  const description = `Top ${data.rows.length} on-chain scores · Prize pool ${(
    data.totalUstx / 1_000_000
  ).toFixed(4)} STX · Play and climb the leaderboard.`;
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary_large_image" },
  };
}

export default async function SeasonSharePage({
  params,
}: {
  params: Promise<{ game: string; season: string }>;
}) {
  const { game, season } = await params;
  const data = await lookupOrNull(game, season);
  if (!data) notFound();

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "#008080",
      }}
    >
      <div className="window" style={{ width: "min(460px, 100%)" }}>
        <div className="title-bar">
          <div className="title-bar-text">
            {data.emoji} {data.gameName} · Season {data.season}
            {data.status === "live" ? " (live)" : ""}
          </div>
        </div>
        <div className="window-body" style={{ display: "grid", gap: 8 }}>
          <div style={{ border: "2px inset #dfdfdf", background: "#fff", padding: "10px 12px" }}>
            {data.rows.slice(0, 10).map((r) => (
              <div
                key={r.player}
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px 1fr auto",
                  gap: 8,
                  padding: "3px 0",
                  borderTop: r.rank === 1 ? "none" : "1px solid #eee",
                }}
              >
                <b>#{r.rank}</b>
                <span style={{ fontFamily: "monospace", fontSize: 12 }}>
                  {shortPlayer(r.player)}
                </span>
                <b>{formatScoreValue(data.gameId, r.score)}</b>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#555", textAlign: "center" }}>
            Prize pool: {(data.totalUstx / 1_000_000).toFixed(4)} STX
          </div>
          <Link
            href="/"
            style={{
              textAlign: "center",
              padding: "6px 10px",
              fontWeight: "bold",
              background: "#c0c0c0",
              border: "2px outset #dfdfdf",
              color: "#000",
              textDecoration: "none",
            }}
          >
            🕹️ Play XP Arcade
          </Link>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/share/season/[game]/[season]/page.tsx
git commit -m "feat(hall-of-fame): public season share page with OG meta"
```

---

### Task 6: Wire the share control into the Hall of Fame window

**Files:**
- Modify: `frontend/components/windows/HallOfFameWindow.tsx`

- [ ] **Step 1: Add the import**

After the existing imports at the top of `HallOfFameWindow.tsx`, add:

```tsx
import { SeasonShareActions } from "@/components/shared/SeasonShareActions";
```

- [ ] **Step 2: Render it in each season header**

In the `<header>` of each season `<section>`, replace this block:

```tsx
                  <span style={{ color: "#555", fontWeight: "normal" }}>
                    {formatStx(snapshot.totalUstx)}
                  </span>
```

with:

```tsx
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      color: "#555",
                      fontWeight: "normal",
                    }}
                  >
                    {formatStx(snapshot.totalUstx)}
                    <SeasonShareActions
                      gameId={snapshot.gameId}
                      season={snapshot.season}
                    />
                  </span>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/windows/HallOfFameWindow.tsx
git commit -m "feat(hall-of-fame): share button per season"
```

---

### Task 7: Part B1 — highlight the connected wallet

**Files:**
- Modify: `frontend/components/windows/HallOfFameWindow.tsx`

- [ ] **Step 1: Add the wallet import and read the address**

Add this import near the other `@/` imports:

```tsx
import { useWallet } from "@/state/wallet";
```

Inside `HallOfFameWindow`, just after the existing `const [activeGame, setActiveGame] = useState<GameId | "all">("all");`, add:

```tsx
  const address = useWallet((s) => s.address);
```

- [ ] **Step 2: Highlight the player's leaderboard rows**

In the per-season row `.map((row) => { ... })`, replace the row container's `style` background/border lines. Find:

```tsx
                            borderTop: row.rank === 1 ? "none" : "1px solid #eee",
                            background: row.rank === 1 ? "#fff8d6" : "#fff",
```

Replace with:

```tsx
                            borderTop: row.rank === 1 ? "none" : "1px solid #eee",
                            background:
                              row.player === address
                                ? "#d7e9ff"
                                : row.rank === 1
                                  ? "#fff8d6"
                                  : "#fff",
```

Then, inside that same row, immediately after the rarity `<span>` (the last child), add a YOU tag:

```tsx
                          {row.player === address && (
                            <span
                              style={{
                                gridColumn: "1 / -1",
                                fontSize: 9,
                                fontWeight: "bold",
                                color: "#003a8c",
                              }}
                            >
                              ★ YOU
                            </span>
                          )}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/windows/HallOfFameWindow.tsx
git commit -m "feat(hall-of-fame): highlight the connected wallet rows"
```

---

### Task 8: Part B2 — loading skeleton + EmptyState

**Files:**
- Modify: `frontend/components/windows/HallOfFameWindow.tsx`

- [ ] **Step 1: Import EmptyState**

Add near the other imports:

```tsx
import { EmptyState } from "@/components/shared/EmptyState";
```

- [ ] **Step 2: Replace the loading text with skeleton rows**

Find:

```tsx
        {state.status === "loading" && (
          <p style={{ color: "#555", marginBottom: 8 }}>Loading season records...</p>
        )}
```

Replace with:

```tsx
        {state.status === "loading" && (
          <div style={{ display: "grid", gap: 6, marginBottom: 8 }} aria-label="Loading season records">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  height: 18,
                  background: "#e4e4dc",
                  border: "1px solid #d0d0c8",
                }}
              />
            ))}
          </div>
        )}
```

- [ ] **Step 3: Replace the empty text with EmptyState**

Find:

```tsx
        {state.status === "ready" && snapshots.length === 0 && (
          <p style={{ color: "#777", textAlign: "center", padding: 12 }}>
            No season records are available yet.
          </p>
        )}
```

Replace with:

```tsx
        {state.status === "ready" && snapshots.length === 0 && (
          <EmptyState
            emoji="🏆"
            title="No season records yet"
            body="Play a game and mint a score to put the first name on the board."
          />
        )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/windows/HallOfFameWindow.tsx
git commit -m "feat(hall-of-fame): skeleton loading + EmptyState"
```

---

### Task 9: Part B3 — one hero per game

**Files:**
- Modify: `frontend/components/windows/HallOfFameWindow.tsx`

- [ ] **Step 1: Replace the `leaders` computation with per-game heroes**

Find the existing `leaders` block:

```tsx
  const leaders = snapshots
    .map((snapshot) => {
      const leader = rankRows(snapshot.rows)[0];
      return leader ? { snapshot, leader } : null;
    })
    .filter((entry): entry is { snapshot: SeasonSnapshot; leader: TopEntry & { rank: number } } => entry !== null);
```

Replace with (one hero per game: prefer the live season, else the latest closed season that has rows; ordered by `GAME_IDS`):

```tsx
  const heroes = useMemo(() => {
    const byGame = new Map<GameId, SeasonSnapshot>();
    for (const snap of snapshots) {
      if (snap.rows.length === 0) continue;
      const existing = byGame.get(snap.gameId);
      const better =
        !existing ||
        (snap.status === "current" && existing.status !== "current") ||
        (snap.status === existing.status && snap.season > existing.season);
      if (better) byGame.set(snap.gameId, snap);
    }
    return GAME_IDS.map((id) => byGame.get(id))
      .filter((snap): snap is SeasonSnapshot => Boolean(snap))
      .map((snap) => ({ snapshot: snap, leader: rankRows(snap.rows)[0] }));
  }, [snapshots]);
```

- [ ] **Step 2: Update the hero render**

Find:

```tsx
          {leaders.slice(0, 3).map(({ snapshot, leader }) => {
```

Replace with:

```tsx
          {heroes.map(({ snapshot, leader }) => {
```

- [ ] **Step 3: Remove the now-unused `TopEntry` import if it is no longer referenced**

Check whether `TopEntry` is still used elsewhere in the file:

Run: `grep -n "TopEntry" frontend/components/windows/HallOfFameWindow.tsx`

`SeasonSnapshot.rows` is typed `TopEntry[]`, so `TopEntry` is still imported and used — leave the import as-is. (This step is a verification, not an edit.)

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0. `useMemo` is already imported in this file.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/windows/HallOfFameWindow.tsx
git commit -m "feat(hall-of-fame): one hero card per game"
```

---

### Task 10: Full verification gate

**Files:** none (verification only).

- [ ] **Step 1: Clean stale Next dupes (known gotcha)**

Run: `find .next -name "* 2.*" -delete 2>/dev/null; echo done`

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 4: Tests**

Run: `npm test`
Expected: all pass, including the new `season-lookup` and `share` season tests.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: exit 0, "Compiled successfully", and the route list includes `/share/season/[game]/[season]`.

- [ ] **Step 6: Manual browser check (record evidence)**

Run `npm run dev`, then:
- Open the Hall of Fame window → confirm skeleton appears, then seasons render.
- Connect a wallet whose address is in a leaderboard → confirm the `★ YOU` highlight.
- Click a season's **Share** → an X intent opens with the season text; **Copy** copies `/share/season/<game>/<season>`.
- Visit `http://localhost:3000/share/season/snake/1` → the Win95 page renders the top-10 + prize pool; view source shows `og:title` / `twitter:card`.

- [ ] **Step 7: No commit needed** (verification only). If the manual check surfaces a defect, fix it under the relevant task before declaring done.

---

## Notes for the implementer

- **Score formatting:** always render scores with `formatScoreValue(gameId, score)` so Minesweeper shows `Ns`, never the raw `9999 - seconds` integer. This applies to the OG card and the page.
- **Game slug = GameId:** the `[game]` route segment is the registry key directly (`snake | tetris | pacman | breakout | minesweeper`). Note `breakout` is the slug for "XP Bricks".
- **Failure semantics:** the page returns `notFound()` for unknown/empty seasons and propagates network errors as 500; the OG image always renders (generic fallback). This mirrors the existing per-score route on purpose.
- **No contract changes.** Everything reads `xp-arcade-v4` through existing `lib/contract-calls.ts` wrappers.
