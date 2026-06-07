# Handoff — XP Arcade on Stacks

**Status as of 2026-06-07:** Single registry contract **`xp-arcade-v4` deployed to mainnet** (block 8209345, Clarity 3). All 4 games registered on-chain (verified). Trustless pool + tie-fair atomic self-claim + burn-block claim window + permissionless `finalize-season` live. `set-base-uri` set to the production domain (`get-token-uri` verified on-chain). Frontend code (`game-registry.ts`, `.env.local`) already points to v4. **Remaining: set Vercel `NEXT_PUBLIC_CONTRACT_ADDRESS` to v4 + redeploy production frontend, then a live-wallet smoke test.**

---

## Live state

| Thing | Value |
|---|---|
| Network | Stacks **mainnet** |
| Active contract | `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4` (Clarity 3, block 8209345, 2026-06-07) |
| Previous contract (frozen) | `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v3` (block 8114387; still on mainnet, no longer wired to frontend) |
| Registered games (on-chain id) | Snake (1) · Tetris (2) · Pac-Man (3) · XP Bricks (4) — all active |
| SIP-009 NFT asset | `…xp-arcade-v4::xp-score` |
| Base-uri | `https://xp-snake.vercel.app/api/metadata/score/` (set via `set-base-uri`; re-callable) |
| Deployer / `contract-owner` | `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV` |
| Deploy fee | ~0.5 STX |
| Tests | contract: 139 ✓ · frontend: 142 ✓ · `typecheck`: clean · `build`: clean |
| GitHub | `https://github.com/hms1499/xp-snake` (default branch: `main`) |

> Legacy v1/v2 per-game contracts remain on mainnet but are frozen and no longer wired to the frontend. Their `.clar` sources stay in `contract/contracts/` for reference.

To check live on-chain state, query the contract via Hiro Explorer or `clarinet console` (e.g. `get-current-season`, `get-game`, `get-top-ten-by-season`).

---

## What changed (v3 cutover)

| Area | Summary |
|---|---|
| Contract | New `xp-arcade-v3.clar`: single registry (`register-game`/`set-game-active`), trustless `as-contract` pool, **atomic `claim-prize` STX payout** (idempotent, capped to pool), per-game data-driven rarity, per-game/season mint cap, fixed `get-token-uri` (concats token-id), `get-contract-owner` + `get-owner` read-onlys, `transfer-ownership`. |
| Deploy | `xp-arcade-v3` deployed to mainnet; all 4 games registered. Plans committed in `contract/deployments/` (`xp-arcade-v3*.mainnet-plan.yaml`). |
| `set-base-uri` | Set to `https://xp-snake.vercel.app/api/metadata/score/`. Verified: `get-token-uri(u1)` → `…/score/1`. |
| Frontend | Repointed to the single v3 contract; `game-registry.ts` carries `onchainId` per game; every `*ForGame` call prepends the game-id; `claimPrizeV3` + **Claim UI in HighScoreWindow** (post-condition `willSendLte(payout)`); SeasonAdminWindow gutted to End Season + read-only; metadata collapsed to one route `/api/metadata/score/[id]`. |
| Cleanup | Deleted dead v2 payout modules (payout-ledger/reconciliation/payout-csv/payout-memo/stx-balance/payout-safety + tests). |
| Docs | README + this HANDOFF rewritten for v3. |

---

## To-do for next session

### 0. Deploy `xp-arcade-v4` (tie-rank fairness) — LIVE on mainnet (2026-06-07)

`xp-arcade-v4.clar` is live: tie-fair split-occupied payout, burn-block claim
window (`CLAIM-WINDOW = u4320` ≈ 30 days), permissionless `finalize-season`.
Contract suite 139 ✓; frontend 142 ✓ · tsc clean · build ✓.

- [x] Deploy `xp-arcade-v4` (tx `0x5924dcde…`, block 8209345, 2026-06-07).
- [x] `register-game` ×4 — Snake (1) · Tetris (2) · Pac-Man (3) · XP Bricks (4), same fees + rarity as v3.
- [x] `set-base-uri` → `https://xp-snake.vercel.app/api/metadata/score/`; verified `get-token-uri(u1)` → `…/score/1`.
- [ ] Set Vercel `NEXT_PUBLIC_CONTRACT_ADDRESS=SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4` + redeploy production frontend. (Local `frontend/.env.local` and `game-registry.ts` already point to v4.)
- [ ] Live-wallet smoke (see §2) **plus v4-specific**: claim **before** window closes works; claim **after** window → "Claim window closed" label (no button) / `ERR-CLAIM-CLOSED`; after window, anyone calls `finalize-season` → unclaimed rolls into the current pool (`get-prize-pool-balance` increases, `get-season-finalized` → true).
- v3 wind-down: let any v3 top-10 players claim their share on v3 independently; no migration of v3 state or funds.

### 1. Set Vercel env + redeploy

- [ ] In Vercel Project Settings, set:
  - `NEXT_PUBLIC_CONTRACT_ADDRESS=SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4`
  - `NEXT_PUBLIC_NETWORK=mainnet`
  - `NEXT_PUBLIC_APP_URL=https://xp-snake.vercel.app`
  - `NEXT_PUBLIC_SEASON_END_ISO=<ISO 8601 UTC>`
- [ ] Redeploy. (Local `frontend/.env.local` and `game-registry.ts` already point at v4.)
- [ ] After deploy: fetch `https://xp-snake.vercel.app/api/metadata/score/1` → expect SIP-016 JSON with an `image` field (needs token #1 to exist on-chain).

### 2. Live-wallet smoke test

Walk through with the **owner wallet** and a **second non-owner wallet** on mainnet. The pool is trustless now — payouts are **self-claimed**, not owner-sent.

**As non-owner player:**
- [ ] Boot → desktop, taskbar + Start menu load
- [ ] Start → no "Season Admin" entry (hidden from non-owners)
- [ ] Connect wallet (Leather / Xverse mainnet) → tray shows address
- [ ] Play each game → game over → SharedMintDialog shows the right fee (Snake 0.01 STX, others 0.02 STX) and remaining mints (cap 10/game/season)
- [ ] Mint → wallet shows the mint-fee post-condition → confirm → balloon "submitted" → ~30s → "confirmed"
- [ ] My NFTs → score NFT renders with inline SVG + rarity badge (game-colored)
- [ ] High Score → per-game tab shows real addresses + scores (no "undefined"/NaN); countdown ticks
- [ ] After a season is ended, if in that season's top-10: a **Claim** button appears → click → wallet shows the inbound STX (post-condition `willSendLte`) → confirm → STX arrives, button becomes claimed/idempotent

**As owner:**
- [ ] Connect with `SP2C...3SV` → Start menu shows 🛠️ "Season Admin"
- [ ] Season Admin → pre-flight summary (season/pool/ranked/ties) matches on-chain
- [ ] End Season → confirm → wallet popup → tx submits → window reloads, new season starts
- [ ] Confirm payouts require **no owner action** — winners self-claim (see player flow)

### 3. Optional

- [ ] `set-season-end-block` per game for an on-chain deadline (countdown is off-chain build-time otherwise — not required).
- [x] ~~Switch `isOwnerAddress` to `get-contract-owner`~~ — done: `lib/owner.ts` (`useIsOwner`/`resolveIsOwner`) compares against the on-chain owner (session-cached, fails safe). Heuristic removed.
- [ ] Playwright smoke coverage (desktop boot, game launch, mint, High Score, My NFTs empty/error, mobile controls).

---

## Known limitations / quirks (carry forward)

1. **Score is client-trusted.** No on-chain anti-cheat. Score cap (`u9999`) + mint cap (10/game/season) limit abuse. Mention in the demo.
2. **Soft deadline only.** `NEXT_PUBLIC_SEASON_END_ISO` is display-only; doesn't block mints. Owner calls `end-season` (or anyone, once an on-chain `season-end-block` is set and reached).
3. **Rarity thresholds + fees are permanent per game.** Set at `register-game`; no update function — only `set-game-active` can toggle a game. Choose carefully before registering.
4. **Owner detection still heuristic in the frontend.** `isOwnerAddress` uses `addr === stacks.contractAddress`. The contract now exposes `get-contract-owner`, so this *could* be made authoritative — but the frontend doesn't call it yet. Breaks if `transfer-ownership` is ever used.
5. **base-uri is a single string ≤ 80 chars.** `get-token-uri` = `base-uri + token-id`. If the production domain changes, re-call `set-base-uri` with `<domain>/api/metadata/score/`.
6. **No path with spaces.** Vitest's worker pool fails on URL-encoded paths — keep the repo at `Desktop/xp-snake/`.
7. **MCP `aibtc` wallet is not the owner.** It's `SP3BM...`, not the deployer `SP2CMK...`, so it cannot run owner-only calls (`register-game`, `set-base-uri`, `end-season` before deadline). Use the deployer wallet via a Clarinet plan (`-p <plan> -d --no-dashboard`, never `-c` on mainnet — it recomputes the fee).
8. **Tie-rank claim fairness — FIXED in v4 (LIVE on mainnet).** In v3, rank =
   `1 + count(strictly higher scores)`, so tied scores shared a rank and the pool
   could be exhausted by early claimers. **`xp-arcade-v4`** (live, block 8209345)
   fixes this: split-occupied payout is order-independent (tied players share the
   combined value of the positions they occupy), `finalize-season` rolls dust +
   unclaimed into the next pool (nothing locked forever). The contract is live and
   the frontend code already points to v4 — **the production app will serve this
   fix once the Vercel env is updated and redeployed** (§0 / §1).

---

## Files / structure cheat-sheet

| Where | What |
|---|---|
| `contract/contracts/xp-arcade-v4.clar` | All active on-chain logic (single registry) |
| `contract/contracts/xp-arcade-v3.clar` | Frozen reference (superseded by v4; still on mainnet) |
| `contract/contracts/nft-trait.clar` | SIP-009 trait (used by frozen legacy contracts) |
| `contract/tests/xp-arcade-v4.test.ts` | v4 Vitest suite (139 tests) |
| `contract/deployments/xp-arcade-v4*.mainnet-plan.yaml` | Deploy / register-games / set-base-uri plans |
| `frontend/lib/game-registry.ts` | gameId ↔ onchainId, shared contract, mint fee, nftAssetName |
| `frontend/lib/contract-calls.ts` | Read/write helpers; `*ForGame` prepend game-id; `claimPrizeV3` |
| `frontend/lib/metadata-route.ts` | `scoreMetadataResponseV3` (on-chain lookup → SIP-016 JSON + SVG) |
| `frontend/lib/payout-schedule.ts` | Rank → prize-split fractions |
| `frontend/components/windows/HighScoreWindow.tsx` | Per-game leaderboards + Claim button |
| `frontend/components/windows/SeasonAdminWindow.tsx` | Owner-only End Season + read-only views (exports `isOwnerAddress`) |
| `frontend/.env.local` | Local mainnet config (gitignored; already points at v4) |

---

## Pointers

- README at the repo root has the full project overview + commands
- v3 design spec (historical): `docs/superpowers/specs/2026-05-22-v3-trustless-claim-design.md`
- v3 plans (historical): `docs/superpowers/plans/2026-05-28-xp-arcade-v3-contract.md`, `docs/superpowers/plans/2026-05-28-frontend-v3-cutover.md`
- v4 design spec (historical): `docs/superpowers/specs/2026-06-06-tie-rank-fairness-v4-design.md`
- v4 plan (historical): `docs/superpowers/plans/2026-06-06-tie-rank-fairness-v4.md`
- Repo conventions (for AI assistants): `CLAUDE.md`
