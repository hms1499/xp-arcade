# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

**Deployed to Stacks mainnet (2026-05-14):** `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.{snake-score,nft-trait}`. Frontend wired to mainnet; Trophy UI removed; claim-prize UI removed (2026-05-16); Season Admin window + soft countdown live. **Only Vercel deploy + production smoke test remain.** Read `HANDOFF.md` first for the live to-do list and the current commit log. The v2 design spec is `docs/superpowers/specs/2026-05-14-snake-score-nft-v2-design.md` and the v2 implementation plan is `docs/superpowers/plans/2026-05-14-snake-score-nft-v2.md`.

## Workspaces

```
contract/   Clarinet project — Clarity SIP-009 NFT contract + Vitest tests
frontend/        Next.js 16 App Router app — XP-themed desktop UI
docs/       spec, plan, design notes
HANDOFF.md  user-facing to-do list (deploy, smoke test, Vercel)
```

## Commands

### contract/
```bash
cd contract
npm test                       # all Clarinet tests (34 passing)
clarinet check                 # syntax check the .clar contracts
clarinet console               # REPL against simnet for ad-hoc calls
clarinet deployments generate --mainnet --low-cost
clarinet deployments apply --mainnet --no-dashboard -c  # uses mnemonic from settings/Mainnet.toml
```

### frontend/
```bash
cd frontend
npm run dev                    # Next dev server on :3000 (Turbopack)
npm run build                  # production build
npm test                       # Vitest (snake-engine + metadata-svg, 6 passing)
npx tsc --noEmit               # full type-check
npm run lint
```

## What this project is

A hackathon MVP: a **Snake game with Stacks blockchain integration**, themed as a **Windows XP desktop**. One SIP-009 Clarity contract exposes:

- **Score NFTs** — minted post-game at the player's discretion (`mint-score`, 0.01 STX fee)
- **On-chain leaderboard** — top-10 maintained inside the contract
- **Prize pool** — every mint fee accumulates into the current season; owner closes via `end-season`. Prize distribution is **owner-initiated only** via Season Admin's "Send STX" button. Players have no in-app claim flow.

The contract also still exposes **Trophy NFT** functions (`claim-trophy`, `get-trophy-data`, etc.) — they shipped on mainnet but the UI was dropped in commit `5019071` because trophies overlapped with Score NFTs in practice. If a future iteration wants trophies, only the frontend needs to be re-added.

The contract also still exposes `claim-prize` / `has-claimed-prize` / `get-season-prize` and the frontend helpers in `contract-calls.ts` remain — but the in-app claim UI (prize discovery in LeaderboardWindow, claim button, payout display) was removed on 2026-05-16. Do not re-add without explicit instruction.

The on-chain top-10 is maintained inside the contract — when full, the lowest score is evicted if the new score beats it. The list is **not sorted on-chain**; the frontend sorts on read. Rank inside `claim-prize` is computed via fold (count of entries with strictly higher score) without needing a sort — this is still on-chain but not surfaced in UI.

## Architectural decisions worth knowing

These are non-obvious choices baked in — preserve them unless the user explicitly revisits:

- **Two NFT types in one contract.** `snake-score` exposes the SIP-009 surface (`transfer`, `get-owner`, `get-token-uri`). `snake-trophy` uses parallel non-trait functions. UI for trophies was dropped (see status note); the on-chain functions remain.
- **Top-10 is unsorted on-chain.** Insertion-sort in Clarity 4 was attempted and abandoned for the simpler min-eviction approach. If a marketplace ever needs an authoritative ranked list on-chain, this is the place to revisit.
- **Trophy rank is locked at claim time.** Still true at the contract level — do not "fix" by recomputing rank on transfer if trophy UI ever comes back.
- **Score is client-trusted.** No on-chain verification of gameplay. Documented limitation; do not invent anti-cheat scope without asking. Score cap `u9999` reduces worst-case abuse.
- **Prize pool is tracked, not held; claim UI is removed.** `claim-prize` records the owed payout amount and returns `(ok payout)` but does NOT transfer STX. The in-app player claim flow was dropped (2026-05-16) — actual distribution is owner-initiated via `SeasonAdminWindow`'s per-row "Send STX" button (`openSTXTransfer`). `contract-calls.ts` still exports `claimPrize`, `hasClaimedPrize`, `getSeasonPrize`, and `computePayoutUstx` for potential future use, but nothing in the UI calls them.
- **`get-token-uri` returns a static base URI, not a per-token URI.** The deployed contract ignores the `token-id` argument and returns `(var-get base-uri)` unchanged. This means marketplaces that rely on `get-token-uri` will receive a URL without the token ID (e.g. `.../api/metadata/score/` instead of `.../api/metadata/score/1`) and get a 404. Fixing this requires a contract redeploy. The `/api/metadata/score/[id]` route itself is correct — direct URL access works fine. Do not add a "Set Base URI" UI; it is misleading because the root cause is in the contract logic, not the stored string.
- **Mint fee goes to `contract-owner`, not contract address.** Same root cause — `as-contract` isn't used. Fees are paid directly to the deployer wallet.
- **`@stacks/transactions` v7 `cvToValue` does NOT recursively unwrap.** Nested tuples/lists come back as `{type, value: {type, value}}`. We strip them with `lib/cv-unwrap.ts` (`unwrap()`). The helper lives in its own file (not `contract-calls.ts`) so server-side API routes can import it without tripping the `"use client"` boundary.
- **Wallet post-conditions are required for mint.** Wallets default to deny mode and reject any unchecked token movement. `mintScore` declares `Pc.principal(sender).willSendEq(10_000).ustx()` for the mint fee. Add similar PCs to any new write that moves tokens.
- **Owner detection is heuristic.** `SeasonAdminWindow` exports `isOwnerAddress(addr) = addr === stacks.contractAddress`. Works only as long as `transfer-ownership` has never been called. Contract has no read-only for `contract-owner`, so a true check would require a redeploy — accepted MVP tradeoff.
- **Token URIs point to a single Next.js API route** at `/api/metadata/score/[id]`. Trophy metadata route was removed when trophy UI was dropped; if you re-add it, restore the route too.
- **Season countdown is build-time off-chain.** `NEXT_PUBLIC_SEASON_END_ISO` is the soft deadline shown in Leaderboard + Season Admin. Contract has no on-chain duration; owner must still manually call `end-season` to honour it.
- **Zustand state is split into focused stores.** `state/wallet.ts` (connect state), `state/window-manager.ts` (open windows, z-order, positions), `state/toasts.ts` (balloon notifications). Don't merge into one god-store.
- **`@stacks/connect` v8 API.** Use `connect()` / `disconnect()` / `isConnected()` / `getLocalStorage()`. The plan's v7 references (`AppConfig`, `UserSession`, `showConnect`) were superseded.
- **`stacks-block-height`**, not `block-height` (Clarity 4 / epoch 3 rename). Both still work in this epoch, but `stacks-block-height` is the canonical name.
- **XP UI is desktop-first by design.** Mobile gets a minimal responsive fallback, not parity.

## Environment quirks

- **Path must not contain spaces.** Vitest's worker pool fails on URL-encoded paths (`%20`). The project lives at `Desktop/xp-snake/` — do not rename to anything with a space.
- **Vitest 4 is incompatible with `vitest-environment-clarinet` 3.** The contract workspace pins `vitest@^3`. If `clarinet new` regenerates and bumps vitest, downgrade.
- **Clarity rejects non-ASCII.** No em-dash, smart quotes, etc. in `.clar` files. ASCII hyphens only.
- **Path with space artifact:** `npm test` in `frontend/` sometimes prints `Shell cwd was reset to /Users/vanhuy/Desktop/untitled folder` after — harmless leftover from the original directory before the rename. Tests still run from the new path.

## Tech stack (as installed)

- Contract: **Clarity 4**, **Clarinet 3.14**, **`@hirosystems/clarinet-sdk` ^3.9**, **Vitest 3**
- Frontend: **Next.js 16 App Router + TypeScript 5**, **`xp.css`**, **Tailwind v4**, **Zustand 5**
- Stacks SDK: **`@stacks/connect` ^8.2**, **`@stacks/transactions` ^7.4**, **`@stacks/network` ^7.3**
- Deploy targets: **Vercel** (frontend), **Stacks mainnet** (contract — already deployed)

Required Vercel env vars: `NEXT_PUBLIC_CONTRACT_ADDRESS=SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.snake-score`, `NEXT_PUBLIC_NETWORK=mainnet`, `NEXT_PUBLIC_APP_URL=<vercel-domain>`, `NEXT_PUBLIC_SEASON_END_ISO=<ISO 8601 UTC>`. See `frontend/.env.example`.

## When working in this repo

- Spec is authoritative for *intent*; code is authoritative for *current state*. If a request conflicts with the spec, surface the conflict before coding.
- Keep contract changes synced with the test list in spec §7. Don't add public functions without tests.
- The hackathon timeline (spec §11) is tight — push back on scope additions unless the user explicitly accepts the trade-off.
- Manual test checklist lives in `HANDOFF.md` step 3 — run it before claiming the UI works.
- Sound effects (XP `ding`/`error`/`balloon`) are intentionally deferred — they need MP3 assets we can't generate. The plan's Phase 8 task 8.2 has the wire-up snippet.
