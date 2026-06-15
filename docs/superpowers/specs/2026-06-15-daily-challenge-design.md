# Daily Challenge — Design Spec

**Date:** 2026-06-15
**Status:** Approved (brainstorm), pending implementation plan
**Contract impact:** None. Pure frontend, client-side, localStorage-persisted.

## 1. Goal

Deepen engagement across the existing five XP Arcade games (Snake, Tetris,
Pac-Man, Breakout, Minesweeper) by adding a **Daily Challenge**: each day the app
spotlights one game with a fixed target. Beating the target marks the day
complete and advances a streak. Missing a day resets the streak to 0. This drives
players back daily and rotates them through all five games, instead of adding a
sixth game that would split the player base and require a new on-chain pool.

## 2. Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Core mechanic | Game spotlight + target; rotates the 5 games |
| Target source | Fixed-by-date, identical for everyone (deterministic) |
| Streak rule | Strict — miss a day resets to 0; persist best-streak |
| Reward | Streak counter + milestone badges integrated into the existing achievements panel |
| UI placement | Always-visible desktop widget, near `PrizePoolHero` |
| Completion condition | Reach the target in a normal play session — no wallet, no mint |
| Backend / contract | None — client-side only, mirrors `achievements` / `xp-level` patterns |

## 3. Architecture

Mirrors the established client-side pattern in this repo:
pure logic in `lib/`, a thin Zustand store for persisted state, a presentational
widget, and a single hook point into the shared game-over flow.

| Unit | File | Responsibility | Depends on |
|---|---|---|---|
| Daily logic (pure) | `frontend/lib/daily-challenge.ts` | Deterministic day→game selection, target table, streak math, day-key | `game-registry`, `score-format` |
| Persisted store | `frontend/state/daily-challenge.ts` | Hold + persist streak state to localStorage; expose `completeToday`, derived view | `lib/daily-challenge` |
| Completion hook | `frontend/hooks/useGameSession.ts` (modify) | On game over, record completion if today's game + target met | store |
| Widget | `frontend/components/desktop/DailyChallengeWidget.tsx` | Render today's challenge, status, streak, Play button | store, `window-manager`, `game-registry`, `score-format` |
| Desktop mount | `frontend/components/desktop/Desktop.tsx` (modify) | Render widget near `PrizePoolHero` | widget |
| Achievements integration | `frontend/lib/achievements.ts` (modify) | Add 3 streak-milestone badges fed by `bestStreak` | — |

**No contract change.** No new public functions, no on-chain reads required for
the challenge itself.

## 4. Daily selection (deterministic)

`lib/daily-challenge.ts`:

- `todayKey(now = new Date()): string` → `YYYY-MM-DD` using **local** date
  components (not UTC). Rationale: a player's "day" follows their own midnight,
  which is friendlier for streaks (matches Wordle behavior). The tradeoff —
  players in different timezones may see different challenges at the same UTC
  instant — is acceptable and intentional for a casual feature.
- `dailyGame(dayKey: string): GameId` → hash the day string to a stable integer
  and index into `GAME_IDS`. Deterministic: same day → same game for everyone.
  Hash must be a small, dependency-free string hash (e.g. a folding sum / DJB2),
  not `Math.random`.
- `DAILY_TARGETS: Record<GameId, number>` → raw on-chain score targets:

  | Game | Target (raw score) | Player-facing meaning |
  |---|---|---|
  | snake | 150 | 150 points |
  | tetris | 180 | 180 points |
  | pacman | 180 | 180 points |
  | breakout | 200 | 200 points |
  | minesweeper | 9819 | Clear Intermediate in ≤180s (`9999 − 180`) |

  These are starting calibrations, tuned against `score-risk` `practicalHigh`
  values (well below "unusual", above casual). They live in one constants table
  so they are trivial to retune later. Minesweeper's value matches the rarity
  threshold already registered on-chain (`u9819`).

- `dailyChallenge(dayKey: string): { gameId: GameId; target: number }` →
  convenience combiner.
- Target display always goes through the existing `formatScore` /
  `formatScoreValue` so Minesweeper renders as a time ("Clear in 180s"), others
  as plain points. **Leaderboard semantics are unchanged**; the target is just a
  raw-score comparison.

## 5. Streak math (pure)

State shape persisted by the store:

```ts
type DailyChallengeState = {
  lastCompletedDate: string | null; // YYYY-MM-DD of last completed day
  currentStreak: number;
  bestStreak: number;
};
```

Pure helpers in `lib/daily-challenge.ts`:

- `isYesterday(prev: string, today: string): boolean` — calendar-day adjacency
  via parsing the date keys (one-day difference), not raw string compare.
- `applyCompletion(state, today): DailyChallengeState` — idempotent for the same
  day:
  - If `lastCompletedDate === today` → unchanged (already completed today).
  - Else if `lastCompletedDate === yesterday(today)` → `currentStreak + 1`.
  - Else (gap or first-ever) → `currentStreak = 1`.
  - `bestStreak = max(bestStreak, currentStreak)`; `lastCompletedDate = today`.
- `viewStreak(state, today): { currentStreak; bestStreak; completedToday }` —
  **lazy decay** on read: if `lastCompletedDate` is neither today nor yesterday,
  the displayed `currentStreak` is `0` (the streak is broken). `bestStreak` is
  always the stored max. `completedToday = lastCompletedDate === today`. No timer
  or cron needed — decay is computed whenever the widget renders.

## 6. Completion detection

Hook into the shared `useGameSession.handleGameOver(score)` (used by every game
window). After recording the session result:

- Compute `dayKey = todayKey()` and `{ gameId: todaysGame, target } = dailyChallenge(dayKey)`.
- If `gameId === todaysGame` (the game that just ended is today's spotlight) AND
  `score >= target` AND not already completed today → call the store's
  `completeToday()`.
- No wallet, no mint, no network. Completion is purely "you hit the bar in a
  session today".
- Minesweeper consistency: `handleGameOver` only fires there on a ranked
  (Intermediate) win, so a target of `9819` naturally requires an Intermediate
  clear under 180s — losses and practice wins never reach this path.

`completeToday()` in the store applies `applyCompletion` and persists.

## 7. Achievements integration

`lib/achievements.ts` currently evaluates from `PlayerStats` (on-chain derived).
Streak data is local, so extend the evaluator input rather than polluting
`PlayerStats`:

- Change signature to `evaluateAchievements(stats: PlayerStats, extra?: { bestStreak?: number })`.
- Add 3 milestone achievements that read `extra?.bestStreak ?? 0`:

  | id | label | icon | target |
  |---|---|---|---|
  | `streak-7` | Week Warrior | 🔥 | 7 |
  | `streak-30` | Monthly Master | 📆 | 30 |
  | `streak-100` | Century Streak | 💎 | 100 |

- The achievement `progress` function signature stays `(s) => number` for
  existing entries; streak entries need access to `extra`. Implementation detail
  for the plan: either widen `progress` to `(s, extra) => number` (update all
  call sites) or special-case the three streak ids inside `evaluateAchievements`.
  Plan picks the cleaner of the two; both keep existing badges unchanged.
- Callers of `evaluateAchievements` pass `bestStreak` from the daily store where
  available; omitting it leaves streak badges at 0 progress (safe default).

## 8. UI — DailyChallengeWidget

- Lives on the desktop near `PrizePoolHero` (mounted in `Desktop.tsx`).
- 98.css styling, consistent with existing desktop panels.
- Contents:
  - Today's game: emoji + label (from `GAMES[todaysGame]`).
  - Target, formatted via `formatScore(todaysGame, target)`.
  - Status: ⬜ not done / ✅ completed today.
  - 🔥 current streak + best streak.
  - **Play** button → `useWindows().open(\`game-${todaysGame}\`)`.
- SSR-safe: before storage hydrates, default to "not completed" / streak as
  stored. Follow the `lib/welcome.ts` SSR-default convention (no auto-state that
  can't be persisted).

## 9. Testing

- `lib/daily-challenge.test.ts`:
  - `todayKey` formats local date as `YYYY-MM-DD`.
  - `dailyGame` is deterministic and distributes across all `GAME_IDS` over a
    range of day keys; same key → same game.
  - `DAILY_TARGETS` has an entry for every `GameId` (no missing game).
  - Streak: first completion → 1; consecutive day → +1; gap → reset to 1;
    same-day repeat → unchanged; `bestStreak` tracks the max; `viewStreak` lazy
    decays a stale streak to 0 while preserving best.
- `lib/achievements.test.ts`: the 3 streak badges earn at 7/30/100 `bestStreak`
  and stay unearned below; existing badges unaffected when `extra` omitted.
- `DailyChallengeWidget` test: renders today's game + target, shows not-done vs
  completed state, shows streak (pattern from `PrizePoolHero.test.tsx`).
- Full gate (per CLAUDE.md): `npx tsc --noEmit`, `npm run lint`, `npm test`,
  `npm run build` all green before done.

## 10. Out of scope (YAGNI)

- No daily leaderboard / shared-seed boards (explicitly rejected — would need a
  backend or on-chain writes).
- No streak freeze / grace day (strict reset chosen).
- No on-chain reward, no mint requirement for completion.
- No timezone normalization beyond local date keys.
- No push/notification reminders.

## 11. Files

Create:
- `frontend/lib/daily-challenge.ts`
- `frontend/lib/daily-challenge.test.ts`
- `frontend/state/daily-challenge.ts`
- `frontend/components/desktop/DailyChallengeWidget.tsx`
- `frontend/components/desktop/DailyChallengeWidget.test.tsx`

Modify:
- `frontend/hooks/useGameSession.ts` (completion hook)
- `frontend/lib/achievements.ts` (+ test) — streak milestone badges
- `frontend/components/desktop/Desktop.tsx` (mount widget)
- `HANDOFF.md` (note the new feature)
