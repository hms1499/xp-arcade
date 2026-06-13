# Prize Pool Hero — Design Spec

**Date:** 2026-06-13
**Status:** Approved (brainstorming) — ready for implementation plan
**Author:** brainstorming session

## 1. Goal

Make the season prize pool the visual hero of the desktop so a first-time visitor
immediately registers "there is real STX to win, and a deadline." Today the pool is
buried as small green text inside the per-game "Season Race" table; new users miss
it. This surfaces the **total STX across all games** as a large headline paired with
the season countdown for urgency.

Cosmetic, client-only. Reuses existing data (`poolsByGame`, `useSeasonCountdown`).
No contract / `.clar` change, no new dependency.

## 2. Scope (decisions locked in brainstorming)

- **Hero metric:** the **total** prize pool — sum of every game's current-season pool
  (uStx), shown in STX. Subtitle "up for grabs across N games".
- **Placement:** a new hero panel at the **top** of the desktop showcase stack (above
  "Hall of Fame") — the first thing the eye lands on.
- **Countdown:** the season countdown moves **into** the hero panel. The duplicate
  countdown box currently inside the "Season Race" panel is **removed** (no
  duplication). "Season Race" keeps its per-game season / pool / cutoff table.
- **Urgency:** the countdown renders red + bold when urgent (deadline reached, ISO
  expired, or less than 24h remaining); navy otherwise.
- **Out of scope (YAGNI):** changing how pools/countdown are fetched, per-game hero
  variants, animation/pulse effects, any contract change, touching the High Scores
  window itself.

## 3. Architecture

Two pure helpers (testable) + one new presentational component, wired into the
existing `DesktopLeaderboardShowcase`. The showcase already owns the
`useSeasonCountdown("snake")` call and receives `poolsByGame` as a prop.

| File | Status | Responsibility |
|------|--------|----------------|
| `frontend/lib/leaderboard-showcase.ts` | modify | Add pure `sumPrizePoolUstx(pools)`. |
| `frontend/lib/leaderboard-showcase.test.ts` | modify | Tests for `sumPrizePoolUstx`. |
| `frontend/lib/season-countdown.ts` | modify | Add pure `isCountdownUrgent(c)`. |
| `frontend/lib/season-countdown.test.ts` | modify | Tests for `isCountdownUrgent`. |
| `frontend/components/desktop/PrizePoolHero.tsx` | create | Presentational hero panel. |
| `frontend/components/desktop/PrizePoolHero.test.tsx` | create | Render tests. |
| `frontend/components/desktop/DesktopLeaderboardShowcase.tsx` | modify | Render hero at top; remove the countdown box from "Season Race"; pass props. |

### 3.1 `sumPrizePoolUstx` (leaderboard-showcase.ts)

```ts
import type { GameId } from "./game-registry";

/**
 * Total prize pool across all games, in uStx. Ignores games whose pool is still
 * unknown (null). Returns null only when every game's pool is unknown (loading).
 */
export function sumPrizePoolUstx(
  pools: Record<GameId, number | null>,
): number | null {
  const vals = Object.values(pools).filter((v): v is number => v !== null);
  return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0);
}
```

### 3.2 `isCountdownUrgent` (season-countdown.ts)

```ts
/** True when the season deadline warrants a red, attention-grabbing treatment. */
export function isCountdownUrgent(c: Countdown): boolean {
  return (
    c.state === "reached" ||
    c.state === "iso-expired" ||
    (c.state === "live" && c.days === 0)
  );
}
```

`loading` and `unset` are not urgent (return false).

### 3.3 `PrizePoolHero` component

Presentational only — no hooks, no data fetching. Props:

```ts
{
  totalUstx: number | null;   // from sumPrizePoolUstx
  gameCount: number;          // GAME_IDS.length
  countdown: Countdown;       // from useSeasonCountdown
}
```

Behavior:
- Uses the existing `panelStyle()` + `PanelTitle` look from
  `DesktopLeaderboardShowcase` for Win95 consistency. (These are currently
  module-private in the showcase file; the hero may define its own equivalent inline
  to stay self-contained — do not export/restructure the showcase's helpers unless
  trivial. Keeping the panel chrome inline in `PrizePoolHero` is acceptable and
  preferred for isolation.)
- Headline: total in STX = `(totalUstx / 1_000_000).toFixed(2)` + " STX", large
  (~26px), bold, `#000080`. When `totalUstx === null`, show "Loading…" instead.
- Subtitle: `up for grabs across ${gameCount} games`.
- Countdown line: `formatCountdown(countdown)` prefixed with ⏳. Color/weight:
  red (`#cc0000`) + bold when `isCountdownUrgent(countdown)`, else navy (`#000080`).
  When countdown is `loading`/`unset` (formatCountdown returns ""), render nothing
  for the countdown line.
- The whole panel is a button (or has a clickable surface) that calls
  `open("highscore")`; include `onMouseDown={(e) => e.stopPropagation()}` like the
  other showcase buttons so the desktop's first-interaction handler/drag does not
  swallow the click.

### 3.4 Wiring in `DesktopLeaderboardShowcase`

- Import `PrizePoolHero`, `sumPrizePoolUstx`, `isCountdownUrgent` is used inside the
  hero (not here).
- Render `<PrizePoolHero totalUstx={sumPrizePoolUstx(poolsByGame)} gameCount={GAME_IDS.length} countdown={countdown} />`
  as the **first** child of the showcase column (above the "Hall of Fame" section).
- **Remove** the countdown `<div>` block currently at the top of the "Season Race"
  panel body (the one rendering "Loading deadline…" / "Soft deadline …"). Leave the
  per-game table (season / pool / cutoff rows) intact.
- The existing `const countdown = useSeasonCountdown("snake");` call stays; it now
  feeds the hero instead of the Season Race box.

## 4. UI / Layout

```
+=========================================+
| 💰 PRIZE POOL  (this season)            |
|                                         |
|            12.45 STX                     |
|     up for grabs across 5 games          |
|     ⏳ ends in 6d 04h 12m                |
+=========================================+
```

Win95 panel chrome (raised border, navy gradient title bar) matching the other
showcase panels; ~300px wide to align with the stack.

## 5. Testing (TDD)

- `frontend/lib/leaderboard-showcase.test.ts` — `sumPrizePoolUstx`: sums non-null
  pools; ignores nulls; returns null when all null.
- `frontend/lib/season-countdown.test.ts` — `isCountdownUrgent`: `live` with days>0 →
  false; `live` with days===0 → true; `reached` → true; `iso-expired` → true;
  `loading` and `unset` → false.
- `frontend/components/desktop/PrizePoolHero.test.tsx` — `renderToStaticMarkup`:
  renders the STX total and subtitle; shows "Loading…" when `totalUstx` is null;
  renders the countdown text; applies the urgent color when the countdown is urgent
  (e.g. assert the markup contains the red color for a `days===0` live countdown and
  not for a multi-day one).

Verification pass after wiring: `npx tsc --noEmit`, `npm test` (all green, new file
present), `npm run lint`.

## 6. Non-goals / constraints

- No contract change; no `.clar` edits; no new public contract functions.
- No new npm dependency, no new asset.
- Do not change pool/countdown fetching or the High Scores window.
- Keep `PrizePoolHero` presentational (no hooks/fetching) so it is render-testable
  like `WelcomeDialog` / `LevelBadge`.
- Follow the existing showcase Win95 panel styling; do not restructure the showcase's
  private helpers beyond what the wiring needs.
