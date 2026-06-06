# Architecture Decisions (non-obvious, preserve unless told otherwise)

These are deliberate choices. Do not "fix" them without explicit instruction.

- **One v3 registry contract for all games.** `xp-arcade-v3` keys every map by
  `game-id`; games are registered on-chain. The per-game `*-score.clar` files
  are superseded v2 contracts. See [contract.md](contract.md).

- **Two NFT types historically.** v2 exposed SIP-009 Score NFTs plus parallel
  non-trait Trophy functions. Trophy UI was dropped (commit `5019071`); if a
  future iteration wants trophies, the frontend (and its metadata route) needs
  re-adding.

- **Top-10 is unsorted on-chain.** Insertion-sort in Clarity was abandoned for
  simpler min-eviction; frontend sorts on read. Revisit here only if a
  marketplace ever needs an authoritative ranked on-chain list.

- **Score is client-trusted.** No on-chain gameplay verification (documented
  limitation). `MAX-SCORE u9999` caps worst-case abuse. Don't invent anti-cheat
  scope without asking.

- **Prize pool held in-contract; trustless on-chain claim (v3).** `mint-score`
  routes fees to the contract (`as-contract`); `claim-prize` computes the rank
  split and transfers STX to the player (`as-contract`). Players claim from the
  High Scores window; Season Admin is read-only. This is the v3 rewrite of v2's
  tracked-not-held / owner-initiated model. See [prize-logic.md](prize-logic.md).

- **`get-token-uri` appends `token-id`** in v3 (`concat base-uri token-id`) — the
  v2 static-base-URI 404 bug is fixed. `as-contract` is now used (it funds the
  trustless claim), so the v2 "fee goes to owner / URI ignores id" quirks no
  longer apply to the live contract.

- **Tie-rank claim fairness.** Rank = `1 + count(strictly higher scores)`, so
  tied scores share a rank and can each compute the same %. The
  `min(payout, remaining)` cap prevents pool over-payment, but distribution is
  claim-order-dependent under ties (late claimers may get `ERR-EMPTY-POOL`).
  Stranded dust / unclaimed shares stay locked (no owner sweep — trustless
  trade-off). Don't "fix" silently; treat as a known limitation.

- **Owner detection is authoritative (v3).** `lib/owner.ts` compares against the
  on-chain `get-contract-owner` (session-cached, fails safe to `false`). Stays
  correct after `transfer-ownership`. Async, so "loading" = not-owner.

- **`cvToValue` does NOT recurse** in `@stacks/transactions` v7. Strip nested
  `{type,value}` with `lib/cv-unwrap.ts`'s `unwrap()` (separate file to avoid
  the `"use client"` boundary in API routes).

- **Wallet post-conditions are required** for any token-moving write (wallets
  default to deny).

- **Zustand is split into focused stores** — do not merge into one god-store.

- **`@stacks/connect` v8 API** (`connect`/`disconnect`/`isConnected`/
  `getLocalStorage`), not the older `AppConfig`/`UserSession`/`showConnect`.

- **`stacks-block-height`**, not `block-height` (Clarity 3 / epoch-3 rename).

- **Season countdown is off-chain & build-time** (`NEXT_PUBLIC_SEASON_END_ISO`);
  owner must still call `end-season` manually.

- **XP UI is desktop-first**; mobile is a minimal fallback, not parity. Keep the
  original Windows-95 BootScreen look.

> Spec is authoritative for *intent*; code is authoritative for *current state*.
> If a request conflicts with the spec, surface the conflict before coding.
