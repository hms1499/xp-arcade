# Frontend Cutover to xp-arcade-v3 — Design Spec

**Date:** 2026-05-28
**Status:** Approved design, ready for implementation plan.
**Depends on:** `docs/superpowers/specs/2026-05-22-v3-trustless-claim-design.md` (§6, §7, §11.8 authoritative) and the completed `contract/contracts/xp-arcade-v3.clar` (all 13 contract tasks done, 41 v3 tests green, simnet-only — NOT yet deployed).

## 1. Motivation

The four per-game v2 contracts (`snake-score-v2`, `tetris-score-v2`, `pacman-score-v2`, `breakout-score-v1`) are replaced by a single multi-game registry contract `xp-arcade-v3`. The registry keys every piece of state by `game-id` (uint), holds the prize pool in-contract (`as-contract`), and supports trustless player-pull `claim-prize`. The frontend must:

1. Repoint all contract calls to the one shared contract, passing `game-id` on every call.
2. Add the player claim UI that v2 deliberately omitted (owner-initiated payout is replaced by trustless claim).
3. Hard-delete the obsolete owner-payout machinery.

## 2. Scope

### In-scope (this plan)
- Config rewiring: `game-registry.ts` (`onchainId`, shared contract name/asset) + `stacks.ts` (retarget the contract-id guard).
- Call layer: rewrite `*ForGame` helpers to the single v3 contract with a prepended `game-id` arg; delete legacy snake-only duplicates and migrate their call-sites; add `claimPrizeV3`.
- Claim UI in `HighScoreWindow`.
- Season Admin gutted to End Season + read-only.
- Metadata route resolves game by token's on-chain `game-id`.
- Hard-delete the retire list and tests once consumers are gone.

### Out-of-scope
- Deploying `xp-arcade-v3`, calling `register-game`, and setting Vercel env — **manual preconditions** (see §8).
- Re-adding Trophy NFTs (omitted by D7).
- Any contract change — the contract is frozen and complete.
- Marketing/announcement of the v2→v3 cutover.

## 3. Decisions (locked)

- **D-deploy:** Deploy + `register-game` + env are a **precondition**, not a plan task. The frontend code must work as soon as `NEXT_PUBLIC_CONTRACT_ADDRESS` points at the deployed `<deployer>.xp-arcade-v3` and all games are registered on-chain.
- **D-claim-location:** Player claim UI lives in `HighScoreWindow` (the main per-game leaderboard window).
- **D-season-admin:** `SeasonAdminWindow` is cut to **End Season + countdown + read-only season views**. All owner-payout controls (Send STX / Retry / Batch / Reconciliation / CSV / Balance banner) are removed.
- **D-dead-code:** The obsolete owner-payout modules are **hard-deleted in this plan**, each only after its consumers are removed so every commit stays green.

## 4. Architecture

### 4.1 Config layer

**`lib/game-registry.ts`**
- `GameDef` gains `onchainId: number`. Static map: `snake=1, tetris=2, pacman=3, breakout=4`.
- `contractName` becomes a single shared constant `"xp-arcade-v3"` for every game (was per-game v2 names). `nftAssetName` becomes the shared `"xp-score"`.
- `contractAddress` stays `MAINNET_DEPLOYER` for all games (one contract).
- `validateGameDef` extends to require a positive integer `onchainId`, unique across games.
- `expectedPrimaryContractId` returns the shared `<deployer>.xp-arcade-v3`.
- Add a helper `onchainIdFor(gameId: GameId): number` and the reverse `gameIdFromOnchain(n: number): GameId` (for the metadata route).

**`lib/stacks.ts`**
- `parseContractId` currently throws unless `NEXT_PUBLIC_CONTRACT_ADDRESS` equals the Snake contract. Retarget the guard to expect the shared v3 contract id (still validate `ADDRESS.contract-name` format + match `expectedPrimaryContractId()`). The `stacks.contractAddress` / `stacks.contractName` exports now resolve to the v3 contract.

### 4.2 Call layer — `lib/contract-calls.ts`

- `gameBase(gameId)` resolves to the single v3 contract (address + `xp-arcade-v3`) for every game. (Since the contract is shared, this is effectively constant, but keep the per-game signature so the call sites read clearly.)
- Every `*ForGame` helper **prepends `uintCV(onchainIdFor(gameId))`** to `functionArgs`:
  - `mint-score`: `[uintCV(onchainId), uintCV(score), stringAsciiCV(name.slice(0,24))]`, post-condition `Pc.principal(sender).willSendEq(g.mintFeeUstx).ustx()`.
  - `get-top-ten`, `get-last-token-id`, `get-current-season`, `get-prize-pool-balance`: `[uintCV(onchainId)]`.
  - `get-best-score`, `get-mints-remaining`: `[uintCV(onchainId), principalCV(player)]`.
  - `get-season-prize`: `[uintCV(onchainId), uintCV(season)]`.
  - `has-claimed-prize`: `[principalCV(player), uintCV(onchainId), uintCV(season)]` (note the contract's arg order is player, game-id, season).
  - `end-season`: `[uintCV(onchainId)]`.
- **Delete the legacy snake-only duplicates**: `mintScore`, `getTopTen`, `getBestScore`, `getLastTokenId`, `getPrizePoolBalance`, `getSeasonPrize`, `hasClaimedPrize`, `getCurrentSeason`, `endSeason`. Migrate their call-sites (`components/game/GameCanvas.tsx` lines ~55/313 `getBestScore`, `components/dialogs/MintDialog.tsx` line ~51 `mintScore`, `components/dialogs/AboutDialog.tsx` line ~18 `getLastTokenId`) to the `*ForGame` variants with the game's id.
- **Add** `claimPrizeV3(gameId: GameId, season: number, senderAddress: string): Promise<string>` wrapping `openContractCall("claim-prize", [uintCV(onchainId), uintCV(season)])`. The contract pays out via `as-contract`, so the wallet sees STX arriving at the player — add the matching post-condition allowing the contract principal to send up to the computed payout (`Pc.principal(<v3 contract id>).willSendLte(payoutUstx).ustx()`), since wallets default to deny.
- Keep `computePayoutUstx` (drives the "Claim X STX" amount). Delete `transferStx` only if no consumer remains after Season Admin is gutted — verify with grep before removing.

### 4.3 Claim UI — `components/windows/HighScoreWindow.tsx`

- The window already shows a per-game leaderboard. Add a claim affordance shown when **all** hold:
  1. A connected wallet.
  2. A **closed** season exists (`season < get-current-season(gameId)`) with a `get-season-prize(gameId, season)` snapshot whose top-10 contains the wallet.
  3. `has-claimed-prize(player, gameId, season)` is false.
- Compute rank from the snapshot (count of strictly-higher scores + 1), payout via `computePayoutUstx(total, rank)`, render a "Claim X STX" button. On click → `claimPrizeV3` → success toast + tx tracking; on confirm, disable/relabel "Claimed".
- The simplest correct surface: show the claim for the **most-recently closed** season (current − 1) the player won. A full multi-season claim history is out of scope (YAGNI).

### 4.4 Season Admin — `components/windows/SeasonAdminWindow.tsx`

- Remove: Send STX, Retry, Batch-pay, Reconciliation strip, CSV export, STX balance banner, and any payout-ledger wiring.
- Keep: **End Season** (call `endSeasonForGame(gameId)`), the soft countdown (`NEXT_PUBLIC_SEASON_END_ISO`), and a read-only view of current season + pool balance + snapshot per game.
- `isOwnerAddress` heuristic stays (no on-chain owner read; v3 also lacks a public owner getter beyond `get-contract-owner`, which the window may now use to replace the heuristic — optional improvement, flag in plan).

### 4.5 Metadata route — `app/api/metadata/score/[id]/route` + `lib/metadata-route.ts`

- v3 `get-token-uri` concatenates the id, so marketplaces hit `…/score/<id>`.
- The route must read `get-score-data(id)` from the v3 contract, take its `game-id` (uint), map via `gameIdFromOnchain` to the `GameId`, then render the correct game's SVG/attributes. Today the route is Snake-keyed; generalize it to the resolved game.

### 4.6 Retire / hard-delete (after consumers gone)

Delete files + tests, in an order that keeps each commit green:
- `state/payout-ledger.ts` (+ test)
- `lib/reconciliation.ts` (+ test)
- `lib/payout-csv.ts` (+ test)
- `lib/payout-memo.ts` (+ test)
- `lib/stx-balance.ts` (+ test)
- `lib/tx-tracker.ts` (+ test) — only if no remaining consumer.

## 5. Data flow

- **Mint:** game window → `mintScoreForGame(gameId, score, name, addr)` → v3 `mint-score(onchainId, …)` → fee into contract pool → NFT minted, score-data + top-ten + best-score updated per game.
- **Leaderboard:** `getTopTenForGame(gameId)` (unsorted on-chain → sort client-side, unchanged).
- **End season (owner):** Season Admin → `endSeasonForGame(gameId)` → snapshot `{total, top-ten}`, reset pool/top-ten, bump season.
- **Claim (player):** HighScoreWindow detects eligibility from `get-season-prize` + `has-claimed-prize` → `claimPrizeV3(gameId, season, addr)` → contract transfers STX to player via `as-contract`, marks claimed.
- **Metadata:** marketplace → `…/score/<id>` → route reads `get-score-data(id).game-id` → render that game's card.

## 6. Error handling

- All read-only calls already funnel through `unwrap()` (cv-unwrap). New game-id args don't change the unwrap shape.
- Claim: surface contract errs as balloons — `u102` already claimed, `u101` not in snapshot, `u105` season not closed, `u106` empty pool. Disable the button when not eligible rather than relying on revert.
- Post-conditions: mint keeps `willSendEq(fee)`; claim adds a contract-send PC so the wallet doesn't deny the inbound STX. Wrong/missing PCs are the most likely failure — call out explicit verification in the plan.

## 7. Testing

- **Unit (Vitest):** `onchainIdFor`/`gameIdFromOnchain` round-trip + uniqueness; `game-registry` validation accepts the shared contract + onchainId and rejects bad ids; `contract-calls` arg-shaping for each v3 call (mock `@stacks/connect`/`fetchCallReadOnlyFunction`), especially `has-claimed-prize` arg order and `claimPrizeV3` args; `stacks.ts` accepts the v3 contract id and rejects mismatches; metadata route resolves game from a mocked `get-score-data`.
- **Manual (wallet, once env points at deployed v3):** per game — mint → appears on leaderboard → owner ends season → eligible player sees "Claim X STX" → claim succeeds → button shows "Claimed", balance increased; ineligible wallet sees no button.

## 8. Preconditions (manual, before/with cutover)

1. Deploy `xp-arcade-v3` to mainnet (`clarinet deployments apply --mainnet`).
2. Call `register-game` for snake(1)/tetris(2)/pacman(3)/breakout(4) with the matching fees and rarity thresholds.
3. Optionally `set-season-end-block` per game to honor the soft countdown.
4. Set `NEXT_PUBLIC_CONTRACT_ADDRESS=<deployer>.xp-arcade-v3` (+ existing network/app-url/season env) in Vercel and `.env`.
5. v2 final-season payouts settled before announcing the cutover (top-10 resets on v3).

## 9. Open items / risks

- **Claim post-condition shape:** confirm `willSendLte` vs `willSendEq` against the exact payout; the contract caps payout to remaining pool, so `Lte` is safer.
- **`has-claimed-prize` arg order** differs from the other reads (player first) — easy to get wrong; covered by a unit test.
- **Metadata route** generalization touches SVG rendering per game — ensure all four games have card renderers (they exist today per-game).
- **`get-token-uri` static base in v2 is fixed in v3** — no frontend action beyond the route resolving by game-id.
