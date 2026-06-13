# Achievement Badges (Milestone) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a derived Milestone Achievement section to the Player Profile, computed client-side from existing on-chain Score NFTs.

**Architecture:** A pure `lib/achievements.ts` module (catalog + evaluation, no React/IO) feeds a presentational `AchievementsPanel` component, wired into `PlayerProfileBody` using the `stats` it already computes. No contract change, no new data source.

**Tech Stack:** TypeScript, React 19, Next.js, Vitest (jsdom, `renderToStaticMarkup` for component tests).

---

## File Structure

- `frontend/lib/achievements.ts` — **create**. Pure catalog + `evaluateAchievements` + `earnedCount`. One responsibility: turn `PlayerStats` into badge states.
- `frontend/lib/achievements.test.ts` — **create**. Unit tests for the catalog/evaluation.
- `frontend/components/player/AchievementsPanel.tsx` — **create**. Presentational grid, earned/locked styling, progress bars.
- `frontend/components/player/AchievementsPanel.test.tsx` — **create**. Render assertions.
- `frontend/components/player/PlayerProfileBody.tsx` — **modify**. One import + one JSX line after `RarityBreakdown`.

Reference (do not modify): `frontend/lib/player-stats.ts` (`PlayerStats` type), `frontend/lib/game-registry.ts` (`GAME_IDS`), `frontend/lib/holdings.ts` (`ScoreNft` type).

---

## Task 1: Pure achievements module (catalog + evaluation)

**Files:**
- Create: `frontend/lib/achievements.ts`
- Test: `frontend/lib/achievements.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/achievements.test.ts`:

```tsx
import { describe, it, expect } from "vitest";
import { computePlayerStats } from "@/lib/player-stats";
import { GAME_IDS } from "@/lib/game-registry";
import type { ScoreNft } from "@/lib/holdings";
import {
  evaluateAchievements,
  earnedCount,
  ACHIEVEMENTS,
} from "@/lib/achievements";

function nft(over: Partial<ScoreNft> = {}): ScoreNft {
  return { id: 1, gameId: "snake", image: "", name: "Snake", season: 1, ...over };
}

// n NFTs, all snake/season 1, unique ids → totalMints === n
function mints(n: number, over: Partial<ScoreNft> = {}): ScoreNft[] {
  return Array.from({ length: n }, (_, i) => nft({ id: i + 1, ...over }));
}

function evalFor(nfts: ScoreNft[]) {
  return evaluateAchievements(computePlayerStats(nfts));
}

function badge(nfts: ScoreNft[], id: string) {
  const b = evalFor(nfts).find((a) => a.id === id);
  if (!b) throw new Error(`no badge ${id}`);
  return b;
}

describe("evaluateAchievements", () => {
  it("empty player: nothing earned, every current 0", () => {
    const list = evalFor([]);
    expect(earnedCount(list)).toBe(0);
    expect(list.every((a) => a.current === 0)).toBe(true);
    expect(list.length).toBe(ACHIEVEMENTS.length);
  });

  it("first-mint flips at 1 mint", () => {
    expect(badge([], "first-mint").earned).toBe(false);
    expect(badge(mints(1), "first-mint").earned).toBe(true);
  });

  it("count milestones flip at their boundaries", () => {
    expect(badge(mints(9), "getting-started").earned).toBe(false);
    expect(badge(mints(10), "getting-started").earned).toBe(true);
    expect(badge(mints(49), "dedicated").earned).toBe(false);
    expect(badge(mints(50), "dedicated").earned).toBe(true);
    expect(badge(mints(99), "centurion").earned).toBe(false);
    expect(badge(mints(100), "centurion").earned).toBe(true);
  });

  it("current is capped at target", () => {
    const b = badge(mints(150), "centurion");
    expect(b.earned).toBe(true);
    expect(b.current).toBe(100);
  });

  it("arcade-complete needs a mint in every game", () => {
    const all = GAME_IDS.map((g, i) => nft({ id: i + 1, gameId: g }));
    const missingOne = GAME_IDS.slice(0, -1).map((g, i) =>
      nft({ id: i + 1, gameId: g }),
    );
    expect(badge(all, "arcade-complete").earned).toBe(true);
    const locked = badge(missingOne, "arcade-complete");
    expect(locked.earned).toBe(false);
    expect(locked.current).toBe(GAME_IDS.length - 1);
  });

  it("season milestones flip at their boundaries", () => {
    const seasons = (n: number) =>
      Array.from({ length: n }, (_, i) => nft({ id: i + 1, season: i + 1 }));
    expect(badge(seasons(2), "seasoned").earned).toBe(false);
    expect(badge(seasons(3), "seasoned").earned).toBe(true);
    expect(badge(seasons(4), "veteran").earned).toBe(false);
    expect(badge(seasons(5), "veteran").earned).toBe(true);
  });

  it("earnedCount counts earned badges", () => {
    // 1 mint in one game → only first-mint earned
    expect(earnedCount(evalFor(mints(1)))).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/achievements.test.ts`
Expected: FAIL — cannot resolve module `@/lib/achievements`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/lib/achievements.ts`:

```ts
import { GAME_IDS } from "./game-registry";
import type { PlayerStats } from "./player-stats";

export type Achievement = {
  id: string;
  label: string;
  icon: string;
  description: string;
  target: number;
  progress: (s: PlayerStats) => number; // raw, uncapped current value
};

export type EvaluatedAchievement = Achievement & {
  earned: boolean;
  current: number; // min(progress, target) — capped for display
};

const gamesMinted = (s: PlayerStats): number =>
  GAME_IDS.reduce((n, id) => n + (s.byGame[id].totalMints > 0 ? 1 : 0), 0);

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first-mint",
    label: "First Mint",
    icon: "🥚",
    description: "Mint your first score NFT",
    target: 1,
    progress: (s) => s.totalMints,
  },
  {
    id: "getting-started",
    label: "Getting Started",
    icon: "🎮",
    description: "Mint 10 score NFTs",
    target: 10,
    progress: (s) => s.totalMints,
  },
  {
    id: "dedicated",
    label: "Dedicated",
    icon: "🏅",
    description: "Mint 50 score NFTs",
    target: 50,
    progress: (s) => s.totalMints,
  },
  {
    id: "centurion",
    label: "Centurion",
    icon: "💯",
    description: "Mint 100 score NFTs",
    target: 100,
    progress: (s) => s.totalMints,
  },
  {
    id: "arcade-complete",
    label: "Arcade Complete",
    icon: "🕹️",
    description: "Mint a score in every game",
    target: GAME_IDS.length,
    progress: gamesMinted,
  },
  {
    id: "seasoned",
    label: "Seasoned",
    icon: "📅",
    description: "Play across 3 seasons",
    target: 3,
    progress: (s) => s.seasonsPlayed,
  },
  {
    id: "veteran",
    label: "Veteran",
    icon: "👑",
    description: "Play across 5 seasons",
    target: 5,
    progress: (s) => s.seasonsPlayed,
  },
];

export function evaluateAchievements(s: PlayerStats): EvaluatedAchievement[] {
  return ACHIEVEMENTS.map((a) => {
    const raw = a.progress(s);
    return { ...a, earned: raw >= a.target, current: Math.min(raw, a.target) };
  });
}

export function earnedCount(list: EvaluatedAchievement[]): number {
  return list.filter((a) => a.earned).length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/achievements.test.ts`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/achievements.ts frontend/lib/achievements.test.ts
git commit -m "feat(achievements): pure milestone catalog + evaluation"
```

---

## Task 2: AchievementsPanel component

**Files:**
- Create: `frontend/components/player/AchievementsPanel.tsx`
- Test: `frontend/components/player/AchievementsPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/components/player/AchievementsPanel.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AchievementsPanel } from "./AchievementsPanel";
import { computePlayerStats } from "@/lib/player-stats";
import { ACHIEVEMENTS } from "@/lib/achievements";
import type { ScoreNft } from "@/lib/holdings";

function nft(over: Partial<ScoreNft> = {}): ScoreNft {
  return { id: 1, gameId: "snake", image: "", name: "Snake", season: 1, ...over };
}

describe("AchievementsPanel", () => {
  it("shows earned/total in the header", () => {
    const stats = computePlayerStats([nft()]); // first-mint earned → 1/7
    const html = renderToStaticMarkup(<AchievementsPanel stats={stats} />);
    expect(html).toContain(`Achievements (1/${ACHIEVEMENTS.length})`);
  });

  it("marks one earned and the rest locked", () => {
    const stats = computePlayerStats([nft()]);
    const html = renderToStaticMarkup(<AchievementsPanel stats={stats} />);
    const earned = html.match(/data-earned="true"/g) ?? [];
    const locked = html.match(/data-earned="false"/g) ?? [];
    expect(earned.length).toBe(1);
    expect(locked.length).toBe(ACHIEVEMENTS.length - 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run components/player/AchievementsPanel.test.tsx`
Expected: FAIL — cannot resolve `./AchievementsPanel`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/components/player/AchievementsPanel.tsx`:

```tsx
"use client";

import type { PlayerStats } from "@/lib/player-stats";
import { evaluateAchievements, earnedCount } from "@/lib/achievements";

export function AchievementsPanel({ stats }: { stats: PlayerStats }) {
  const list = evaluateAchievements(stats);
  const earned = earnedCount(list);

  return (
    <section className="mb-3">
      <div className="text-[10px] uppercase text-gray-500 mb-1">
        Achievements ({earned}/{list.length})
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {list.map((a) => (
          <div
            key={a.id}
            data-earned={a.earned}
            title={
              a.earned
                ? a.description
                : `${a.description} — Progress: ${a.current}/${a.target}`
            }
            className="text-center text-[10px] p-1"
            style={{
              border: a.earned ? "2px solid #000080" : "1px solid #c0c0c0",
              background: a.earned ? "#eef3ff" : "#f5f5f0",
            }}
          >
            <div
              style={{
                fontSize: 20,
                lineHeight: "24px",
                filter: a.earned ? "none" : "grayscale(1)",
                opacity: a.earned ? 1 : 0.5,
              }}
            >
              {a.icon}
            </div>
            <div
              className="truncate"
              style={{ fontWeight: a.earned ? "bold" : "normal" }}
            >
              {a.label}
            </div>
            {a.earned ? (
              <div style={{ color: "#007700" }}>✓</div>
            ) : (
              <>
                <div style={{ color: "#777" }}>
                  {a.current}/{a.target}
                </div>
                <div
                  aria-hidden
                  style={{ height: 3, background: "#c0c0c0", marginTop: 2 }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(a.current / a.target) * 100}%`,
                      background: "#000080",
                    }}
                  />
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run components/player/AchievementsPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/player/AchievementsPanel.tsx frontend/components/player/AchievementsPanel.test.tsx
git commit -m "feat(achievements): AchievementsPanel component"
```

---

## Task 3: Wire the panel into the Player Profile

**Files:**
- Modify: `frontend/components/player/PlayerProfileBody.tsx`

- [ ] **Step 1: Add the import**

In `frontend/components/player/PlayerProfileBody.tsx`, find:

```tsx
import { RarityBreakdown } from "./RarityBreakdown";
```

Add immediately below it:

```tsx
import { AchievementsPanel } from "./AchievementsPanel";
```

- [ ] **Step 2: Render the panel after RarityBreakdown**

Find this block:

```tsx
          <RarityBreakdown counts={(filteredStats ?? stats).rarityCounts} />
          {featuredNfts && featuredNfts.length > 0 && filter === "all" && (
```

Insert the panel between the two lines so it reads:

```tsx
          <RarityBreakdown counts={(filteredStats ?? stats).rarityCounts} />
          <AchievementsPanel stats={stats} />
          {featuredNfts && featuredNfts.length > 0 && filter === "all" && (
```

(Use global `stats`, not `filteredStats` — badges reflect total career, independent of the game filter.)

- [ ] **Step 3: Verify typecheck passes**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean (no output, exit 0).

- [ ] **Step 4: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/player/PlayerProfileBody.tsx
git commit -m "feat(profile): surface achievements in PlayerProfileWindow"
```

---

## Task 4: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean, exit 0.

- [ ] **Step 2: Full test suite**

Run: `cd frontend && npm test`
Expected: all tests pass, including the two new files. Read the output — confirm the new `achievements` and `AchievementsPanel` tests appear and pass.

- [ ] **Step 3: Lint**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit (only if Steps 1-3 produced fixes)**

If any step required a fix, commit it:

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add -A
git commit -m "chore(achievements): typecheck + lint + full test pass"
```

If nothing changed, skip the commit. Do not claim done until all three commands above are green — paste their real output.

---

## Self-Review notes (for the implementer)

- **Spec coverage:** Task 1 = catalog §2 + module §3.1 + tests §5.1. Task 2 = component §3.2 + UI §4 + tests §5.2. Task 3 = wiring §3.3. Task 4 = verify §5.3.
- **Type consistency:** `Achievement` / `EvaluatedAchievement` / `evaluateAchievements` / `earnedCount` / `ACHIEVEMENTS` names are identical across module, tests, and component.
- **No on-chain change:** nothing here touches `contract/` or any `.clar` file.
