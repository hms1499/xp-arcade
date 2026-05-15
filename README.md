# XP Snake on Stacks

A Snake game with on-chain scores and prize pool, wrapped in a Windows XP desktop UI.
Built as a Stacks hackathon MVP; deployed to **Stacks mainnet**.

> Play Snake → mint your score as an NFT → land in the top-10 → claim a share of the
> season's prize pool. Owner closes seasons manually; payouts are sent off-chain.

---

## Live contracts (mainnet)

| Contract | Address |
|---|---|
| `snake-score` (SIP-009 NFT + leaderboard + prize logic) | [`SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.snake-score`](https://explorer.hiro.so/txid/SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.snake-score?chain=mainnet) |
| `nft-trait` (SIP-009 trait) | [`SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.nft-trait`](https://explorer.hiro.so/txid/SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.nft-trait?chain=mainnet) |

Deployer / `contract-owner`: `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV`

---

## Stack

| Layer | Tech |
|---|---|
| Smart contract | Clarity 4 · Clarinet 3.14 · Vitest 3 (`@hirosystems/clarinet-sdk` v3.9) |
| Frontend | Next.js 16 (App Router) · TypeScript 5 · Tailwind v4 · `xp.css` |
| State | Zustand 5 (split: wallet / window-manager / toasts) |
| Stacks SDK | `@stacks/connect` v8 · `@stacks/transactions` v7 · `@stacks/network` v7 |
| Hosting | Vercel (frontend) · Stacks mainnet (contract) |

---

## Features

- 🐍 **Snake game** — classic, arrow-key controls, score capped at 9,999.
- 💾 **Score NFTs (SIP-009)** — mint any game's score for 0.01 STX. Rarity tier (Common → Legendary) derived from score. Image is an inline SVG served from `/api/metadata/score/[id]`.
- 🏆 **On-chain leaderboard** — top-10 maintained inside the contract with min-eviction (list is unsorted on-chain; UI sorts on read).
- 💰 **Prize pool** — every mint fee (0.01 STX) accumulates into the current season's pool counter. Past-season snapshots store the pool total + top-10 at close time.
- 🛠️ **Season Admin (owner-only)** — desktop window visible only to the contract owner: see current season + accumulated pool, end the season, and send STX payouts to each top-10 player for past seasons.
- ⏳ **Soft season countdown** — display-only deadline from `NEXT_PUBLIC_SEASON_END_ISO`, shown in Leaderboard + Season Admin.
- 🪟 **XP desktop UX** — boot screen, taskbar, Start menu, draggable windows, balloon notifications.
- 👤 **Public player profiles** — `/player/<stx-address>` shows that player's score NFTs, best score, total mints, seasons played, and mint-fee spend. Linked from every leaderboard row.

---

## Quick start

Prerequisites:
- Node 22+
- A Stacks mainnet wallet (Leather / Xverse) with ≥ 0.02 STX if you want to mint
- [Clarinet 3.14+](https://docs.hiro.so/clarinet/getting-started) if you want to work on the contract

```bash
git clone <this repo>
cd xp-snake

# --- frontend ---
cd frontend
cp .env.example .env.local        # already points at mainnet contract
npm install
npm run dev                       # http://localhost:3000

# --- contract (optional, for tests / re-deploy) ---
cd ../contract
npm install
npm test                          # 34 Vitest tests
clarinet check                    # syntax-check the .clar files
```

### Environment variables

`frontend/.env.local`:

```env
NEXT_PUBLIC_CONTRACT_ADDRESS=SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.snake-score
NEXT_PUBLIC_NETWORK=mainnet
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SEASON_END_ISO=2026-06-01T00:00:00Z
```

Same vars need to be set in Vercel Project Settings for deployment.

---

## Project layout

```
contract/                 Clarinet project
  contracts/
    nft-trait.clar        SIP-009 trait
    snake-score.clar      Score NFT + leaderboard + prize pool
  tests/                  Vitest tests (34 passing)
  deployments/            Generated plans (simnet / testnet / mainnet)

frontend/                 Next.js App Router
  app/
    page.tsx              Composes BootScreen + Desktop + windows
    api/metadata/score/   On-chain → SIP-016 JSON + inline SVG
  components/
    desktop/              BootScreen, Desktop, Taskbar, StartMenu, SystemTray
    windows/              GameWindow, LeaderboardWindow, MyNftsWindow, SeasonAdminWindow
    dialogs/              MintDialog, AboutDialog, BalloonNotification
  lib/
    contract-calls.ts     All read/write helpers (mintScore, getTopTen, endSeason, ...)
    cv-unwrap.ts          Recursively strips @stacks/transactions v7 {type, value} wrappers
    season-countdown.ts   useSeasonCountdown hook + formatter
    stacks.ts             Network + contract id from env
    snake-engine.ts       Pure game-loop logic (unit-tested)
    metadata-svg.ts       SVG generation for score NFTs
  state/
    wallet.ts             Connected address
    window-manager.ts     Open windows, z-order, positions
    toasts.ts             Balloon notifications

docs/                     Design spec + implementation plan
HANDOFF.md                Live operational notes
CLAUDE.md                 Repo conventions (for AI assistants)
```

---

## Architecture notes

These choices are non-obvious; preserve unless you have a reason to revisit.

- **Single contract holds the SIP-009 NFT, the leaderboard, and the prize-pool logic.** Marketplaces would prefer one contract per NFT type, but the state-plumbing duplication wasn't worth it for an MVP. Trophy NFTs were originally part of this too — removed from the UI in v3 because they overlapped with Score NFTs in practice; the contract still exposes the functions.
- **Top-10 is unsorted on-chain.** Insertion-sort in Clarity 4 was attempted and abandoned. Eviction uses fold-min; rank for `claim-trophy` / `claim-prize` is computed via fold (count entries with strictly higher score).
- **Score is client-trusted.** No on-chain proof of gameplay. The `u9999` cap reduces worst-case abuse.
- **Mint fee goes directly to `contract-owner`, not the contract address.** Contract only increments an accounting counter (`season-accumulated`). Real STX lives in the owner's wallet — this is *why* prize payouts are off-chain.
- **`claim-prize` is record-only.** It returns `(ok payout)` and marks the player as claimed but does not transfer STX. The owner sends STX manually (Season Admin window has a per-row "Send STX" button that wraps `openSTXTransfer`).
- **Trophy rank is locked at claim time.** Snapshots are immutable once `end-season` runs.
- **Season end is fully manual.** No on-chain block height or timestamp target. The countdown surfaced in the UI is a soft deadline from env config — owner still has to call `end-season` to honour it.

---

## Known limitations

1. **Off-chain payouts.** Owner must manually `stx-transfer` STX to each claimant after `claim-prize`. Mitigated by Season Admin UI (one-click per recipient).
2. **`as-contract` not used.** All STX moves through the owner's wallet, not the contract address.
3. **Client-trusted scores.** Easy to forge if you call the contract directly. Acceptable for hackathon scope.
4. **Soft deadline only.** Mints submitted after `NEXT_PUBLIC_SEASON_END_ISO` still count until the owner closes the season.
5. **Owner detection in UI is heuristic.** "Season Admin" menu item appears when `wallet.address === stacks.contractAddress`. If `transfer-ownership` is called on mainnet, this no longer reflects reality (contract has no read-only for `contract-owner`).
6. **Path must not contain spaces.** Vitest's worker pool fails on URL-encoded paths. Keep the repo under a space-free directory.

---

## Operating the contract (for the owner)

A typical season cycle:

1. Players mint scores → 0.01 STX per mint flows into the owner wallet; pool counter grows.
2. Top-10 updates live; players watch the Leaderboard with the countdown.
3. Around the soft deadline, owner connects with the deployer wallet, opens **Start → Season Admin**, clicks **End Season**, confirms in wallet, and waits for the tx to mine.
4. The new season starts automatically (no Start Season action — `current-season` just increments).
5. Past-season snapshot now appears in Season Admin. Players in that snapshot can click **Claim Prize** in the Leaderboard window to record their claim on-chain.
6. Owner reviews the past-season table in Season Admin and clicks **Send STX** on each row to ship the payout. Tracking which rows have been paid is off-chain — keep your own ledger.

Payout split per closed season: `top 1-3 = 20%` each, `top 4-10 = 4/70 ≈ 5.71%` each. If fewer than 10 entries existed, the leftover stays in the owner wallet (no rollover).

---

## Tests

```bash
# contract
cd contract && npm test          # 34 Vitest tests

# frontend
cd frontend && npm test          # 6 Vitest tests (snake-engine + metadata-svg)
cd frontend && npx tsc --noEmit  # type-check
```

---

## Deploying changes

### Contract (mainnet — costs real STX)

```bash
cd contract
# Edit settings/Mainnet.toml with your encrypted mnemonic
clarinet deployments generate --mainnet --low-cost
# Review default.mainnet-plan.yaml
clarinet deployments apply --mainnet --no-dashboard -c
```

The contract is **immutable** once deployed. Changes require a new deploy and a new contract address (update `NEXT_PUBLIC_CONTRACT_ADDRESS`).

### Frontend (Vercel)

`git push` to the deployment branch. Make sure the four `NEXT_PUBLIC_*` env vars are set in Vercel Project Settings for the relevant environment.
