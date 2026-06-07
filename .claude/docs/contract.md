# Contract — `xp-arcade-v4`

Single shared SIP-009 registry contract for **all** games. Source:
`contract/contracts/xp-arcade-v4.clar`. Deployed mainnet:
`SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4`
(tx `0x5924dcde66b6e9723fa0a0c919bb3f459876cf13276d67fb193c5f12733d39d3`, block 8209345, 2026-06-07).

`clarity_version = 3` (NOT 4) — `as-contract` misbehaves under Clarity 4 in
Clarinet 3.14.1. Do not bump.

## Multi-game model

One contract, many games keyed by `game-id` (uint). Games are registered
on-chain via `register-game`. On-chain ids (mirror `lib/game-registry.ts`):

| game-id | game     | label     | mint fee  |
|---------|----------|-----------|-----------|
| 1       | snake    | Snake     | 0.01 STX  |
| 2       | tetris   | Tetris    | 0.02 STX  |
| 3       | pacman   | Pac-Man   | 0.02 STX  |
| 4       | breakout | XP Bricks | 0.02 STX  |

Every per-game state map is keyed by `game-id` (or a tuple containing it):
`games`, `current-season`, `season-end-block`, `season-accumulated`,
`top-ten`, `best-score`, `player-season-mints`, `season-prize`,
`season-paid`, `prize-claimed`, `season-finalized`.

The `season-prize` tuple gained a `claim-deadline: uint` field (set by
`end-season` to `burn-block-height + CLAIM-WINDOW`). The constant
`CLAIM-WINDOW` is `u4320` (≈ 30 days in Bitcoin blocks).

## Score NFTs + leaderboard

- `mint-score (game-id score player-name)` — mints a Score NFT post-game at the
  player's discretion. Charges the per-game fee. Capped at `MAX-SCORE u9999`
  and `MAX-MINTS-PER-SEASON u10` per player/game/season.
- `get-top-ten (game-id)` — on-chain top-10 per game. **Not sorted on-chain**;
  frontend sorts on read. When full, lowest score is evicted only if beaten
  (min-eviction, not insertion-sort).
- SIP-009 surface: `transfer`, `get-owner`, `get-token-uri`, `get-last-token-id`.

## Prize pool (trustless claim)

Mint fees are transferred **into the contract** via `as-contract` and accumulate
in `season-accumulated`. The contract **holds** the pool. Lifecycle:

1. Owner calls `end-season (game-id)` to close and snapshot pool + top-10.
   Sets `claim-deadline = burn-block-height + CLAIM-WINDOW` in `season-prize`.
2. A top-10 player calls `claim-prize (game-id season)` — the contract computes
   the **tie-fair split-occupied payout** and **transfers STX from the contract
   to the player** (`as-contract (stx-transfer? ...)`). `season-paid` caps total
   distribution. Rejects after the deadline with `ERR-CLAIM-CLOSED (u114)`.
3. After the window closes, **anyone** can call `finalize-season (game-id season)`
   to roll `total − season-paid` (unclaimed shares + integer-division dust) into
   `season-accumulated` for the game's open season. Idempotent via
   `season-finalized` map; rejects if the window is still open
   (`ERR-NOT-FINALIZABLE u116`) or already finalized (`ERR-ALREADY-FINALIZED u115`).
4. There is no owner-initiated payout; Season Admin is read-only for prizes.

Payout math is authoritative **on-chain** via `get-claimable-amount`;
`lib/payout-schedule.ts` mirrors the band schedule off-chain for display +
post-conditions. See [prize-logic.md](prize-logic.md).

## Public functions (v4 additions)

- `finalize-season (game-id season)` — permissionless; rolls unclaimed + dust
  into the current season pool after the claim window closes. Idempotent.

## Read-only functions (v4 additions)

- `get-claimable-amount (game-id season player)` — returns the tie-fair payout
  amount for a player in a closed season (0 if not claimable / already claimed).
- `is-claim-open (game-id season)` — returns `true` if the claim window is still
  open (current burn-block ≤ claim-deadline).
- `get-season-finalized (game-id season)` — returns `true` if `finalize-season`
  has been called for that season.

## Ownership

`get-contract-owner` is the authoritative owner read-only. `transfer-ownership`
can change it, so never compare against the deployer address heuristically.

## Error codes

`u100` not-owner · `u101` not-in-top-ten · `u102` already-claimed ·
`u104` score-too-high · `u105` season-not-closed · `u106` empty-pool ·
`u107` prize-not-found · `u108` mint-limit-reached · `u109` game-exists ·
`u110` no-game · `u111` bad-fee · `u112` game-inactive · `u113` season-still-open ·
`u114` claim-closed (`ERR-CLAIM-CLOSED`) · `u115` already-finalized
(`ERR-ALREADY-FINALIZED`) · `u116` not-finalizable (`ERR-NOT-FINALIZABLE`).

## Rules

- `stacks-block-height`, not `block-height` (Clarity 3/epoch-3 canonical name).
- ASCII only — Clarity rejects em-dash, smart quotes, etc. in `.clar`.
- Don't add public functions without tests; keep synced with spec §7.
- Other `*-score.clar` files (snake/tetris/pacman/breakout) are the superseded
  per-game v2 contracts; `xp-arcade-v3.clar` is the superseded v3 registry;
  `xp-arcade-v4.clar` is the live contract.
