# Frontend — Next.js App Router

Win95-themed desktop UI. `frontend/`. Next.js 16 App Router + React 19,
TypeScript 5, `98.css` + Tailwind v4, Zustand 5.

## Layout

```
app/                 layout, page, globals, fonts, /api/metadata/score/[id]
components/desktop/   BootScreen, Desktop, StartMenu, Taskbar, SystemTray, wallpaper
components/windows/   draggable XP windows (HighScore, HallOfFame, MyNfts, SeasonAdmin, ...)
components/shared/    GameShellWindow, SharedMintDialog, ShareScoreCard
components/game/      GameCanvas, TouchControls
components/player/    PlayerProfile + stats panels
lib/                  pure logic + Stacks calls (each has a colocated *.test.ts)
state/                Zustand stores (focused, not a god-store)
```

## Stacks integration (`lib/`)

- `game-registry.ts` — single source of truth for game ids, labels, fees,
  contract address/name. All games point at shared `xp-arcade-v4`. Mirror any
  on-chain id change here.
- `contract-calls.ts` — read-only + write calls, incl. the active claim path:
  `claimPrizeV3`, `getSeasonPrizeForGame`, `hasClaimedPrizeForGame` (used by the
  High Scores window). `claimable-prizes.ts` (`findClaimablePrizes`,
  `classifyClaimTx`) drives multi-season claim discovery + tx classification.
- `cv-unwrap.ts` — `unwrap()` strips `@stacks/transactions` v7 nested
  `{type,value}` wrappers (`cvToValue` does NOT recurse). Lives in its own file
  so server-side API routes can import without the `"use client"` boundary.
- `owner.ts` — `useIsOwner` / `resolveIsOwner`; async, session-cached compare
  against `get-contract-owner`. Treat "loading" as not-owner.
- `tx-tracker.ts` — watches broadcast tx state for UI feedback.
- `stacks.ts` — `@stacks/connect` v8 API: `connect`/`disconnect`/`isConnected`/
  `getLocalStorage`.

## Token metadata

Token URIs point at one Next.js route: `app/api/metadata/score/[id]/route.ts`.
The v4 contract's `get-token-uri` correctly appends the `token-id` to the base
URI (the v2 static-URI 404 bug is fixed).

## State (`state/`)

`wallet.ts` (connect state) · `window-manager.ts` (open windows, z-order,
positions) · `toasts.ts` (balloon notifications) · plus `mint-tx`,
`session-stats`, `desktop-theme`. Keep them focused; don't merge.

## Wallet post-conditions

Wallets default to deny mode. Every write that moves tokens must declare a post
-condition — e.g. mint declares `Pc.principal(sender).willSendEq(fee).ustx()`.

## Conventions

- Desktop-first by design; mobile is a minimal fallback, not parity.
- Keep BootScreen as the original **Windows 95** look — do not XP-ify it.
- Each `lib/` and `state/` module ships a colocated Vitest test.
