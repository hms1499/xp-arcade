# XP Arcade on Stacks

A **multi-game arcade platform** with on-chain scores and prize pools, wrapped in a Windows 95 desktop UI.
Three classic games — Snake, Tetris, Pac-Man — each with its own SIP-009 NFT contract deployed to **Stacks mainnet**.

> Play a game → mint your score as an NFT → land in the top-10 → earn a share of the season's prize pool.

---

## Live contracts (mainnet)

Active contracts (v2 — mint cap + historical leaderboard):

| Contract | Address |
|---|---|
| `nft-trait` (SIP-009 trait) | [`SP2CMK...nft-trait`](https://explorer.hiro.so/txid/SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.nft-trait?chain=mainnet) |
| `snake-score-v2` | [`SP2CMK...snake-score-v2`](https://explorer.hiro.so/txid/SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.snake-score-v2?chain=mainnet) |
| `tetris-score-v2` | [`SP2CMK...tetris-score-v2`](https://explorer.hiro.so/txid/SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.tetris-score-v2?chain=mainnet) |
| `pacman-score-v2` | [`SP2CMK...pacman-score-v2`](https://explorer.hiro.so/txid/SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.pacman-score-v2?chain=mainnet) |

Deployer / `contract-owner`: `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV`

---

## Stack

| Layer | Tech |
|---|---|
| Smart contracts | Clarity 4 · Clarinet 3.14 · Vitest 3 (`@hirosystems/clarinet-sdk` v3.9) |
| Frontend | Next.js 16 (App Router) · TypeScript 5 · Tailwind v4 · `xp.css` |
| State | Zustand 5 (wallet / window-manager / toasts) |
| Stacks SDK | `@stacks/connect` v8 · `@stacks/transactions` v7 · `@stacks/network` v7 |
| Hosting | Vercel (frontend) · Stacks mainnet (contracts) |

---

## Features

- 🐍 **Snake** — classic arrow-key controls, +1 per food, 20×20 grid.
- 🧱 **Tetris** — 7 tetrominoes, wall kicks, ghost piece, level speed scaling, next-piece preview.
- 👾 **Pac-Man** — 21×21 maze, 4 ghosts with scatter/chase/frightened AI, power pellets, 3 lives.
- 💾 **Score NFTs (SIP-009)** — mint any score post-game. Snake: 0.01 STX · Tetris & Pac-Man: 0.02 STX. **Capped at 10 mints per player per season.** Metadata served from `/api/metadata/{game}/[id]`.
- 🏆 **Unified High Score window** — single window with 3 tabs (one per game), rank-change indicators, live polling.
- 🎨 **NFT rarity** — Common / Rare / Epic / Legendary based on score. Scoring is calibrated across all 3 games so rarity tiers carry equal weight regardless of game.
- 🖼️ **My NFTs window** — shows all score NFTs across all 3 games with color-coded game badges, sorted by score.
- 💰 **Prize pool** — every mint fee accumulates into the current season's pool. Owner closes seasons manually; payouts are sent via Season Admin.
- 🛠️ **Season Admin (owner-only)** — see accumulated pool, end season, send STX payouts to top-10 players.
- ⏳ **Soft season countdown** — display-only deadline from `NEXT_PUBLIC_SEASON_END_ISO`.
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
npm test           # 42 Clarinet tests
clarinet check     # syntax-check all .clar files
```

### Environment variables (`frontend/.env.local`)

```env
NEXT_PUBLIC_CONTRACT_ADDRESS=SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.snake-score-v2
NEXT_PUBLIC_NETWORK=mainnet
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SEASON_END_ISO=2026-06-01T00:00:00Z
```

Set the same vars in Vercel Project Settings for deployment.

---

## Project layout

```
contract/
  contracts/
    nft-trait.clar          SIP-009 trait
    snake-score.clar        Snake: Score NFT + leaderboard + prize pool + mint cap (0.01 STX)
    tetris-score.clar       Tetris: Score NFT + leaderboard + prize pool + mint cap (0.02 STX)
    pacman-score.clar       Pac-Man: Score NFT + leaderboard + prize pool + mint cap (0.02 STX)
  deployments/
    snake-score-v2.mainnet-plan.yaml
    tetris-score-v2.mainnet-plan.yaml
    pacman-score-v2.mainnet-plan.yaml

frontend/
  app/
    page.tsx                Desktop with all game windows
    api/metadata/score/     Snake NFT metadata (on-chain lookup → SIP-016 JSON + SVG)
    api/metadata/tetris/    Tetris NFT metadata
    api/metadata/pacman/    Pac-Man NFT metadata
  components/
    desktop/                BootScreen, Desktop, Taskbar, StartMenu, SystemTray
    game/
      snake/                SnakeWindow, GameCanvas
      tetris/               TetrisWindow, TetrisCanvas, TetrisEngine
      pacman/               PacManWindow, PacManCanvas, PacManEngine, maze
    shared/                 GameShellWindow, SharedMintDialog
    windows/                HighScoreWindow (3-tab), MyNftsWindow, SeasonAdminWindow, PlayerProfileWindow
    dialogs/                AboutDialog, BalloonNotification
  lib/
    game-registry.ts        Central registry: gameId → contract address, mint fee, nftAssetName
    contract-calls.ts       Read/write helpers (mint, leaderboard, season, mints-remaining)
    cv-unwrap.ts            Strips @stacks/transactions v7 {type, value} wrappers
    holdings.ts             Fetch score NFT holdings across all 3 games
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

- **One contract per game, same structure.** Each clones `snake-score` with a different NFT token name, mint fee, and base-uri. All share the same prize-pool, leaderboard, and mint-cap logic.
- **Mint cap: 10 per player per season.** Tracked on-chain via `player-season-mints {player, season} → uint`. Resets automatically when `end-season` increments the season counter. The MintDialog queries `get-mints-remaining` on open and disables the button at 0.
- **Historical leaderboards via `get-top-ten-by-season`.** `end-season` snapshots the top-10 into `season-prize`. `get-top-ten-by-season(season)` returns the live list for the current season or the stored snapshot for past seasons.
- **Shared frontend layer.** `GameShellWindow`, `SharedMintDialog`, `HighScoreWindow`, `MyNftsWindow`, and `useGameSession` are parameterized by `gameId` — adding a new game only requires a new engine + canvas + window component and a registry entry.
- **`nftAssetName` decouples deploy name from NFT type name.** `snake-score.clar` deployed as `snake-score-v2` still defines `(define-non-fungible-token snake-score ...)`. The asset identifier is `…snake-score-v2::snake-score`. `game-registry.ts` carries both `contractName` and `nftAssetName` so `holdings.ts` builds the correct identifier.
- **Top-10 unsorted on-chain.** Min-eviction at insertion time. UI sorts on read.
- **Score is client-trusted.** No on-chain proof of gameplay. Cap (`u9999`) and mint cap (10/season) reduce worst-case abuse.
- **Frontend score-risk review.** The mint dialog and Season Admin flag unusually high or too-fast scores for review, but this is advisory only and does not change contract behavior.
- **Scoring calibrated across games.** Snake +1/food · Tetris `[0,1,3,5,8]×level` · Pac-Man dot=1, pellet=5, ghost=20. All 3 games target a 0–400 practical range so rarity tiers (Common < 167, Rare 167–499, Epic 500–999, Legendary ≥ 1000) are equally meaningful.
- **Mint fee goes to `contract-owner` directly.** Contract only increments an accounting counter. Prize payouts are sent manually by the owner via Season Admin.
- **`claim-prize` is record-only.** Returns `(ok payout)` and marks as claimed but does not transfer STX. Owner sends manually. Season Admin requires a typed confirmation and shows recipient, amount, memo, and ledger state before each payout.
- **Season end is fully manual.** No on-chain deadline; the countdown in the UI is a soft display-only deadline from env config.

---

## Tests

```bash
# contract (Clarinet / Vitest)
cd contract && npm test          # 42 tests
cd contract && clarinet check    # syntax/type/lint checks for .clar files

# frontend (Vitest)
cd frontend && npm test          # 125 tests
cd frontend && npm run typecheck # type-check
cd frontend && npm run build     # production build
cd frontend && npm run ci        # full local frontend CI
```

GitHub Actions runs two jobs on pushes to `main` and pull requests:

- **Frontend:** `npm ci` then `npm run ci`.
- **Contract:** `npm ci`, install Clarinet, `npm test`, then `clarinet check`.

---

## Deploying a new contract version

Stacks contracts are immutable — changes require deploying under a new name and updating `game-registry.ts`:

```bash
cd contract
clarinet deployments apply -p deployments/snake-score-v2.mainnet-plan.yaml --no-dashboard
clarinet deployments apply -p deployments/tetris-score-v2.mainnet-plan.yaml --no-dashboard
clarinet deployments apply -p deployments/pacman-score-v2.mainnet-plan.yaml --no-dashboard
```

After deployment, update `contractName` and `nftAssetName` in `frontend/lib/game-registry.ts` and redeploy the frontend.

### Frontend (Vercel)

`git push` to the deployment branch. Ensure the four `NEXT_PUBLIC_*` env vars are set in Vercel Project Settings.

---

## Operating the contract (for the owner)

1. Players mint scores → STX flows to the owner wallet; pool counter grows in each contract.
2. Top-10 updates live per game; players watch the unified **High Score** window with the season countdown.
3. Around the deadline, owner connects deployer wallet → **Start → Season Admin** → **End Season** → confirm in wallet.
4. New season starts automatically (`current-season` increments, leaderboard resets, mint caps reset for all players).
5. Past-season snapshot appears in Season Admin. Owner clicks **Send STX** per top-10 row to ship payouts.

Payout split per closed season: top 1–3 = 20% each · top 4–10 ≈ 5.71% each. Leftover from fewer than 10 entries stays in the owner wallet.
