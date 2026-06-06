# CLAUDE.md

High-level index for this repo. Deep detail lives in `.claude/docs/` — follow
the links in **Additional Documentation** before working in a given domain.

> Spec is authoritative for *intent*; code is authoritative for *current state*.
> If a request conflicts with the spec, surface the conflict before coding.

## 1. Project Overview

**XP Arcade** — a Windows-95-themed, multi-game arcade platform with Stacks
blockchain integration. Players play Snake, Tetris, Pac-Man, and XP Bricks
(Breakout); each game mints Score NFTs, maintains an on-chain top-10, and
accumulates mint fees into a per-season prize pool. All games share one on-chain
registry contract, `xp-arcade-v3`, keyed by `game-id`.

## 2. Tech Stack

- **Contract:** Clarity 3 (pinned), Clarinet 3.14, `@stacks/clarinet-sdk` ^3.9,
  Vitest 3. Deployed mainnet:
  `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v3`.
- **Frontend:** Next.js 16 App Router, React 19, TypeScript 5, `98.css`,
  Tailwind v4, Zustand 5.
- **Stacks SDK:** `@stacks/connect` ^8.2, `@stacks/transactions` ^7.4,
  `@stacks/network` ^7.3.
- **Deploy:** Vercel (frontend), Stacks mainnet (contract — already deployed).

Workspaces: `contract/` (Clarinet project) · `frontend/` (Next.js app) ·
`docs/` (specs) · `HANDOFF.md` (user-facing to-do list).

## 3. Dev Commands

```bash
# contract/
cd contract
npm test                       # all Clarinet/Vitest tests
clarinet check                 # syntax-check the .clar contracts
clarinet console               # REPL against simnet

# frontend/
cd frontend
npm run dev                    # Next dev server on :3000 (Turbopack)
npm run build                  # production build
npm test                       # Vitest
npx tsc --noEmit               # full type-check
npm run lint
```

Required Vercel env vars are listed in
[environment-quirks.md](.claude/docs/environment-quirks.md) and
`frontend/.env.example`.

## 4. Core Logic Summary

Mint fees are held **in the contract** (`as-contract`) and accumulate into a
per-game, per-season **prize pool**. After the owner closes a season
(`end-season`), top-10 players claim **trustlessly on-chain** via `claim-prize`,
which computes the rank split and transfers STX with `as-contract`. Split:
**ranks 1–3 get 20% each; ranks 4–10 get ~5.7% (4/70) each**, floored to integer
uStx and capped so total paid never exceeds the pool. The split is authoritative
**on-chain**; `lib/payout-schedule.ts` mirrors it for display + post-conditions.
Players claim from the High Scores window (`claimPrizeV3`); Season Admin is
read-only. Full detail: [prize-logic.md](.claude/docs/prize-logic.md).

## 5. Key Constraints

Never change/assume these without explicit instruction (full list in
[architecture-decisions.md](.claude/docs/architecture-decisions.md)):

- **Path must not contain spaces** — Vitest breaks on `%20`. Keep
  `Desktop/xp-snake/`.
- **Clarity version is 3**, not 4 (`as-contract` breaks under Clarity 4 here).
  `.clar` files are **ASCII only**.
- **Score is client-trusted** (no on-chain anti-cheat); `MAX-SCORE u9999` caps
  abuse. Don't invent anti-cheat scope.
- **Top-10 is unsorted on-chain**; the frontend sorts on read.
- **Prize pool is held in-contract; claims are trustless on-chain** —
  `claim-prize` transfers STX via `as-contract`; players claim from High Scores.
  Do not revert to v2's owner-initiated manual payouts.
- **Owner detection is the on-chain `get-contract-owner`** (`lib/owner.ts`), not
  an address heuristic; async, so "loading" = not-owner.
- **Wallet post-conditions are required** for any token-moving write.
- **Don't add public contract functions without tests** (keep synced with spec
  §7). Don't merge the focused Zustand stores into one.
- **Git:** conventional prefixes, small green commits, no `Co-Authored-By`,
  stage explicit files, commit only when asked. See
  [git-workflow.md](.claude/docs/git-workflow.md).
- **Run the actual build/test and read its output before claiming done.**

## 6. Additional Documentation

- [contract.md](.claude/docs/contract.md) — `xp-arcade-v3` registry: multi-game
  model, Score NFTs, leaderboard, prize pool, ownership, error codes.
- [frontend.md](.claude/docs/frontend.md) — Next.js app layout, Stacks
  integration (`lib/`), Zustand stores, token metadata route.
- [prize-logic.md](.claude/docs/prize-logic.md) — pool accumulation, rank-based
  payout split, distribution flow, season deadline.
- [architecture-decisions.md](.claude/docs/architecture-decisions.md) —
  non-obvious choices to preserve.
- [environment-quirks.md](.claude/docs/environment-quirks.md) — path/Vitest/
  Clarity gotchas + required Vercel env vars.
- [git-workflow.md](.claude/docs/git-workflow.md) — commit conventions
  (this project only).
