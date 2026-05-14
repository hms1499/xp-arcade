# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

**Phases 0–8 + contract v2 + frontend v2 implemented and committed. Testnet deploy + Vercel deploy remain.** Read `HANDOFF.md` first for the live to-do list. The v2 design spec is `docs/superpowers/specs/2026-05-14-snake-score-nft-v2-design.md` and the v2 implementation plan is `docs/superpowers/plans/2026-05-14-snake-score-nft-v2.md` — those are the source of truth for v2 intent.

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
clarinet deployments generate --testnet --low-cost
clarinet deployments apply --testnet   # deploys with mnemonic from settings/Testnet.toml
```

### frontend/
```bash
cd frontend
npm run dev                    # Next dev server on :3000 (Turbopack)
npm run build                  # production build
npm test                       # Vitest (snake-engine + metadata-svg, 7 passing)
npx tsc --noEmit               # full type-check
npm run lint
```

## What this project is

A hackathon MVP: a **Snake game with Stacks blockchain integration**, themed as a **Windows XP desktop**. Two on-chain artifacts via a single SIP-009 Clarity contract:

- **Score NFTs** — minted post-game at the player's discretion (`mint-score`)
- **Trophy NFTs** — claimable once per season by players currently in the on-chain top-10 (`claim-trophy`); rank determines tier (Gold / Silver / Bronze / Top 10)

The on-chain top-10 is maintained inside the contract — when full, the lowest score is evicted if the new score beats it. The list is **not sorted on-chain**; the frontend sorts on read. `claim-trophy` computes rank via fold (count of entries with strictly higher score) without needing a sort.

## Architectural decisions worth knowing

These are non-obvious choices baked in — preserve them unless the user explicitly revisits:

- **Two NFT types in one contract.** `snake-score` exposes the SIP-009 surface (`transfer`, `get-owner`, `get-token-uri`). `snake-trophy` uses parallel non-trait functions (`transfer-trophy`-style intent — currently only `get-trophy-owner` + `get-trophy-data` since trophies are not transferable in the MVP). One contract per NFT type would be cleaner for marketplaces but duplicates state plumbing; we accepted the trade-off.
- **Top-10 is unsorted on-chain.** Insertion-sort in Clarity 4 was attempted and abandoned for the simpler min-eviction approach. If a marketplace ever needs an authoritative ranked list on-chain, this is the place to revisit.
- **Trophy rank is locked at claim time.** Documented in `HANDOFF.md` and the spec — do not "fix" by recomputing rank on transfer.
- **Score is client-trusted.** No on-chain verification of gameplay. Documented limitation; do not invent anti-cheat scope without asking. Score cap `u9999` reduces worst-case abuse.
- **Prize pool is tracked, not held.** `claim-prize` records the owed payout amount and returns `(ok payout)` but does NOT transfer STX — `as-contract` is unsupported in the clarinet WASM simnet runtime. Actual distribution must be done off-chain by the contract owner. This is a known v2 limitation documented in `HANDOFF.md`.
- **Mint fee goes to `contract-owner`, not contract address.** Same `as-contract` limitation — fees are paid directly to the deployer wallet.
- **Token URIs point to Next.js API routes** at `/api/metadata/{score,trophy}/[id]`. They read on-chain data and return SIP-016 JSON with inline SVG `image` data-URLs — no external image hosting.
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
- Polish: **`canvas-confetti`** for trophy claim
- Deploy targets: **Vercel** (frontend), **Stacks testnet** (contract)

Required Vercel env vars: `NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_NETWORK=testnet`, `NEXT_PUBLIC_APP_URL`. See `frontend/.env.example`.

## When working in this repo

- Spec is authoritative for *intent*; code is authoritative for *current state*. If a request conflicts with the spec, surface the conflict before coding.
- Keep contract changes synced with the test list in spec §7. Don't add public functions without tests.
- The hackathon timeline (spec §11) is tight — push back on scope additions unless the user explicitly accepts the trade-off.
- Manual test checklist lives in `HANDOFF.md` step 3 — run it before claiming the UI works.
- Sound effects (XP `ding`/`error`/`balloon`) are intentionally deferred — they need MP3 assets we can't generate. The plan's Phase 8 task 8.2 has the wire-up snippet.
