# Retention Nudge — Design Spec

**Date:** 2026-06-23
**Status:** Approved design, pending implementation plan
**Scope:** Frontend only. No contract change. No backend. No new infrastructure.

This is sub-project **#1 of 3** in a retention/social/economic roadmap. It is
the lowest-risk piece and ships independently. Social (#2, challenge-a-friend
deep link) and Economic (#3, contract) get their own spec → plan cycles later.

## 1. Problem & Goal

XP Arcade already has a **fully built daily-challenge streak system**
(`lib/daily-challenge.ts`: `currentStreak`, `bestStreak`, `completedToday`,
DST-correct day math, localStorage persistence, `DailyChallengeWidget` UI). What
it lacks is a **re-engagement layer** — a reason to come back *today* surfaced at
the moment the player opens the app.

**Goal:** a single, theme-native, loss-aversion nudge shown on app load that
pulls the player back into a game, using only signals already available
client-side. No accounts, no backend, no push permissions.

**Non-goal (explicitly out of scope, YAGNI):** real web push / service worker,
any backend, server-side rank storage, showing more than one balloon at once.
Real web push may become a separate spec later if in-app nudges prove valuable.

## 2. Architecture Overview

Three new units + one extraction, all in `frontend/`:

| Unit | Type | Responsibility |
|------|------|----------------|
| `lib/retention-nudge.ts` | pure logic | `selectNudge(signals, now) → Nudge \| null` — pick the highest-priority eligible nudge; enforce once-per-day-per-kind dedup |
| `lib/last-seen-ranks.ts` | pure + persistence | load/save the player's previously-seen live ranks (localStorage); detect rank drops |
| `components/desktop/RetentionBalloon.tsx` | React | read the signal stores, call `selectNudge`, render a `TrayBalloon`, wire the CTA |
| `components/desktop/TrayBalloon.tsx` | React (extracted) | reusable Win95 system-tray balloon shell (yellow bubble + close + triangle tail), shared by `WalletBalloon` and `RetentionBalloon` |

`RetentionBalloon` mounts inside `SystemTray.tsx`, next to the existing
`<WalletBalloon />`.

### Why these boundaries

- The decision logic (`selectNudge`) is a **pure function** of explicit
  `signals`, so every priority rule and edge case is unit-testable without React
  or a DOM. The component only does I/O: read stores → call the function →
  render → handle the click.
- `last-seen-ranks` isolates the only stateful/persistence concern (snapshotting
  ranks across visits) behind load/save functions, mirroring the existing
  `lib/daily-challenge.ts` load/save pattern.
- `TrayBalloon` removes the duplicated bubble/tail markup that would otherwise be
  copy-pasted from `WalletBalloon`. This is a targeted improvement to code we are
  already touching — not unrelated refactoring.

## 3. Nudge Engine — `lib/retention-nudge.ts`

### Types

```ts
export type NudgeKind = "rank-drop" | "season-closing" | "streak-risk";

export type NudgeTarget =
  | { window: "high-scores"; gameId: GameId }   // open High Scores for a game
  | { window: "game"; gameId: GameId };          // launch a game

export type Nudge = {
  kind: NudgeKind;
  icon: string;          // emoji, matching WalletBalloon's visual language
  title: string;         // bold first line
  body: string;          // one short sentence
  cta: { label: string; target: NudgeTarget };
};

export type NudgeSignals = {
  address: string | null;
  streak: StreakView;                       // from viewStreak(dailyState, today)
  dailyGame: GameId;                         // dailyGame(today)
  completedDailyToday: boolean;              // streak.completedToday
  ranks: LiveRanks;                          // current playerLiveRanks
  lastSeenRanks: LiveRanks | null;           // null on first-ever visit
  countdowns: Record<GameId, Countdown>;     // deriveCountdown per game
  hasSeasonScore: Record<GameId, boolean>;   // player holds a score this season
  shownToday: Partial<Record<NudgeKind, boolean>>; // dedup: kind already shown today
};
```

`StreakView`, `LiveRanks`, `Countdown`, `GameId` are imported from existing
modules (`daily-challenge`, `player-ranks`, `season-countdown`, `game-registry`).

### `selectNudge(signals, now): Nudge | null`

Evaluate candidates in **priority order** and return the first eligible one whose
`kind` has **not** already been shown today (`shownToday[kind]` falsy). Return
`null` if none qualify.

**Priority 1 — `rank-drop`** (strongest: loss of a held position)
- Requires `address != null` **and** `lastSeenRanks != null`.
- Eligible when there exists a game where `lastSeenRanks[g]` was a held top-10
  position (`1..10`) and `ranks[g]` is worse — i.e. `ranks[g] === null` (fell
  off the board) or `ranks[g] > lastSeenRanks[g]` (dropped places).
- If multiple games dropped, pick the one with the **best** previously-held rank
  (most painful loss). CTA → `{ window: "high-scores", gameId }`.

**Priority 2 — `season-closing`** (urgent deadline on a season the player is in)
- Eligible when there exists a game where `isCountdownUrgent(countdowns[g])` is
  true **and** `hasSeasonScore[g]` is true.
- If multiple, pick the game with the **soonest** end (smallest remaining).
  CTA → `{ window: "high-scores", gameId }`.

**Priority 3 — `streak-risk`** (alive streak not yet kept today)
- Eligible when `streak.currentStreak > 0` and `completedDailyToday === false`.
- CTA → `{ window: "game", gameId: dailyGame }` (today's spotlighted game).

Copy (kept short, Win95 balloon voice):
- rank-drop: `⚠️` · "You've been bumped" · "Someone passed your {Game} score — reclaim your spot."
- season-closing: `⏳` · "Season ending soon" · "{Game} season closes {countdown}. Lock in your rank."
- streak-risk: `🔥` · "Keep your streak" · "{n}-day streak — play today's {Game} challenge to keep it."

`now` is passed for any time-relative copy; it is **not** used for dedup (dedup
is keyed by `todayKey()`, computed by the caller and passed via `shownToday`).

### Dedup persistence

Reuse the daily-challenge persistence idiom. Store, in localStorage under
`xp-arcade:nudge`, a map `{ [kind]: lastShownDate }`. A kind is `shownToday` when
its stored date equals `todayKey(now)`. The component:
1. builds `shownToday` from the stored map,
2. calls `selectNudge`,
3. on **render** of a nudge, writes `todayKey()` for that kind.

Helper functions `loadNudgeShown()` / `markNudgeShown(kind, day)` live in
`retention-nudge.ts` and follow `loadDailyState`/`saveDailyState` exactly
(SSR-guarded, try/catch, no-op on blocked storage).

## 4. Rank Snapshot — `lib/last-seen-ranks.ts`

```ts
export const LAST_SEEN_RANKS_KEY = "xp-arcade:last-ranks";
export function loadLastSeenRanks(address: string): LiveRanks | null;
export function saveLastSeenRanks(address: string, ranks: LiveRanks): void;
```

- Snapshot is **per address** (keyed inside the stored JSON by address), so a
  wallet switch does not produce a false rank-drop. On read, a mismatched/absent
  address returns `null`.
- The component updates the snapshot **only after** `selectNudge` has consumed
  the previous snapshot for this load, and **only** when `ranks` is fully
  resolved (no game still `loading`/`undefined`), so a partial read never
  overwrites a good snapshot or fabricates a drop.
- First-ever visit / new address → `null` → no `rank-drop` nudge (correct).

## 5. Surface — `TrayBalloon` + `RetentionBalloon`

### `TrayBalloon.tsx` (extracted from `WalletBalloon`)

Presentational only. Props: `icon`, `title`, `body`, `ctaLabel`, `onCta`,
`onDismiss`, `ariaLabel`. Renders the existing yellow `#ffffe1` bubble at
`fixed; bottom: 36; right: 8`, the close `✕`, and the double-triangle tail —
identical markup/styles currently inline in `WalletBalloon`. `WalletBalloon` is
refactored to render `<TrayBalloon … />` (behavior unchanged; its 3s show / 8s
auto-hide / sessionStorage dismiss logic stays in `WalletBalloon`).

### `RetentionBalloon.tsx`

- Reads stores: `useWallet` (address), `useDailyChallenge`, `usePlayerRanks` /
  `playerLiveRanks` source, season countdowns, season-score presence.
- On mount (after a short delay consistent with `WalletBalloon`'s 3s, and after
  ranks resolve), builds `NudgeSignals`, calls `selectNudge`.
- **Coordination with WalletBalloon:** render only when `address` is present
  **or** the wallet balloon has been dismissed (`sessionStorage
  "balloon-dismissed" === "1"`). Never two balloons at once. (`rank-drop` already
  requires an address; `season-closing`/`streak-risk` can show for a disconnected
  player only once the wallet balloon is gone.)
- On show: `markNudgeShown(kind, todayKey())`; update the rank snapshot.
- CTA: `useWindows().open(...)` to the nudge `target`, then dismiss. Dismiss (✕)
  just hides for the session.
- Auto-hide after ~8s like `WalletBalloon`.

Mounted as `<RetentionBalloon />` in `SystemTray.tsx` after `<WalletBalloon />`.

## 6. Data Flow

```
app load
  → SystemTray mounts WalletBalloon + RetentionBalloon
  → RetentionBalloon: hydrate stores, wait for ranks to resolve
  → build NudgeSignals { streak, ranks, lastSeenRanks, countdowns,
                         hasSeasonScore, shownToday }
  → selectNudge(signals, now)
       null → render nothing; still refresh rank snapshot
       Nudge → render TrayBalloon
                 markNudgeShown(kind, today)
                 refresh rank snapshot
                 CTA click → open target window → dismiss
```

## 7. Testing

**`lib/retention-nudge.test.ts`** (pure, exhaustive):
- rank-drop: held #3 → null (off board) fires; #3 → #5 fires; #3 → #2 (improved)
  does not; no address → skip; no `lastSeenRanks` → skip; multiple drops picks
  best-held rank.
- season-closing: urgent + has score fires; urgent + no score skips; non-urgent
  skips; multiple urgent picks soonest end.
- streak-risk: alive + not-completed fires; completed-today skips; zero streak
  skips.
- priority: when several qualify, higher-priority kind wins.
- dedup: a kind shown today is skipped; a kind shown yesterday is eligible
  (drives next-priority selection).
- load/save helpers: SSR no-op, corrupt JSON → safe defaults (mirror
  daily-challenge tests).

**`lib/last-seen-ranks.test.ts`:** per-address isolation (wallet switch →
`null`), round-trip, corrupt/missing → `null`.

**`components/desktop/RetentionBalloon.test.tsx`:** renders the selected nudge;
CTA opens the correct window via `useWindows`; dismiss hides; respects
wallet-balloon coordination; writes dedup + snapshot on show.

**`components/desktop/TrayBalloon.test.tsx`** (or fold into WalletBalloon test):
renders props; close + CTA callbacks fire. Existing `WalletBalloon` tests must
still pass after the extraction.

All gates green before done: `npx tsc --noEmit`, `npm test`, `npm run lint`.

## 8. Files Touched

New:
- `frontend/lib/retention-nudge.ts` + `.test.ts`
- `frontend/lib/last-seen-ranks.ts` + `.test.ts`
- `frontend/components/desktop/TrayBalloon.tsx` (+ test)
- `frontend/components/desktop/RetentionBalloon.tsx` + `.test.tsx`

Modified:
- `frontend/components/desktop/WalletBalloon.tsx` (use `TrayBalloon`)
- `frontend/components/desktop/SystemTray.tsx` (mount `RetentionBalloon`)

No contract files. No API routes. No new dependencies.

## 9. Open Risks / Notes

- **Source of live ranks:** the component must obtain `playerLiveRanks` the same
  way existing UI does (verify whether a `usePlayerRanks` hook/store exists or
  whether ranks are fetched via `lib/player-ranks.ts` + a reads module). The
  implementation plan resolves the exact wiring; the nudge engine stays agnostic
  (it only consumes the resolved `LiveRanks`).
- **`hasSeasonScore` source:** derive from the same reads that power the
  profile/leaderboard; if not cheaply available on load, the plan may gate
  `season-closing` behind the player having any minted score (holdings) rather
  than per-game season presence. Engine signature already isolates this as an
  input.
- Balloon never blocks gameplay (fixed, dismissible, auto-hides). One per load,
  once per kind per day → low annoyance ceiling.
