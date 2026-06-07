# Tie-Rank Fairness — `xp-arcade-v4` Prize Redesign

**Date:** 2026-06-06
**Status:** Design approved; spec under review.
**Supersedes prize logic of:** `xp-arcade-v3` (live mainnet `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v3`).

## 1. Problem

`xp-arcade-v3.claim-prize` computes each claimant's payout at claim time from a
fixed band schedule: rank 1–3 → 20% of the pool each, rank 4–10 → 4/70 (~5.71%)
each. Rank is `1 + count(scores strictly higher)`, so **tied scores share a
rank** and each compute the same band %. Consequences (pinned by the
`payout invariants` tests in `contract/tests/xp-arcade-v3.test.ts`):

- The pool is **safe** — `min(payout, remaining)` + `season-paid` guarantee total
  paid never exceeds `total`.
- But under ties, distribution is **claim-order-dependent**: early claimers can
  drain the pool and a genuine top-10 member gets a reduced share or
  `ERR-EMPTY-POOL`. A griefer who deliberately ties the top score and races to
  claim can capture more than their fair share.
- Integer-division dust and the shares of players who never claim are **locked
  forever** (no sweep).

Clarity contracts are immutable, so fixing the on-chain payout logic requires a
**new contract deploy** (`xp-arcade-v4`) + frontend repoint. This spec covers
only that fix; no other behavior changes.

## 2. Decisions (from brainstorming)

1. **Fairness under ties = split occupied slots equally.** N tied players occupy
   N consecutive positions; sum the band value of those positions and divide
   equally. Order-independent and the totals always reconcile.
2. **Unclaimed funds + dust roll into the next season's pool** after a claim
   deadline, via a permissionless `finalize-season` (no owner privilege over the
   money — stays trustless).
3. **Fresh start, no migration.** Deploy `xp-arcade-v4`, re-`register-game` the 4
   games, start token-ids/pools from zero. Existing v3 seasons are closed out on
   v3 (owner ends them; players claim within v3) before/independently of v4.
4. **Implementation = compute-at-claim (Approach A).** `claim-prize` computes the
   split-occupied amount from the frozen snapshot each call; no per-player
   allocation map. Chosen because the math is cheap arithmetic, so precompute
   (Approach B) adds state/complexity without meaningful benefit.

## 3. Architecture & scope

New file `contract/contracts/xp-arcade-v4.clar`, `clarity_version = 3` (same as
v3 — `as-contract` works under Clarity 3, not 4). Copied from v3; **only the
prize path changes**: `claim-prize`, `end-season`, new `finalize-season`, new
maps/read-onlys/error codes. Unchanged: registry (`register-game`,
`set-game-active`), `mint-score` (as-contract pool + data-driven rarity +
per-season mint cap), `best-score`, per-game `top-ten` min-eviction, SIP-009
surface (`transfer`, `get-owner`, `get-token-uri` with `int-to-ascii` id concat),
`transfer-ownership`, `set-base-uri`.

## 4. Time semantics — use `burn-block-height` (epoch 3)

The claim window is measured in **`burn-block-height`** (Bitcoin blocks,
~10 min, ~144/day), NOT `stacks-block-height`. Post-Nakamoto, Stacks block
height advances every few seconds, so it cannot express wall-clock durations.
`burn-block-height` makes "≈30 days = 4320 burn blocks" meaningful and stable.

> The v3 `season-end-block` (permissionless season-close fallback) keeps its
> existing `stacks-block-height` mechanism — out of scope for this fix.

## 5. Data model (added / changed)

```clarity
(define-constant CLAIM-WINDOW u4320) ;; ~30 days, in burn blocks

;; season-prize tuple GAINS claim-deadline (a burn-block-height):
(define-map season-prize { game-id: uint, season: uint }
  { total: uint,
    top-ten: (list 10 { player: principal, score: uint }),
    claim-deadline: uint })

(define-map season-finalized { game-id: uint, season: uint } bool)

;; retained from v3: season-paid, prize-claimed, season-accumulated,
;;                   current-season, top-ten, best-score, score-data, games, ...

;; new error codes:
;; ERR-CLAIM-CLOSED      (err u114)
;; ERR-ALREADY-FINALIZED (err u115)
;; ERR-NOT-FINALIZABLE   (err u116)
```

## 6. Flows

### 6.1 `end-season (game-id)`
Same as v3 (assert owner OR past season-end-block; snapshot `total` =
`season-accumulated`, `top-ten`; reset pool/top-ten; bump `current-season`),
**plus** writes `claim-deadline = burn-block-height + CLAIM-WINDOW` into the
`season-prize` tuple.

### 6.2 `claim-prize (game-id season)`
Guards (unchanged from v3): `season < current` (`ERR-SEASON-NOT-CLOSED`),
prize exists (`ERR-PRIZE-NOT-FOUND`), not already claimed (`ERR-ALREADY-CLAIMED`),
`total > 0` (`ERR-EMPTY-POOL`), caller present in snapshot (`ERR-NOT-IN-TOP-TEN`).

**New guard:** `burn-block-height <= claim-deadline` else `ERR-CLAIM-CLOSED`.

**New payout (split-occupied)** — replaces the `rank<=3 ? 20% : 4/70` formula.
Let `S` = caller's score in the snapshot:

```
higher = count(entries with score > S)        ;; fold over snapshot
same   = count(entries with score == S)       ;; includes the caller (>= 1)

twenty = total * u20 / u100
four70 = total * u4  / u70

;; the tied group occupies positions (higher+1) .. (higher+same)
slots_top3 = (higher >= u3) ? u0 : ((min u3 (higher + same)) - higher)
slots_4_10 = same - slots_top3

payout = (slots_top3 * twenty + slots_4_10 * four70) / same
```

All positions are <= 10 (snapshot is capped at 10), so no position falls outside
the 1–10 band. Defensive cap `payout = min(payout, total - season-paid)` (should
never bind under correct math). Then: set `prize-claimed`, `season-paid +=
payout`, `as-contract (stx-transfer? payout tx-sender player)`, `(ok payout)`.

**Worked examples** (total = 100000):
- 10 distinct scores → each `same = 1`, payout = its position band (20000 ×3,
  5714 ×7) — identical to v3 intent.
- 3 tie for the top (positions 1–3) → `(3*20000)/3 = 20000` each.
- 2 tie straddling positions 3–4 (`higher=2, same=2`) →
  `slots_top3 = min(3,4)-2 = 1`, `slots_4_10 = 1`, payout = `(20000+5714)/2 =
  12857` each (≈12.86%).

### 6.3 `finalize-season (game-id season)` — NEW, permissionless
Guards: prize exists; not finalized (`ERR-ALREADY-FINALIZED`);
`burn-block-height > claim-deadline` (`ERR-NOT-FINALIZABLE`).
Action: `unclaimed = total - season-paid`; if `> 0`, add it to
`season-accumulated` of the game's **current open season** (the STX is already
held by the contract from the original mints — this is pure accounting, no
transfer). Set `season-finalized = true`. Return `(ok unclaimed)`.

No claim/finalize overlap: claiming requires `<= deadline`, finalizing requires
`> deadline`. Anyone may finalize (lazy; funds simply wait until called).

### 6.4 New read-onlys
- `get-claimable-amount (game-id season player)` → the exact split-occupied
  payout for that player (single source of truth for the frontend's displayed
  amount + post-condition). Returns 0 if not eligible.
- `get-season-finalized (game-id season)` → bool.
- `is-claim-open (game-id season)` → bool (`burn-block-height <= claim-deadline`
  and prize exists and not finalized).

## 7. Edge cases

- **< 10 players:** unused position bands are never allocated → fall into
  `unclaimed` → roll. Correct by construction.
- **Over-distribution:** impossible — sum of band values ≤ 100% of `total`, and
  ties only redistribute within their occupied positions; defensive cap retained.
- **Double finalize:** blocked by `season-finalized`.
- **Claim after window:** `ERR-CLAIM-CLOSED`; the share rolls on finalize.
- **Rounding dust:** lands in `unclaimed` and rolls; nothing is locked forever.

## 8. Frontend changes

- Repoint to v4: `lib/game-registry.ts` `contractName` → `xp-arcade-v4`; Vercel
  `NEXT_PUBLIC_CONTRACT_ADDRESS`.
- Claim amount: read `get-claimable-amount` on-chain instead of recomputing in
  `lib/payout-schedule.ts` (keeps UI exactly in sync; `payout-schedule.ts` may
  remain for rough display estimates only).
- HighScoreWindow claim flow: handle `ERR-CLAIM-CLOSED` → render "claim window
  closed" instead of a claim button; use `is-claim-open` to gate the button.
- `finalize-season` is permissionless; no dedicated UI required (rolled funds
  appear in the next pool). An optional maintenance trigger is out of scope.
- Update `lib/claimable-prizes.ts` discovery to respect the claim window.

## 9. Testing (contract — Vitest/Clarinet)

- **Split-occupied correctness:** distinct (matches v3 amounts), 2-tie at top,
  2-tie straddling the 3/4 boundary (12.86% each at total 100000), all-10 tie,
  ties inside the 4–10 band.
- **Invariants:** Σ(all claims) ≤ total; **order-independence** — claiming in
  different orders yields identical per-player amounts.
- **Claim window:** claim before deadline OK; after deadline `ERR-CLAIM-CLOSED`.
- **finalize:** before deadline → `ERR-NOT-FINALIZABLE`; after deadline rolls
  exactly `total - season-paid` into the current season's `season-accumulated`;
  double finalize → `ERR-ALREADY-FINALIZED`; fully-claimed season rolls only
  dust/unallocated.
- **Rewrite** the session's `payout invariants` suite expectations: ties now
  split fairly instead of starving lower ranks.
- Use `simnet.mineEmptyBurnBlocks` (or equivalent) to cross the burn-block claim
  deadline in tests; confirm the helper name during implementation.

## 10. Deploy (out of code)

Deploy `xp-arcade-v4` to mainnet (Clarinet plan, deployer wallet) →
`register-game` ×4 (Snake/Tetris/Pac-Man/XP Bricks, same fees/rarity as v3) →
`set-base-uri` to the production metadata route → set Vercel
`NEXT_PUBLIC_CONTRACT_ADDRESS=…xp-arcade-v4` + redeploy → live-wallet smoke
(mint, end-season, claim, claim-after-window, finalize roll).

## 11. Out of scope

- Score attestation / anti-cheat (P0, deferred separately).
- Migrating v3 state or funds.
- Switching `season-end-block` to burn-block-height.
- Archiving the dead v2 per-game `*-score.clar` contracts.
- Any UI for triggering `finalize-season`.

## 12. Parameters

`CLAIM-WINDOW = u4320` (~30 days in burn blocks) — approved as part of this
design. Change only if requirements shift before implementation.
