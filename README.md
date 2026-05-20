# XP Arcade on Stacks

A **multi-game arcade platform** with on-chain scores and prize pools, wrapped in a Windows 95 desktop UI.
Three classic games — Snake, Tetris, Pac-Man — each with its own SIP-009 NFT contract deployed to **Stacks mainnet**.

> Play a game → mint your score as an NFT → land in the top-10 → earn a share of the season's prize pool.

---

## Live contracts (mainnet)

| Contract | Address |
|---|---|
| `nft-trait` (SIP-009 trait) | [`SP2CMK...nft-trait`](https://explorer.hiro.so/txid/SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.nft-trait?chain=mainnet) |
| `snake-score` | [`SP2CMK...snake-score`](https://explorer.hiro.so/txid/SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.snake-score?chain=mainnet) |
| `tetris-score` | [`SP2CMK...tetris-score`](https://explorer.hiro.so/txid/SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.tetris-score?chain=mainnet) |
| `pacman-score` | [`SP2CMK...pacman-score`](https://explorer.hiro.so/txid/SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.pacman-score?chain=mainnet) |

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

- 🐍 **Snake** — classic arrow-key controls, score capped at 9,999.
- 🧱 **Tetris** — 7 tetrominoes, wall kicks, ghost piece, level speed scaling, side panel with next-piece preview.
- 👾 **Pac-Man** — 21×21 maze, 4 ghosts with scatter/chase/frightened AI, power pellets, 3 lives.
- 💾 **Score NFTs (SIP-009)** — mint any score post-game. Snake: 0.01 STX · Tetris & Pac-Man: 0.02 STX. Metadata served from `/api/metadata/{game}/[id]`.
- 🏆 **On-chain leaderboard** — top-10 per game maintained in each contract with min-eviction.
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

# contract (optional)
cd ../contract
npm install
npm test           # 34 Clarinet tests
clarinet check     # syntax-check all .clar files
```

### Environment variables (`frontend/.env.local`)

```env
NEXT_PUBLIC_CONTRACT_ADDRESS=SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.snake-score
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
    snake-score.clar        Snake: Score NFT + leaderboard + prize pool (0.01 STX)
    tetris-score.clar       Tetris: Score NFT + leaderboard + prize pool (0.02 STX)
    pacman-score.clar       Pac-Man: Score NFT + leaderboard + prize pool (0.02 STX)
  deployments/
    snake-only.mainnet-plan.yaml
    tetris-only.mainnet-plan.yaml
    pacman-only.mainnet-plan.yaml

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
    shared/                 GameShellWindow, SharedLeaderboard, SharedMintDialog, SharedMyNfts
    windows/                SeasonAdminWindow, PlayerProfileWindow
    dialogs/                AboutDialog, BalloonNotification
  hooks/
    useGameSession.ts       Shared score/game-over/mint state for all games
  lib/
    game-registry.ts        Central registry: gameId → contract address + mint fee
    contract-calls.ts       Read/write helpers (mint, leaderboard, season)
    cv-unwrap.ts            Strips @stacks/transactions v7 {type, value} wrappers
    snake-engine.ts         Pure Snake game logic
    tetris/ (in components) Pure Tetris engine
    pacman/ (in components) Pure Pac-Man engine + maze
    metadata-svg.ts         SVG generation for Snake score NFTs
  state/
    wallet.ts               Connected address
    window-manager.ts       Open windows, z-order, positions
    toasts.ts               Balloon notifications

docs/                       Design specs + implementation plans
HANDOFF.md                  Live operational notes
```

---

## Architecture notes

- **One contract per game, same structure.** Each clones `snake-score` with a different NFT token name, mint fee, and base-uri. All share the same prize-pool and leaderboard logic.
- **Shared frontend layer.** `GameShellWindow`, `SharedLeaderboard`, `SharedMintDialog`, `SharedMyNfts`, and `useGameSession` are parameterized by `gameId` — adding a new game only requires a new engine + canvas + window component.
- **Top-10 unsorted on-chain.** Min-eviction at insertion time. UI sorts on read. Rank is computed via fold in `claim-prize` / `claim-trophy`.
- **Score is client-trusted.** No on-chain proof of gameplay. Cap (`u9999`) reduces worst-case abuse.
- **Mint fee goes to `contract-owner` directly.** `as-contract` not used. Contract only increments an accounting counter. Prize payouts are sent manually by the owner via Season Admin.
- **`claim-prize` is record-only.** Returns `(ok payout)` and marks as claimed but does not transfer STX. Owner sends manually.
- **Season end is fully manual.** No on-chain deadline; the countdown in the UI is a soft display-only deadline from env config.

---

## Tests

```bash
# contract (Clarinet / Vitest)
cd contract && npm test          # 34 tests

# frontend (Vitest)
cd frontend && npm test          # 63 tests
cd frontend && npx tsc --noEmit  # type-check
cd frontend && npm run build     # production build
```

---

## Deploying a new game contract

Each game has its own plan file — no risk of re-deploying already-live contracts:

```bash
cd contract

# Tetris (already deployed)
clarinet deployments apply --no-dashboard -p deployments/tetris-only.mainnet-plan.yaml

# Pac-Man (already deployed)
clarinet deployments apply --no-dashboard -p deployments/pacman-only.mainnet-plan.yaml
```

The contract is **immutable** once deployed. A change requires a new deploy + updating `game-registry.ts` with the new address.

### Frontend (Vercel)

`git push` to the deployment branch. Ensure the four `NEXT_PUBLIC_*` env vars are set in Vercel Project Settings.

---

## Operating the contract (for the owner)

1. Players mint scores → STX flows to the owner wallet; pool counter grows in each contract.
2. Top-10 updates live per game; players watch Leaderboard windows with the countdown.
3. Around the deadline, owner connects deployer wallet → **Start → Season Admin** → **End Season** → confirm in wallet.
4. New season starts automatically (`current-season` increments, leaderboard resets).
5. Past-season snapshot appears in Season Admin. Owner clicks **Send STX** per top-10 row to ship payouts.

Payout split per closed season: top 1–3 = 20% each · top 4–10 ≈ 5.71% each. Leftover from fewer than 10 entries stays in the owner wallet.
