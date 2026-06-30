# Level-Up Toast — XP/Level v2 design

**Date:** 2026-06-30
**Status:** Approved (brainstorm) — ready for implementation plan
**Scope:** Frontend only. No contract / mainnet change.

## Problem

The hybrid XP/Level system (v1, shipped 2026-06-25) accrues XP silently. A player
only sees their level by opening their own profile (`LevelHero`). There is no
"level-up moment" — no live feedback, no dopamine loop. v2 adds exactly that one
thing: a **level-up toast** that fires the moment the connected wallet crosses a
level boundary during a session.

Out of scope for this iteration (deferred, may get their own specs): taskbar level
badge, leaderboard titles, theme/cursor/avatar-frame unlocks.

## Goals

- When the connected wallet's level increases **live during a session**, show a
  Win95 balloon toast announcing it.
- The level number shown must be **correct** — i.e. computed from all three XP
  sources (on-chain base + play + streak), not a partial number.
- Crossing a **title band** (e.g. Lv5 → "Player", Lv10 → "Pro") is emphasized:
  the toast becomes a success-type "New title" message instead of a plain
  "Level N" message.
- No false positives: never toast for XP earned while the app was closed, never
  toast a wrong (too-low) number while base XP is still loading.

## Non-goals

- Click-to-open-profile on the toast. The balloon keeps its existing
  click-to-dismiss behavior.
- Any new visual component. Reuse the existing toast store + `<Balloons/>`.
- On-chain anti-tamper. Local XP tamper is accepted (cosmetic title only), same
  posture as v1.

## Existing infrastructure (reused)

- `state/toasts.ts` — `useToasts.push({ title, body, type, duration })`; rendered
  by `<Balloons/>` (`components/dialogs/BalloonNotification.tsx`), mounted in
  `app/page.tsx`. Yellow Win95 balloon, bottom-right, plays a sound on push,
  click-to-dismiss. Types: `info` | `success` | `error`.
- `lib/level.ts` — `computeLevel(stats, { playXp, bestStreak })`, `levelTitle`,
  `TITLE_BANDS`, `LevelInfo`. Single source of truth for level + title.
- `state/play-xp.ts` — `usePlayXp.lifetimeXp` (persisted, global; bumps at the
  game-over chokepoint `lib/record-run.ts` for all 6 games).
- `state/daily-challenge.ts` — `useDailyChallenge.bestStreak` (global; bumps at
  the same chokepoint).
- `lib/holdings.ts` — `fetchAllScoreHoldings(addr)`; `lib/player-stats.ts` —
  `computePlayerStats(nfts)` → `PlayerStats` (carries `totalScore` = base XP).
  Reads go through `cachedRead`, so a second caller dedupes to one network call.
- `state/mint-tx.ts` — `useMintTx.status === "success"` signals a confirmed mint
  (base XP just changed).
- `state/wallet.ts` — `useWallet.address` = connected address.

## Architecture

A reactive **watcher** mounted once at the app root observes the connected
wallet's true level and pushes a toast when it rises during the session.

### New files

1. **`lib/level-up.ts`** (+ `lib/level-up.test.ts`) — pure decision helper.

   ```ts
   import { levelTitle } from "./level";
   import type { ToastType } from "@/state/toasts";

   export type LevelUpToast = { title: string; body: string; type: ToastType };

   /**
    * Decide what (if any) toast to show when level moves from prevLevel to
    * nextLevel. Returns null when nextLevel <= prevLevel (no level-up). When the
    * jump crosses a title band, returns a success "New title" toast; otherwise a
    * plain info "Level N" toast.
    */
   export function decideLevelUpToast(args: {
     prevLevel: number;
     nextLevel: number;
   }): LevelUpToast | null;
   ```

   - `nextLevel <= prevLevel` → `null`.
   - `levelTitle(nextLevel) !== levelTitle(prevLevel)` → success toast:
     `{ title: "New title: «" + levelTitle(nextLevel) + "»!", body: "Reached Level " + nextLevel, type: "success" }`.
   - else → info toast: `{ title: "Level " + nextLevel + "!", body: "Keep playing to level up.", type: "info" }`.
   - Exact copy strings are an implementation detail; the *shape* (success on
     title crossing, info otherwise) is the contract under test.

2. **`state/level-progress.ts`** (+ test) — persisted zustand store tracking the
   last acknowledged level **per address** (so switching wallets doesn't cross
   the streams, and reload doesn't re-toast).

   ```ts
   type LevelProgressState = {
     acknowledged: Record<string, number>; // address -> last acknowledged level
     acknowledge: (address: string, level: number) => void;
   };
   ```

   - `acknowledge` stores `max(existing, level)` for that address (never lowers).
   - Persist key `xp-arcade-level-progress`, `partialize` to `{ acknowledged }`,
     `version: 1`.

3. **`hooks/useConnectedPlayerStats.ts`** (+ test) — fetches the connected
   wallet's stats globally.

   - Reads `useWallet.address`. When present, `fetchAllScoreHoldings(address)` →
     `computePlayerStats` → `{ stats }`. Returns `{ stats: PlayerStats | null }`
     (null while loading / not connected / on error).
   - Refetches when `useMintTx.status` transitions to `"success"` (base XP
     changed). Cancels in-flight on address change (guard against stale set, same
     pattern as `PlayerProfileBody`).
   - `PlayerProfileBody` keeps its own fetch unchanged; `cachedRead` collapses the
     duplicate request, so this adds no real extra network when the profile is
     also open. (Refactoring the profile onto this hook is explicitly out of
     scope to keep blast radius small.)

4. **`hooks/useLevelUpToast.ts`** — the watcher (a hook returning nothing).

   - Inputs: `address = useWallet`, `stats = useConnectedPlayerStats`,
     `playXp = usePlayXp.lifetimeXp`, `bestStreak = useDailyChallenge.bestStreak`.
   - `info = useMemo(() => stats ? computeLevel(stats, { playXp, bestStreak }) : null, ...)`.
   - Uses a ref `baselinedFor: string | null` to track whether the current
     address has been baselined this session.
   - Effect logic (runs when `address`, `info`, or `acknowledged[address]` change):
     1. If `address` is null or `info` is null (stats not loaded) → do nothing.
        (Fail-safe: a permanent fetch failure means no toasts, never a wrong one.)
     2. If `baselinedFor !== address` → **baseline silently**:
        `acknowledge(address, max(ack, info.level))`, set `baselinedFor = address`,
        no toast. Absorbs XP earned while away.
     3. Else if `info.level > ack` → `decideLevelUpToast({ prevLevel: ack, nextLevel: info.level })`;
        if non-null `useToasts.push(toast)`; `acknowledge(address, info.level)`.
   - Reset `baselinedFor` to `null` when `address` changes to a different wallet
     (handled naturally by the `baselinedFor !== address` check).

### Modified file

- **`app/page.tsx`** — call `useLevelUpToast()` (or render an invisible
  `<LevelUpWatcher/>` that calls it) alongside the existing `<Balloons/>`.

## Data flow

```
game over ──> recordFinishedRun ──> usePlayXp.addPlay / useDailyChallenge.recordPlay
                                            │ (reactive store update)
mint confirm ─> useMintTx.status="success" ─┼─> useConnectedPlayerStats refetch (base)
                                            ▼
                          useLevelUpToast: computeLevel(stats,{playXp,bestStreak})
                                            ▼  info.level > acknowledged[address]?
                          decideLevelUpToast ─> useToasts.push ─> <Balloons/>
                                            └─> level-progress.acknowledge(address, level)
```

## Edge cases

| Case | Behavior |
|---|---|
| Fresh load, base still fetching | `info` null → no action until stats load, then baseline silently. |
| XP earned while app closed | Baselined silently on first load → no toast (moment must be live). |
| Reload mid-session | `acknowledged` persisted per address → no re-toast. |
| Switch wallet | `baselinedFor !== address` → re-baseline silently for the new address. |
| Stats fetch fails | `info` stays null → never toasts (fail-safe). |
| Multi-level jump in one run | Single toast for the final level; title crossing wins if any band passed. |
| Not connected | `address` null → watcher idle. |

## Testing

- `lib/level-up.test.ts` — `decideLevelUpToast`: no-op when `next <= prev`;
  info toast for a same-title increase; success "New title" toast when crossing a
  band (e.g. 4→5 "Player", 9→10 "Pro").
- `state/level-progress.test.ts` — `acknowledge` stores per address, never lowers,
  partialize shape.
- `hooks/useConnectedPlayerStats.test.ts` — fetches on connect; refetches on mint
  `success`; null while loading / on error; cancels stale on address change.
- `hooks/useLevelUpToast` — light RTL: stats present + playXp bump that crosses a
  boundary pushes a toast; first-load baseline pushes nothing; band crossing pushes
  a `success` toast. (Heavy logic lives in the pure `level-up.ts`.)
- Full gate before "done": `npx tsc --noEmit`, `npm test`, `npm run build`,
  `npm run lint` — all green, output read. Optional Playwright spot-check.

## Implementation notes for the plan

Tasks must be sliced as small as possible so each lands as its own green commit
(per user preference — incremental commits OK without asking). Natural slices,
each independently testable + committable:

1. `lib/level-up.ts` + tests (pure, zero deps on the rest).
2. `state/level-progress.ts` + tests (persisted store, standalone).
3. `hooks/useConnectedPlayerStats.ts` + tests (fetch hook, standalone).
4. `hooks/useLevelUpToast.ts` (wires 1–3 + existing stores) + light test.
5. Mount in `app/page.tsx`.
6. Final gate (tsc/test/build/lint) + README/HANDOFF touch if warranted.
```
