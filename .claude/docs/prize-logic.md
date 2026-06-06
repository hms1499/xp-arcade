# Core Logic — Prize Pool & Trustless Claim (v3)

The platform's central domain calculation: turning accumulated mint fees into a
rank-based prize distribution that top-10 players claim trustlessly on-chain.

## Accumulation

Every `mint-score` fee is transferred **into the contract** via `as-contract`
and added to that game/season's pool (`season-accumulated`). The contract
**holds** the STX — it is not paid to the owner (that was the v2 model).

## Rank-based split (authoritative on-chain in `claim-prize`)

When a player claims, the contract computes their rank as
`1 + count(entries with strictly higher score)` over the season snapshot, then:

```
payout = (rank <= 3) ? total * 20 / 100      # 20% each (ranks 1–3 → 60%)
                     : total * 4  / 70        # ~5.7% each (ranks 4–10 → 40%)
payout = min(payout, total - already_paid)    # never over-pay the pool
```

All amounts are floored uStx (integers). `season-paid` tracks the running total
so the pool can never be over-distributed.

`lib/payout-schedule.ts` (`computePayoutUstx` / `buildPayoutRows`) mirrors this
math **off-chain for display and for the claim post-condition** — the contract
is the source of truth.

## Claim flow (trustless)

1. Owner closes the season on-chain: `end-season (game-id)` (snapshots the pool +
   top-10 into `season-prize`).
2. Frontend discovers claimable seasons via `lib/claimable-prizes.ts`
   (`findClaimablePrizes`) and shows them in the **High Scores** window.
3. Player clicks claim → `claimPrizeV3 (game-id season amountUstx)` →
   `claim-prize` verifies eligibility, computes payout, and **transfers STX from
   the contract to the player** (`as-contract (stx-transfer? ...)`).

Season Admin is **read-only** for prizes — the owner only closes seasons; there
is no manual "Send STX". Eligibility guards: season must be closed
(`< current`), prize must exist, not already claimed, caller in the snapshot
top-10, pool non-empty.

## Known edge cases (see architecture-decisions.md)

- **Tie ranks:** equal scores share a rank, so several players can each compute
  20%. The `min(payout, remaining)` cap protects the pool from over-payment, but
  distribution becomes **claim-order-dependent** under ties — late claimers can
  hit `ERR-EMPTY-POOL`.
- **Stranded funds:** integer-division dust and shares of top-10 players who
  never claim (e.g. lost keys) remain locked in the contract. There is no owner
  sweep — a deliberate trustlessness trade-off.

## Season deadline

`NEXT_PUBLIC_SEASON_END_ISO` is a **build-time, display-only** soft deadline
(Leaderboard + Season Admin). The contract does not enforce duration — the owner
must still call `end-season` around that time. Changing it requires a redeploy.
