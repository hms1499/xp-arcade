# Design Spec — Snake Score NFT v2

**Date:** 2026-05-14  
**Status:** Approved  
**Scope:** Contract upgrades + frontend updates for production-ready Score NFT game loop

---

## Background

The current `snake-score.clar` is a hackathon MVP. Score is client-trusted, mint is free, NFTs have no rarity, and there is no economic incentive to play. This spec upgrades the contract and frontend to create a real game loop: mint fees fund a per-season prize pool, rarity tiers make NFTs collectible, a score cap reduces abuse, and prize pool distribution is claim-based for safety.

Architecture principle: **one contract per game, each game competes independently**. This spec covers Snake only. Future games (Tetris, etc.) deploy their own contract from the same template.

---

## Goals

1. Reduce score spoofing with a server-side cap
2. Create economic incentive via mint fee → prize pool → season reward
3. Add collectible value via on-chain rarity tiers
4. Fix SIP-009 `impl-trait` for marketplace indexer compatibility
5. Keep contract generic enough to reuse as a template for future games

---

## Non-Goals

- On-chain proof of gameplay (commit-reveal, replay verification) — v3
- Cross-game prize pool or hub contract — not needed until 2+ games exist
- Trophy contract changes — out of scope
- Mobile UI improvements — out of scope

---

## Contract Changes (`snake-score.clar`)

### 1. SIP-009 `impl-trait`

Add at top of contract:

```clarity
(impl-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)
```

Enables automatic marketplace indexer detection.

### 2. Score cap

In `mint-score`, assert before any state changes:

```clarity
(asserts! (<= score u9999) ERR-SCORE-TOO-HIGH)
```

New error constant: `(define-constant ERR-SCORE-TOO-HIGH (err u104))`

### 3. Mint fee (0.01 STX)

In `mint-score`, transfer fee from caller to contract before minting:

```clarity
(try! (stx-transfer? u10000 tx-sender (as-contract tx-sender)))
```

Fee accumulates in the contract's STX balance as the prize pool.

### 4. Rarity tiers

`score-data` map gains a `rarity` field:

```clarity
(define-map score-data uint {
  player: principal,
  score: uint,
  player-name: (string-ascii 24),
  block: uint,
  season: uint,
  rarity: (string-ascii 10)
})
```

Rarity is computed at mint time by a private helper:

| Tier | Score range | Label |
|------|-------------|-------|
| Common | 0–166 | `"Common"` |
| Rare | 167–499 | `"Rare"` |
| Epic | 500–999 | `"Epic"` |
| Legendary | 1000+ | `"Legendary"` |

```clarity
(define-private (compute-rarity (score uint))
  (if (>= score u1000) "Legendary"
    (if (>= score u500) "Epic"
      (if (>= score u167) "Rare"
        "Common"))))
```

### 5. Prize pool — season snapshot map

```clarity
(define-map season-prize uint {
  total: uint,
  top-ten: (list 10 { player: principal, score: uint })
})
```

Keyed by season number. Written once when `end-season` is called.

### 6. Prize claim tracking

```clarity
(define-map prize-claimed { player: principal, season: uint } bool)
```

### 7. `end-season` (replaces `reset-season`)

Owner-only. Does three things atomically:
1. Snapshots current contract STX balance + current top-ten into `season-prize[current-season]`
2. Clears `top-ten` to empty list
3. Increments `current-season`

```clarity
(define-public (end-season)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-OWNER)
    (map-set season-prize (var-get current-season) {
      total: (stx-get-balance (as-contract tx-sender)),
      top-ten: (var-get top-ten)
    })
    (var-set top-ten (list))
    (var-set current-season (+ (var-get current-season) u1))
    (ok true)))
```

`reset-season` is removed — `end-season` replaces it entirely.

### 8. `claim-prize (season uint)`

Public. Callable by anyone who was in that season's top-ten snapshot.

**Distribution logic:**
- Rank 1–3: each receives `(total * 20) / 100`
- Rank 4–10: each receives `(total * 40) / (100 * 7)` → `(total * 4) / 70`

Rank is computed via fold over `season-prize[season].top-ten` (same approach as `claim-trophy`).

```clarity
(define-public (claim-prize (season uint))
  ...)
```

Steps:
1. Assert season < current-season (closed season only)
2. Assert not already claimed: `prize-claimed[{player, season}]` is false
3. Load `season-prize[season]` — assert exists
4. Fold over top-ten snapshot to find caller's rank (same rank-fold pattern as trophy)
5. Assert caller is present in snapshot
6. Compute payout based on rank
7. `as-contract (stx-transfer? payout (as-contract tx-sender) tx-sender)`
8. Set `prize-claimed[{player, season}]` = true
9. Return `(ok payout)`

### 9. Error constants added

```clarity
(define-constant ERR-SCORE-TOO-HIGH (err u104))
(define-constant ERR-SEASON-NOT-CLOSED (err u105))
(define-constant ERR-NO-PRIZE (err u106))
(define-constant ERR-PRIZE-NOT-FOUND (err u107))
(define-constant ERR-EMPTY-POOL (err u108))
```

`ERR-EMPTY-POOL` is returned by `claim-prize` when `season-prize.total = 0` (season ended with no mints). `end-season` itself succeeds even with an empty pool — it is valid to reset a season with no activity.

### 10. New read-only functions

```clarity
(define-read-only (get-season-prize (season uint)) ...)
(define-read-only (get-prize-pool-balance) (stx-get-balance (as-contract tx-sender)))
(define-read-only (has-claimed-prize (player principal) (season uint)) ...)
```

---

## Frontend Changes

### `MintDialog.tsx`
- Show mint fee: "Minting costs 0.01 STX"
- On error `u104`: display "Score too high — possible tampering detected"

### `LeaderboardWindow.tsx`
- Show current prize pool balance (call `get-prize-pool-balance`)
- After `end-season` is detected (season increments): show "Season ended — claim your prize" banner for eligible players
- Add "Claim Prize" button per season row in a new "Past Seasons" tab

### `MyNftsWindow.tsx`
- Show rarity badge on each Score NFT card (read from `score-data.rarity`)

### `lib/metadata-svg.ts`
- SVG border/badge color by rarity:
  - Common → grey `#9ca3af`
  - Rare → blue `#3b82f6`
  - Epic → purple `#a855f7`
  - Legendary → gold `#f59e0b`
- Add `attributes` array to SIP-016 JSON response:
  ```json
  [{ "trait_type": "Rarity", "value": "Legendary" },
   { "trait_type": "Season", "value": "1" }]
  ```

### `lib/contract-calls.ts`
- Add `claimPrize(season: number)`
- Add `endSeason()` (owner-only, used from dev tooling)
- Add `getSeasonPrize(season: number)`
- Add `getPrizePoolBalance()`

---

## Test Plan (contract — Clarinet/Vitest)

Existing 14 tests remain valid with minor updates (season reset renamed, `score-data` shape change).

New tests required:

| # | Scenario |
|---|----------|
| 15 | `mint-score` with score > 9999 → `ERR-SCORE-TOO-HIGH` |
| 16 | `mint-score` deducts 0.01 STX from caller |
| 17 | Contract STX balance increases after each mint |
| 18 | `score-data.rarity` = "Common" for score 100 |
| 19 | `score-data.rarity` = "Rare" for score 200 |
| 20 | `score-data.rarity` = "Epic" for score 600 |
| 21 | `score-data.rarity` = "Legendary" for score 1000 |
| 22 | `end-season` snapshots pool + top-ten, clears top-ten, increments season |
| 23 | `end-season` by non-owner → `ERR-NOT-OWNER` |
| 24 | `claim-prize` for rank-1 player receives 20% of pool |
| 25 | `claim-prize` for rank-5 player receives ~5.71% of pool |
| 26 | `claim-prize` twice same season → `ERR-ALREADY-CLAIMED` |
| 27 | `claim-prize` on open season → `ERR-SEASON-NOT-CLOSED` |
| 28 | `claim-prize` player not in top-ten → `ERR-NOT-IN-TOP-TEN` |

Target: 28 tests passing.

---

## Migration / Deploy Notes

- This is a **breaking contract change** — new contract must be deployed (new address)
- Update `NEXT_PUBLIC_CONTRACT_ADDRESS` in Vercel env after deploy
- Call `set-base-uri` with real Vercel URL immediately after deploy (see mainnet-review.md)
- `reset-season` is removed — update any scripts/tooling that called it
- Existing testnet NFTs (old contract) will not have `rarity` field — treat gracefully in frontend

---

## Open Questions (none — all resolved in brainstorming)

- ✅ Prize pool: per-game, not shared across games
- ✅ Distribution: top 3 = 20% each, rank 4–10 = 40%/7 each
- ✅ Claim mechanism: claim-based (not auto-distribute)
- ✅ Mint fee: 0.01 STX
- ✅ Score cap: u9999
- ✅ Rarity thresholds: 0–166 / 167–499 / 500–999 / 1000+
