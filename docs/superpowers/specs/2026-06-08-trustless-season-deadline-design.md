# Trustless Season Deadline — Design

**Date:** 2026-06-08
**Status:** Approved (design); pending implementation plan
**Scope:** Operational + frontend. **No contract change** (`xp-arcade-v4` is
immutable on mainnet and already supports everything below).

## Problem

The arcade pitches a *trustless* prize pool, but the season currently ends only
when the **owner** calls `end-season`. If the owner disappears, no season ever
closes, so winners can never claim. The visible countdown
(`NEXT_PUBLIC_SEASON_END_ISO`) is a build-time, display-only string with no link
to any on-chain state — it is effectively a promise, not a guarantee.

## Key finding: the contract already supports a trustless deadline

`xp-arcade-v4.clar` (live, block 8209345) already has the full mechanism — it is
just dormant because no `season-end-block` has ever been set:

```clarity
(define-map season-end-block uint uint)              ;; game-id -> stacks-block-height

(define-public (set-season-end-block (game-id uint) (height uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-OWNER)
    (asserts! (is-some (map-get? games game-id)) ERR-NO-GAME)
    (map-set season-end-block game-id height)
    (ok true)))

(define-public (end-season (game-id uint))
  (let ((season (unwrap! (map-get? current-season game-id) ERR-NO-GAME))
        (deadline (default-to u0 (map-get? season-end-block game-id)))
        (is-owner (is-eq tx-sender (var-get contract-owner))))
    (asserts! (or is-owner
                  (and (> deadline u0) (>= stacks-block-height deadline)))
              ERR-SEASON-STILL-OPEN)
    ...))
```

So `end-season` is permissionless **once** (a) the owner has set a non-zero
`season-end-block` for the game, and (b) `stacks-block-height` has reached it.
Today `get-season-end-block` returns `u0` for all games, so the permissionless
branch is disabled and only the owner can close a season.

This work **turns the mechanism on** and **surfaces it honestly in the UI**. It
writes no Clarity.

## Decisions (from brainstorming)

1. **Scope B** — operational owner action + frontend that reads the on-chain
   deadline and exposes a permissionless trigger. (Not A = ops-only; not C =
   owner-set-block UI.)
2. **On-chain block is the single source of truth** for the countdown. The
   displayed ETA is *derived* from the on-chain block, so the countdown shows
   exactly when the permissionless trigger unlocks — no display/reality gap.
3. **One shared deadline for all games.** The owner sets the *same*
   `stacks-block-height` for every registered game. Designed to scale as more
   games are added (see runbook).

## Chain facts used (measured 2026-06-08T07:36Z)

| Fact | Value |
|---|---|
| Current `stacks-block-height` | 8,222,219 |
| Current `burn-block-height` | 952,820 |
| Measured cadence (28h window from block 8,209,345) | ~10,944 stacks blocks/day (~7.9 s/block) |
| Target date | `NEXT_PUBLIC_SEASON_END_ISO = 2026-06-30T23:59:59Z` |
| Estimated target `stacks-block-height` | **≈ 8,470,000** (recomputed from the live tip at execution time) |

> The deadline compares against `stacks-block-height` (variable cadence), unlike
> the claim window which uses `burn-block-height`. Calendar→stacks-block mapping
> is therefore approximate; over ~22 days the real wall-clock date may drift more
> than a day. This is acceptable because the deadline is a trustless *fallback*
> ("if the owner is gone, anyone may close after this point"), and the displayed
> countdown is re-derived from the live tip on every load, so the error shrinks
> as the date approaches.

## Components

### 1. Operational (owner, on-chain) — no code

- Compute the target `stacks-block-height` from the **live** tip at execution
  time using the measured cadence (~10,944/day). Do not hardcode 8,470,000; it is
  an estimate valid only for the 2026-06-08 tip.
- Owner calls `set-season-end-block(game-id, height)` for game ids **1, 2, 3, 4**
  with the **same** `height`. → 4 transactions.
- Executed via a **Clarinet deployment plan** with the **deployer wallet**
  (`SP2CMK…3SV`). The MCP `aibtc` wallet is *not* the owner, so it cannot make
  this owner-only call (HANDOFF quirk #7). Use `-p <plan> -d --no-dashboard`,
  never `-c` on mainnet.
- Commit the plan to `contract/deployments/`.

**Runbook addition (HANDOFF):** whenever a new game is registered, immediately
call `set-season-end-block` for it with the same shared `height`, otherwise that
game's season has no trustless fallback.

### 2. Block-math + chain reads (frontend lib)

New `lib/season-blocks.ts` — pure, unit-tested:
- `AVG_STACKS_BLOCK_SECONDS = 7.9` (measured; single source of the cadence).
- `blocksToEta(targetBlock: number, currentBlock: number, now?: Date): Date` —
  `now + (target - current) * AVG_STACKS_BLOCK_SECONDS`.
- No network access in this module.

Chain reads (placed with existing helpers in `lib/contract-calls.ts` / a stacks
api helper):
- `getCurrentStacksBlockHeight(): Promise<number>` — fetch the tip from Hiro
  (`/extended/v2/blocks?limit=1` → `results[0].height`), using the configured
  network base (mainnet → `api.hiro.so`).
- `getSeasonEndBlockForGame(gameId): Promise<number>` — read-only call to
  `get-season-end-block`.

### 3. `lib/season-countdown.ts` — rework to on-chain source

- Canonical deadline source: `get-season-end-block` for **game 1 (Snake — always
  registered)** plus the current tip.
- Derive `endsAt = blocksToEta(endBlock, currentBlock)`.
- State machine:
  - `unset` — `endBlock == 0` → **fall back to `NEXT_PUBLIC_SEASON_END_ISO`**
    (preserves today's behavior until the owner sets the block; graceful
    degradation).
  - `running` — `currentBlock < endBlock`.
  - `reached` — `currentBlock >= endBlock` **and the season is still open** →
    permissionless trigger available.
- `useSeasonCountdown` becomes **async** (reads chain): add a `loading` state and
  refetch the tip periodically (~30 s) so the countdown ticks toward `reached`.
- `formatCountdown` label change: the old "Season ended — awaiting owner
  end-season" becomes, in the `reached` state, "Deadline reached — anyone can
  close the season."
- Consumers to update: `DesktopLeaderboardShowcase.tsx`, `HighScoreWindow.tsx`,
  `SeasonAdminWindow.tsx` (all already use `useSeasonCountdown`/`formatCountdown`).

### 4. Permissionless "End Season" trigger UI

- In **`HighScoreWindow.tsx`**, per game tab: when countdown state is `reached`
  **and** that game's season is still open, show an **"End Season"** button
  enabled for **any** connected wallet (not gated on owner).
- It calls the existing `endSeasonForGame(gameId)`. `end-season` moves no tokens,
  so **no post-condition** is required.
- After the tx confirms, refresh the window's season/leaderboard state.
- `SeasonAdminWindow.tsx` keeps the owner's manual "End Season" button (owner can
  close at any time, before or after the deadline).

### 5. Tests

- `lib/season-blocks.test.ts` — pure math: ETA computation, zero/negative
  remaining blocks, ordering.
- `lib/season-countdown.test.ts` — state machine with mocked
  `currentBlock`/`endBlock`: `unset` (endBlock 0 → ISO fallback), `running`,
  `reached`. Mock the chain reads.
- **Contract:** no change, but verify the existing `xp-arcade-v4.test.ts` already
  covers the permissionless `end-season` branch (deadline set + height reached →
  non-owner succeeds; deadline unset → non-owner fails `ERR-SEASON-STILL-OPEN`).
  If missing, add **read-only/assertion tests** for that branch — do not modify
  contract code.
- Full gate before done: `frontend` `npm run ci` (test + typecheck + lint) and
  `contract` `npm test` + `clarinet check`, all green, output read.

## Out of scope (YAGNI)

- Owner UI to set/change the deadline block (that is scope C).
- Per-game distinct deadlines.
- Any anti-cheat or contract redeploy.

## Risks / notes

- **Cadence drift** — handled by re-deriving the countdown from the live tip on
  every load; the constant only needs to be roughly right.
- **`unset` fallback** — until the 4 owner txs confirm on mainnet, the UI behaves
  exactly as today (ISO countdown). The frontend can ship before or after the
  owner action without breaking.
- **More games later** — the shared-block model scales, but each new game needs
  its own `set-season-end-block` call (captured in the runbook).
