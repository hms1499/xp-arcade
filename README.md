# XP Arcade on Stacks

A **multi-game arcade platform** with on-chain scores and trustless prize pools, wrapped in a Windows 95 desktop UI.
Four arcade games — Snake, Tetris, Pac-Man, and XP Bricks — backed by a single SIP-009 score-NFT registry contract.

> Play a game → mint your score as an NFT → land in the top-10 → claim your share of the season's prize pool, paid directly from the contract.

---

## Live contract (mainnet)

All four games share **one** registry contract. Games are added on-chain via `register-game`, not by deploying a new contract per game.

| Contract | Address |
|---|---|
| `xp-arcade-v4` | [`SP2CMK...xp-arcade-v4`](https://explorer.hiro.so/txid/SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4?chain=mainnet) |

Deployed 2026-06-07 (block 8209345, Clarity 3). Registered games (on-chain id): Snake (1), Tetris (2), Pac-Man (3), XP Bricks (4).

Deployer / `contract-owner`: `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV`

> **Legacy:** the earlier per-game v1/v2 contracts (`snake-score-v2`, `tetris-score-v2`, …) and `xp-arcade-v3` remain on mainnet but are frozen and no longer wired to the frontend. Their `.clar` sources stay in `contract/contracts/` for reference only.

---

## Stack

| Layer | Tech |
|---|---|
| Smart contract | Clarity 3 · Clarinet 3.14 · Vitest 3 (`@hirosystems/clarinet-sdk` v3.9) |
| Frontend | Next.js 16 (App Router) · TypeScript 5 · Tailwind v4 · `xp.css` |
| State | Zustand 5 (wallet / window-manager / toasts) |
| Stacks SDK | `@stacks/connect` v8 · `@stacks/transactions` v7 · `@stacks/network` v7 |
| Hosting | Vercel (frontend) · Stacks mainnet (contract) |

> The `xp-arcade-v4` contract is pinned to `clarity_version = 3`: its trustless pool uses `as-contract`, which fails `clarinet check` under Clarity 4 in the installed Clarinet 3.14.1 toolchain.

---

## Features

- 🐍 **Snake** — classic arrow-key controls, +1 per food, 20×20 grid.
- 🧱 **Tetris** — 7 tetrominoes, wall kicks, ghost piece, level speed scaling, next-piece preview.
- 👾 **Pac-Man** — 21×21 maze, 4 ghosts with scatter/chase/frightened AI, power pellets, 3 lives.
- 🏓 **XP Bricks** — Breakout-style paddle/brick arcade game with lives, combos, level clear bonuses, and touch controls.
- 💾 **Score NFTs (SIP-009)** — mint any score post-game. Snake: 0.01 STX · other games: 0.02 STX. **Capped at 10 mints per player per game per season.** Metadata served from a single route `/api/metadata/score/[id]` (the game is resolved from the on-chain game-id).
- 🏆 **Unified High Score window** — single window with one tab per game, rank-change indicators, live polling, and a **Claim** button for last season's winners.
- 🎨 **NFT rarity** — Common / Rare / Epic / Legendary, with **per-game thresholds stored on-chain** (Snake: Rare ≥ 50 · Epic ≥ 150 · Legendary ≥ 300; other games: Rare ≥ 100 · Epic ≥ 300 · Legendary ≥ 700).
- 🖼️ **My NFTs window** — shows all score NFTs across all registered games with color-coded game badges, sorted by score.
- 💰 **Trustless prize pool** — every mint fee accrues into the contract itself (via `as-contract`) for the current season. Winners claim their share directly on-chain; no owner-custodied payouts.
- 🛠️ **Season Admin (owner-only)** — pre-flight summary + **End Season**, plus read-only pool/leaderboard views. Payouts are no longer manual — they are self-claimed.
- ⏳ **Per-game season countdown** — reads each game's on-chain deadline block,
  with `NEXT_PUBLIC_SEASON_END_ISO` only as a display fallback while unset.
- 🪟 **Windows 95 desktop UX** — boot screen, taskbar, Start menu → Games submenu, draggable windows, balloon notifications, pause overlays.
- 👤 **Public player profiles** — `/player/<stx-address>` shows score NFTs, best scores, total mints, seasons played.

---

## Quick start

Prerequisites: Node 22+, a Stacks wallet (Leather / Xverse) with ≥ 0.02 STX to mint, [Clarinet 3.14+](https://docs.hiro.so/clarinet/getting-started) for contract work.

```bash
git clone <this repo>
cd xp-snake

# frontend
cd frontend
cp .env.example .env.local
npm install
npm run dev        # http://localhost:3000
npm run ci         # lint + unit tests + type-check + production build

# contract (optional)
cd ../contract
npm install
npm test           # 139 Clarinet tests
clarinet check     # syntax-check all .clar files
```

### Environment variables (`frontend/.env.local`)

```env
NEXT_PUBLIC_CONTRACT_ADDRESS=SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4
NEXT_PUBLIC_NETWORK=mainnet
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SEASON_END_ISO=2026-06-30T23:59:59Z
```

Set the same vars in Vercel Project Settings for deployment.
`NEXT_PUBLIC_CONTRACT_ADDRESS` is a guardrail for the shared registry and must match `frontend/lib/game-registry.ts`; the app fails fast if it points at an unexpected contract.
If `NEXT_PUBLIC_NETWORK` is omitted, the frontend defaults to `mainnet`.

---

## Project layout

```
contract/
  contracts/
    nft-trait.clar          SIP-009 trait (used by the frozen legacy contracts)
    xp-arcade-v4.clar       ACTIVE: single multi-game registry — NFT + leaderboard
                            + trustless pool + tie-fair claim + claim window
                            + permissionless finalize-season + mint cap
    xp-arcade-v3.clar       Frozen reference (superseded by v4)
    snake-score.clar        Legacy v2 source (frozen, reference only)
    tetris-score.clar       Legacy v2 source (frozen)
    pacman-score.clar       Legacy v2 source (frozen)
    breakout-score.clar     Legacy v1 source (frozen)
  deployments/
    xp-arcade-v4.mainnet-plan.yaml              contract deploy
    xp-arcade-v4-register-games.mainnet-plan.yaml   register all 4 games
    xp-arcade-v4-set-base-uri.mainnet-plan.yaml     set production metadata base-uri

frontend/
  app/
    page.tsx                Desktop with all game windows
    api/metadata/score/     Single NFT metadata route (resolves game by on-chain game-id)
    player/[address]/       Public player profile pages
  components/
    desktop/                BootScreen, Desktop, Taskbar, StartMenu, SystemTray
    game/
      snake/                SnakeWindow, GameCanvas
      tetris/               TetrisWindow, TetrisCanvas, TetrisEngine
      pacman/               PacManWindow, PacManCanvas, PacManEngine, maze
      breakout/             BreakoutWindow, BreakoutEngine
    shared/                 GameShellWindow, SharedMintDialog
    windows/                HighScoreWindow (+ Claim), MyNftsWindow, SeasonAdminWindow, PlayerProfileWindow
    dialogs/                AboutDialog, BalloonNotification
  lib/
    game-registry.ts        Central registry: gameId ↔ onchainId, shared contract, mint fee, nftAssetName
    contract-calls.ts       Read/write helpers (*ForGame prepend the on-chain game-id; claimPrizeV3)
    cv-unwrap.ts            Strips @stacks/transactions v7 {type, value} wrappers
    metadata-route.ts       scoreMetadataResponseV3 — on-chain lookup → SIP-016 JSON + SVG
    payout-schedule.ts      Rank → prize-split fractions (display + claim estimate)
    tx-tracker.ts           Polls a txid to confirmation for toasts
    holdings.ts             Fetch score NFT holdings across all registered games
    snake-engine.ts         Pure Snake game logic
  state/
    wallet.ts               Connected address
    window-manager.ts       Open windows, z-order, positions
    toasts.ts               Balloon notifications

docs/                       Design specs + implementation plans
HANDOFF.md                  Live operational notes
```

---

## Architecture notes

- **Single registry contract.** `xp-arcade-v4` holds all games in a `games` map keyed by a numeric game-id. New games are added with `register-game` (owner-only) — no new deploy. `game-registry.ts` maps each frontend `gameId` to its `onchainId`, and every `*ForGame` call prepends `(uintCV onchainId)`.
- **Trustless prize pool via `as-contract`.** Mint fees are transferred into the contract principal, not the owner wallet. `claim-prize` performs an **atomic on-chain STX transfer** of the winner's share (capped to the remaining pool), is idempotent per `{player, game-id, season}`, and is initiated by the player — there is no owner-custodied payout step.
- **Per-game rarity, data-driven.** `register-game` stores `rare-min / epic-min / legend-min` per game; `compute-rarity` reads them at mint time. Thresholds are **permanent** (no update function) — only `set-game-active` can toggle a game.
- **Mint cap: 10 per player, per game, per season.** Tracked via `player-season-mints {player, game-id, season} → uint`; resets when `end-season` increments that game's season. SharedMintDialog reads `get-mints-remaining` and disables the button at 0.
- **`get-token-uri` concatenates the token-id.** Returns `base-uri + int-to-ascii(token-id)`, fixing the v2 bug where the id was dropped and marketplace metadata 404'd. Base-uri is set on mainnet to `https://xp-snake.vercel.app/api/metadata/score/` via `set-base-uri` (re-callable, owner-only).
- **Historical leaderboards.** `end-season` snapshots `{total, top-ten}` into `season-prize`; `get-top-ten-by-season` returns the live list for the current season or the stored snapshot for past seasons.
- **Top-10 unsorted on-chain.** Min-eviction at insertion time; the UI sorts on read.
- **Score is client-trusted.** No on-chain proof of gameplay. A score cap (`u9999`) and the mint cap reduce worst-case abuse. The mint dialog flags unusually high/fast scores, but this is advisory UI only.
- **`nftAssetName` decouples deploy name from NFT type.** The contract deploys as `xp-arcade-v4` and defines `(define-non-fungible-token xp-score uint)`, so the asset identifier is `…xp-arcade-v4::xp-score`. `holdings.ts` builds it from both fields in the registry.
- **Season end is owner-or-deadline.** The owner can `end-season` anytime; anyone can call it once the optional on-chain `season-end-block` is reached. The UI countdown is a soft, display-only deadline from env config.

---

## Tests

```bash
# contract (Clarinet / Vitest)
cd contract && npm test          # 139 tests
cd contract && clarinet check    # syntax/type/lint checks for .clar files

# frontend (Vitest)
cd frontend && npm test          # 185 tests
cd frontend && npm run typecheck # type-check
cd frontend && npm run build     # production build
cd frontend && npm run ci        # full local frontend CI
cd frontend && npm run test:e2e:ci       # stable mocked wallet/admin/claim smoke
cd frontend && npm run health:production # production + mainnet read-only checks
```

GitHub Actions runs three jobs on pushes to `main` and pull requests:

- **Frontend:** `npm ci` then `npm run ci`.
- **Frontend E2E:** Chromium + stable mocked owner/claim Playwright smoke tests.
- **Contract:** `npm ci`, install Clarinet, `npm test`, then `clarinet check`.

A separate scheduled workflow runs every six hours against production. It checks
the public health route, token metadata, configured v4 contract, owner, current
season, pool, top-10, and deadline reads for all four games. Client-side wallet,
holdings, and transaction-timeout errors are sent to a rate-limited telemetry
route with wallet addresses and transaction IDs redacted before Vercel logging.

---

## Adding a new game

The registry design means **no contract redeploy** is needed — only an on-chain `register-game` call plus a frontend entry.

**On-chain (owner-only):** pick the next unused game-id and choose its **permanent** params (`name`, `fee`, `rare-min`, `epic-min`, `legend-min`), then apply a Clarinet contract-call plan with the deployer wallet:

```bash
cd contract
clarinet deployments apply -p deployments/<your-register-game-plan>.yaml -d --no-dashboard
# never use -c on mainnet plans — it recomputes the fee and can exceed the wallet balance
```

`register-game` sets the game active and initializes its season to 1.

**Frontend:** add the game to `GameId`, `GAME_METADATA` (with matching `onchainId`/fee + `nftAssetName: "xp-score"`), `GAME_CONTRACTS`, `GAME_IDS`, and `buildGameRegistry()` in `lib/game-registry.ts`; add a background color in `lib/metadata-svg.ts`; add the engine/canvas/window components and a desktop launcher. The metadata route needs no change. Then redeploy the frontend.

### Frontend (Vercel)

`git push` to the deployment branch. Ensure the four `NEXT_PUBLIC_*` env vars are set in Vercel Project Settings.

---

## Operating the contract (for the owner)

1. Players mint scores → STX flows **into the contract pool** (per game, per season); the top-10 updates live.
2. Players watch the unified **High Score** window with the season countdown.
3. Around the deadline, the owner connects the deployer wallet → **Start → Season Admin** → **End Season** → confirm in wallet. (Anyone may also end it once an on-chain `season-end-block`, if set, is reached.)
4. A new season starts automatically (`current-season` increments; leaderboard and mint caps reset for that game).
5. **Winners self-claim.** Each top-ranked player opens the High Score window and clicks **Claim** to receive their share, transferred atomically from the contract. No owner action is required for payouts.

Payout split per closed season: positions 1–3 = 20% each · positions 4–10 ≈ 5.71% (4/70) each. **Tied scores split the combined value of the positions they occupy equally** (order-independent). Claims stay open for ~30 days (CLAIM-WINDOW = 4320 burn blocks); afterward anyone can call `finalize-season` to roll unclaimed shares + dust into the next season's pool.
