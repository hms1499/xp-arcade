# XP Snake on Stacks — MVP Design Spec

**Date:** 2026-05-13
**Author:** vanhuy
**Status:** Draft (approved for implementation)
**Context:** Hackathon MVP — Snake game with Stacks blockchain integration, Windows XP themed UI/UX as the differentiating USP.

---

## 1. Goals & Non-Goals

### Goals
- Ship a playable snake game with on-chain proof-of-score (NFT) on Stacks testnet
- Demonstrate clear Web3 integration: wallet connect, contract calls, NFT mint, on-chain leaderboard
- Stand out visually with a Windows XP themed desktop UI/UX
- Be demoable end-to-end in ~3 minutes for hackathon judges

### Non-Goals
- Mainnet deployment, real economic value
- Anti-cheat / score verification (client-trusted for MVP; noted as future work)
- Mobile-first UX (desktop XP aesthetic; mobile gets a basic responsive fallback)
- Multiplayer / real-time competition
- Account abstraction, gas sponsorship

---

## 2. Architecture Overview

```
┌────────────────────────────────────────┐
│  Next.js App (Vercel)                  │
│  ┌──────────────────────────────────┐  │
│  │  XP Desktop shell                │  │
│  │   - Wallpaper, taskbar, start    │  │
│  │   - Window manager (Zustand)     │  │
│  │   - System tray (wallet + clock) │  │
│  ├──────────────────────────────────┤  │
│  │  Game window (Canvas)            │  │
│  │  Leaderboard window              │  │
│  │  My NFTs window                  │  │
│  │  Mint / Trophy dialogs           │  │
│  ├──────────────────────────────────┤  │
│  │  @stacks/connect (Leather/Xverse)│  │
│  │  contract-calls helpers          │  │
│  └──────────────────────────────────┘  │
└────────────────┬───────────────────────┘
                 │ stacks.js
                 ▼
┌────────────────────────────────────────┐
│  Stacks Testnet                        │
│  snake-score.clar (SIP-009 NFTs)       │
│   - mint-score(score, name)            │
│   - claim-trophy()                     │
│   - reset-season() [admin]             │
│   - get-top-ten() [read-only]          │
└────────────────────────────────────────┘
```

### End-to-end flow
1. User opens site → XP boot animation → desktop renders.
2. Click "Connect Wallet" (system tray) → Leather/Xverse popup → tray icon shows connected address.
3. Double-click "Snake.exe" desktop icon → game window opens.
4. Play snake until game over → XP dialog: "Game Over. Score: 50. Mint as NFT?" [Yes] [No].
5. Yes → wallet popup → `mint-score` tx → progress dialog → balloon notification on success.
6. Open "Leaderboard" → reads `get-top-ten` → if user in top 10, "Claim Trophy" button enabled.
7. Click claim → `claim-trophy` tx → trophy NFT minted, special dialog + confetti.
8. Open "My Snake NFTs" → file-explorer-style grid showing all owned score + trophy NFTs.

---

## 3. Clarity Contract (`snake-score.clar`)

SIP-009 compliant NFT contract with two token types in a single contract: **score NFTs** and **trophy NFTs**. ~150 lines total.

### Data structures
```clarity
;; Two NFT types, separate id counters
(define-non-fungible-token snake-score uint)
(define-non-fungible-token snake-trophy uint)
(define-data-var last-token-id uint u0)
(define-data-var last-trophy-id uint u0)

;; Per-token-id score data
(define-map score-data uint {
  player: principal,
  score: uint,
  player-name: (string-ascii 24),
  block: uint,
  season: uint
})

;; Per-trophy-id trophy data
(define-map trophy-data uint {
  player: principal,
  rank: uint,        ;; 1..10
  season: uint
})

;; On-chain top-10 (sorted descending by score, insertion sort on mint)
(define-data-var top-ten
  (list 10 {player: principal, score: uint})
  (list))

;; Track which player has claimed a trophy in which season
(define-map trophy-claimed {player: principal, season: uint} bool)

(define-data-var current-season uint u1)
(define-data-var contract-owner principal tx-sender)
```

### Public functions
- `mint-score(score uint, player-name (string-ascii 24)) -> (response uint uint)`
  - Increments `last-token-id`, mints `snake-score` NFT to `tx-sender`.
  - Writes `score-data`.
  - Calls internal `try-insert-top-ten` which insertion-sorts caller into `top-ten` if score qualifies.
  - Returns minted token-id.
- `claim-trophy() -> (response uint uint)`
  - Reads `top-ten`, finds `tx-sender`'s rank (1..10) or errors `ERR-NOT-IN-TOP-TEN`.
  - Errors `ERR-ALREADY-CLAIMED` if `(trophy-claimed {player: tx-sender, season: current-season})` is true.
  - Mints `snake-trophy` NFT, writes `trophy-data` with rank.
  - Marks `trophy-claimed` true.
  - Returns minted trophy-id.
- `reset-season() -> (response bool uint)` — admin-only. Clears `top-ten`, increments `current-season`. Does NOT clear `trophy-claimed` (preserved by season key).
- SIP-009 standard: `transfer`, `get-owner`, `get-token-uri` (for both NFT types via two read-only wrappers since SIP-009 is one-token-per-contract — see implementation note below).

### Read-only functions
- `get-score-data(token-id uint)` → score metadata
- `get-trophy-data(trophy-id uint)` → trophy metadata
- `get-top-ten()` → the sorted list
- `get-last-token-id()`, `get-last-trophy-id()`
- `get-current-season()`
- `has-claimed-trophy(player principal)` → bool for current season

### Implementation note: SIP-009 with two token types
SIP-009 trait is defined per-contract per-token-type. To stay compliant, we will expose the standard SIP-009 trait against `snake-score` (the primary NFT) and provide non-trait `transfer-trophy`, `get-trophy-owner`, `get-trophy-uri` functions for trophies. This keeps marketplace compatibility for score NFTs while keeping trophies in the same contract.

### Token URI strategy
Both URIs point to Next.js API routes:
- Score: `https://<app>/api/metadata/score/{id}`
- Trophy: `https://<app>/api/metadata/trophy/{id}`

API routes read on-chain data and return SIP-016 metadata JSON with an inline-generated SVG `image` (data-URL) — no external image hosting needed.

---

## 4. Frontend — Windows XP themed Next.js app

### Stack
- Next.js 16 (App Router) + React + TypeScript
- `xp.css` (CSS framework with authentic XP components)
- Tailwind CSS (layout glue)
- Zustand (window manager state)
- `@stacks/connect`, `@stacks/transactions`, `@stacks/network` (Stacks SDK)
- `canvas-confetti` (trophy celebration)
- Deploy: Vercel

### XP UI metaphor mapping
| Feature | XP metaphor |
|---|---|
| App entry | Desktop with Bliss wallpaper + "Snake.exe" icon (double-click to open) |
| Wallet connect | System tray icon (right side of taskbar). Balloon notification on connect. |
| Snake game | Window titled "Snake — Untitled" with fake File/Edit/Help menu bar |
| Game over | Classic XP message box dialog with ⚠️ icon + "ding" sound |
| Leaderboard | Window styled like Control Panel; table with 3D-beveled column headers |
| My NFTs | "My Snake NFTs" window styled like My Computer file explorer |
| Mint loading | XP "Copying files…" progress dialog repurposed as "Broadcasting transaction…" |
| Tx success | Balloon notification from system tray |
| Trophy claim | Custom dialog with 🏆 + `canvas-confetti` celebration |
| Start menu | Shortcuts: Play Snake, Leaderboard, My NFTs, Disconnect, Shut Down |
| Clock | System tray displays Stacks current block height (creative twist) |

### Folder structure
```
app/
  layout.tsx                  ← global providers (Stacks, window manager)
  page.tsx                    ← boot screen + desktop
  api/metadata/score/[id]/route.ts
  api/metadata/trophy/[id]/route.ts
components/
  desktop/
    Desktop.tsx               ← wallpaper, icons, taskbar
    Taskbar.tsx
    StartMenu.tsx
    SystemTray.tsx            ← wallet status + block-height clock
    DesktopIcon.tsx
  windows/
    Window.tsx                ← reusable draggable XP window
    GameWindow.tsx
    LeaderboardWindow.tsx
    MyNftsWindow.tsx
  dialogs/
    XpDialog.tsx
    MintDialog.tsx
    TrophyDialog.tsx
    BalloonNotification.tsx
  game/
    GameCanvas.tsx            ← renders snake-engine to canvas
lib/
  snake-engine.ts             ← pure game logic (testable)
  stacks.ts                   ← network config, contract address
  contract-calls.ts           ← wrappers: mintScore, claimTrophy, getTopTen
  metadata-svg.ts             ← generate SVG strings for score / trophy
state/
  window-manager.ts           ← Zustand store: open windows, z-index, positions
  wallet.ts                   ← Zustand store: connected address, balance
```

### Snake engine
- Pure module, no DOM dependencies, exports `createGame(opts) → { tick, turn, state }`.
- Grid 20×20, default speed 8 ticks/sec increasing with score.
- Standard rules: collide wall or self → game over; eat food → grow + score +1.
- Direction-lock to prevent 180° reversal in same tick.
- Pure logic = easy to unit test.

### Window manager
- Zustand store: `{ windows: { id, type, x, y, z, minimized }[], focus(id), open(type), close(id), minimize(id) }`.
- ~50 lines. Each `Window` component subscribes to its slice.

---

## 5. Game Mechanics & Mint Policy

- Each game session is independent; user chooses whether to mint after game over.
- Score 0 games are mintable (edge case, kept for simplicity).
- Replays are encouraged: user may mint multiple NFTs per address.
- `best-score` (used in leaderboard) is updated only when a new mint has a higher score than the player's previous best.
- Leaderboard = `top-ten` on-chain list, refreshed every leaderboard window open.

---

## 6. Reward System — Trophy NFTs

- After season ends (or anytime during season for current top 10), a player in the top 10 may call `claim-trophy()` once per season.
- Trophy rank determined at claim time, not at mint time, based on `top-ten` snapshot.
- Trophy tiers:
  - Rank 1 → Gold Trophy 🏆
  - Rank 2 → Silver Trophy 🥈
  - Rank 3 → Bronze Trophy 🥉
  - Rank 4–10 → "Top 10" Trophy
- Trophy NFTs are visually distinct (SVG with rank, season, player address).

**Edge case:** If a player claims at rank 3, then later gets bumped to rank 4 by another mint, their claimed trophy remains Bronze. Rank is locked at claim. (Documented behavior — accepted for MVP simplicity.)

---

## 7. Testing Strategy

### Contract (Clarinet + Vitest)
- `mint-score` happy path: token-id increments, NFT owned by caller, `score-data` correct
- `mint-score` updates `best-score` only when higher
- `top-ten` insertion sort: insert 12 random scores, verify final list is sorted desc and contains top 10
- `top-ten` eviction: ensure 11th-best score is removed when 11th higher score is inserted
- `claim-trophy` success at each rank tier (1, 2, 3, 4–10)
- `claim-trophy` fails with `ERR-NOT-IN-TOP-TEN` if caller absent
- `claim-trophy` fails with `ERR-ALREADY-CLAIMED` on second call in same season
- `reset-season` only admin can call; increments season; `trophy-claimed` from old seasons preserved
- SIP-009: `get-owner`, `transfer`, `get-token-uri` for score NFTs

### Frontend
- Unit test `snake-engine.ts` with Vitest: collision, food spawn determinism via seed, growth, direction-lock.
- Skip Playwright/Leather E2E (too complex for hackathon time-box).
- Replace with manual test checklist (Section 8).

---

## 8. Manual Test Checklist (pre-demo)

```
[ ] Connect Leather testnet wallet
[ ] Play full game, smooth 60fps, food spawns correctly
[ ] Score 0 game still mintable
[ ] Mint score → tx confirms → NFT appears in My NFTs window
[ ] Mint two NFTs from same address → leaderboard keeps best only
[ ] Three different wallets mint different scores → leaderboard sorts correctly
[ ] Claim trophy at rank 1 → Gold trophy mints
[ ] Claim trophy twice → second call fails with clear error in XP dialog
[ ] Disconnect wallet → state resets, no crash
[ ] Refresh during game → graceful (loses game state, no white screen)
[ ] Mobile responsive: leaderboard at minimum is readable
[ ] Tested on Chrome, Firefox, Safari
```

---

## 9. Deployment

1. **Contract** → Clarinet `deployments apply --testnet`; record contract address.
2. **Frontend** → Vercel, GitHub auto-deploy on push to `main`.
3. **Env vars** (Vercel):
   - `NEXT_PUBLIC_CONTRACT_ADDRESS` (e.g., `ST...snake-score`)
   - `NEXT_PUBLIC_NETWORK=testnet`
   - `NEXT_PUBLIC_APP_URL` (used in token URIs)
4. **Domain** → Vercel preview URL is sufficient for the hackathon.

---

## 10. Polish Priorities (in order)

1. XP boot animation (~30 min) — instant USP signal
2. Sound effects: XP ding, balloon pop, error chime (~30 min)
3. `canvas-confetti` on trophy claim (~10 min)
4. Balloon notification slide-in from tray (~1 h)
5. Pixel snake skin variations by score tier (stretch)
6. Easter egg: typing "bsod" in-game triggers fake blue screen (stretch)

---

## 11. Timeline (1 dev, 3–4 day hackathon)

- **Day 1** — Clarity contract: write, test (Clarinet), deploy testnet.
- **Day 2** — Snake engine + game canvas + wallet connect; verify mint flow end-to-end (UI minimal).
- **Day 3** — XP UI shell: desktop, window manager, taskbar, dialogs. Integrate all flows.
- **Day 4** — Polish, manual test pass, demo video (Loom 2–3 min), README, slide deck.

---

## 12. Known Limitations & Future Work

- **Score is client-trusted.** A malicious user could submit any score. Acceptable for hackathon MVP; future work: on-chain RNG for food spawn + replay verification, or commit-reveal scheme.
- **No anti-grief on `mint-score`.** Anyone can spam mints (paying their own gas) and pollute `top-ten`. Mitigation idea: minimum score threshold (e.g., score >= 10) to enter `top-ten`.
- **`reset-season` is admin-only.** For decentralization, replace with auto-reset every N blocks.
- **Trophy rank locked at claim time** (intentional simplification — see Section 6).
- **Mobile UX is fallback only.** XP metaphor is desktop-first by design.

---

## 13. Open Questions (none blocking)

- Choose between Leather and Xverse as primary wallet for demo (both supported via `@stacks/connect`; pick whichever judges are more likely to have).
- Confirm Stacks testnet faucet limits are sufficient for demo accounts.
