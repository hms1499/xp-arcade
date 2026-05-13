# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

**Pre-implementation.** Only the design spec exists at `docs/superpowers/specs/2026-05-13-xp-snake-stacks-design.md`. There is no application code, no build, no tests yet. Read the spec before doing anything — it is the source of truth for what is being built.

## What this project is

A hackathon MVP: a **Snake game with Stacks blockchain integration**, themed as a **Windows XP desktop**. Two on-chain artifacts via a single SIP-009 Clarity contract:

- **Score NFTs** — minted post-game at the player's discretion (`mint-score`)
- **Trophy NFTs** — claimable once per season by players currently in the on-chain top-10 (`claim-trophy`); rank determines tier (Gold / Silver / Bronze / Top 10)

The on-chain top-10 is maintained inside the contract via insertion sort during `mint-score`, so the leaderboard read is a single read-only call (`get-top-ten`) rather than scanning all minted tokens off-chain.

## Architectural decisions worth knowing

These are non-obvious choices baked into the design — preserve them unless explicitly revisiting:

- **Two NFT types in one contract.** `snake-score` exposes the SIP-009 trait for marketplace compatibility; `snake-trophy` uses non-trait functions (`transfer-trophy`, `get-trophy-owner`, `get-trophy-uri`) since SIP-009 is one-token-type-per-trait.
- **Each game is independent.** Players may mint multiple score NFTs per address. `best-score` only updates when a new mint beats the player's previous best — that is what feeds the leaderboard.
- **Trophy rank is locked at claim time**, not recomputed if the player is later bumped. This is an intentional MVP simplification.
- **Score is client-trusted.** No on-chain verification of gameplay. Documented limitation; do not invent anti-cheat scope without asking.
- **Reward = NFT only.** No prize pool, no STX/sBTC payouts. Avoid scope creep into escrow logic.
- **Token URIs point to Next.js API routes** that read on-chain data and return SIP-016 JSON with inline SVG `image` data-URLs. No external image hosting.
- **Window manager state is Zustand.** Each window subscribes to its slice; the manager is ~50 lines, not a full OS simulation.
- **XP UI is desktop-first by design.** Mobile gets a minimal responsive fallback, not parity.

## Planned tech stack

When implementation begins, default to:

- Smart contract: **Clarity**, tested with **Clarinet + `@hirosystems/clarinet-sdk` + Vitest**, deployed via `clarinet deployments apply --testnet`
- Frontend: **Next.js 16 App Router + TypeScript**, **xp.css** for component styling, **Tailwind** for layout glue, **Zustand** for window manager and wallet state
- Stacks SDK: `@stacks/connect`, `@stacks/transactions`, `@stacks/network`
- Snake engine: pure module (`lib/snake-engine.ts`) with no DOM dependencies — unit-tested directly with Vitest
- Deploy: **Vercel** (frontend), **Stacks testnet** (contract). No mainnet.

Required Vercel env vars (per spec §9): `NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_NETWORK=testnet`, `NEXT_PUBLIC_APP_URL`.

## Commands

None yet — no `package.json`, no `Clarinet.toml`. After scaffolding, update this section with the actual commands (`pnpm dev`, `clarinet test`, etc.) instead of guessing.

## When working in this repo

- Treat the spec as authoritative. If a request conflicts with it, surface the conflict before coding.
- Keep contract changes synced with the test list in spec §7.
- The hackathon timeline (spec §11) is tight — push back on scope additions unless the user explicitly accepts the trade-off.
