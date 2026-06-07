# Core Logic — Prize Pool & Trustless Claim (v4)

The platform's central domain calculation: turning accumulated mint fees into a
rank-based prize distribution that top-10 players claim trustlessly on-chain.

## Accumulation

Every `mint-score` fee is transferred **into the contract** via `as-contract`
and added to that game/season's pool (`season-accumulated`). The contract
**holds** the STX — it is not paid to the owner (that was the v2 model).

## Rank-based split with tie-fair payout (authoritative on-chain)

Bands (positions, not ranks) are fixed:

```
positions 1-3 : 20% of total each  (60% combined)
positions 4-10: 4/70 (~5.71%) each (40% combined)
```

**Tied scores split the combined value of the positions they occupy equally
(order-independent).** The contract counts how many players share the same
score as the claimant and which positions they collectively occupy, then
divides the combined band value by the tie count.

Example — two players tied, straddling positions 3 and 4:
- Combined value = 20% + 5.71% = 25.71% of pool
- Each player receives 25.71% / 2 = ~12.86%

This is computed at claim time by `get-claimable-amount (game-id season player)`
(read-only) and enforced inside `claim-prize`.

All amounts are floored to integer uStx. `season-paid` tracks the running total
so the pool can never be over-distributed.

`lib/payout-schedule.ts` (`computePayoutUstx` / `buildPayoutRows`) mirrors the
band schedule **off-chain for display and for the claim post-condition** — the
contract is the source of truth. The frontend reads `get-claimable-amount`
on-chain to show the actual amount.

## Claim window

`end-season (game-id)` snapshots the pool + top-10 into `season-prize` and sets
`claim-deadline = burn-block-height + CLAIM-WINDOW` (`CLAIM-WINDOW = u4320`,
approximately 30 days in Bitcoin blocks).

`claim-prize` rejects after the deadline with `ERR-CLAIM-CLOSED (u114)`. The
frontend reads `is-claim-open (game-id season)` and shows "Claim window closed"
when the window has passed (no Claim button rendered).

## Finalize roll (permissionless)

After the claim window closes, **anyone** can call `finalize-season (game-id
season)`. This computes `total − season-paid` (unclaimed player shares +
integer-division dust) and adds it back to `season-accumulated` for the game's
currently open season. Pure accounting — no STX transfer. Idempotent via the
`season-finalized` map.

- Rejects while the window is still open: `ERR-NOT-FINALIZABLE (u116)`.
- Rejects if already called: `ERR-ALREADY-FINALIZED (u115)`.
- Check with `get-season-finalized (game-id season)`.

Nothing is locked forever: any funds not claimed within the window roll forward
into the next season's pool.

## Claim flow (trustless)

1. Owner closes the season on-chain: `end-season (game-id)` (snapshots the pool +
   top-10 into `season-prize`, sets `claim-deadline`).
2. Frontend discovers claimable seasons via `lib/claimable-prizes.ts`
   (`findClaimablePrizes`) and shows them in the **High Scores** window. It reads
   `is-claim-open` to decide whether to show the Claim button or "Claim window
   closed". It calls `get-claimable-amount` to show the exact on-chain amount.
3. Player clicks Claim → `claimPrizeV3 (game-id season amountUstx)` →
   `claim-prize` verifies eligibility, computes tie-fair payout, and **transfers
   STX from the contract to the player** (`as-contract (stx-transfer? ...)`).

Season Admin is **read-only** for prizes — the owner only closes seasons; there
is no manual "Send STX". Eligibility guards: season must be closed (`< current`),
prize must exist, claim window still open, not already claimed, caller in the
snapshot top-10, pool non-empty.

## Season deadline

`NEXT_PUBLIC_SEASON_END_ISO` is a **build-time, display-only** soft deadline
(Leaderboard + Season Admin). The contract does not enforce duration — the owner
must still call `end-season` around that time. Changing it requires a redeploy.
