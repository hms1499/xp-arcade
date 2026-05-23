# Frontend Hardening Without Contract Changes — Design

**Date:** 2026-05-23
**Status:** Draft
**Topic:** Fix release-blocking frontend/tooling issues without changing currently deployed contracts or contract source.

## Background

The project already has a solid baseline: frontend unit tests pass, contract tests
pass, and TypeScript type-check passes. The remaining problems are mostly frontend
quality gates and operational clarity:

- `npm run lint` fails with React/Next rule errors.
- `npm run build` did not complete during verification and needs a clean rerun after
  lint fixes.
- Runtime contract configuration is split between hardcoded game registry values and
  loose env parsing.
- Metadata API routes duplicate nearly identical logic across Snake, Tetris, and
  Pac-Man.
- Mainnet documentation has stale review status that can confuse operators.

This work intentionally avoids all smart-contract changes. It must not modify
Clarity contracts, deployment plans, contract tests, or any deployed contract
address unless the change is only validation/documentation around existing values.

## Goals

1. Make frontend lint, type-check, tests, and production build usable as release
   gates.
2. Reduce frontend runtime risk from missing or malformed env/config values.
3. Remove duplicated metadata route logic while preserving existing public API paths.
4. Update documentation so it reflects the current mainnet/v2 state and known
   limitations.
5. Keep behavior compatible with the currently deployed contracts.

## Non-Goals

- No changes to `contract/contracts/*.clar`.
- No changes to `contract/deployments/*.yaml`.
- No v3/trustless payout work.
- No score anti-cheat or gameplay proof.
- No change to current contract names, NFT asset names, mint fees, or deployed owner.
- No redesign of the Windows 95/XP visual language.

## Decisions

### 1. Fix lint by aligning React state patterns, not by disabling rules globally

React/Next lint errors point to real stability issues: impure render calls, reading
refs during render, and setState patterns that React Compiler flags. Fix these in
the affected components rather than turning off the rules globally.

Accept local, narrowly scoped eslint disables only if a component is intentionally
using a game loop pattern and the code is proven stable. The default path is to move
rendered values into React state or derived constants.

### 2. Preserve existing game engine logic

The game engine tests are passing. Fix canvas component React integration without
rewriting the underlying Snake/Tetris/Pac-Man engines.

For Tetris/Pac-Man, maintain refs for hot loop state, but mirror only UI-facing
values into React state: level, lines, lives, gameOver, paused, touch mode.

### 3. Fail fast on invalid frontend config

`stacks.ts` currently tolerates missing `NEXT_PUBLIC_CONTRACT_ADDRESS` via `"."`.
That is dangerous because a deployment can boot with invalid contract identity.

Add explicit parsing/validation helpers for:

- network: `mainnet` or `testnet`
- contract id format: `ADDRESS.contract-name`
- per-game registry values already used by the app

The validation must preserve existing default behavior in local development only
when it is clearly intentional and documented.

### 4. Extract shared metadata route helper

The three metadata routes should keep their current public URLs:

- `/api/metadata/score/[id]`
- `/api/metadata/tetris/[id]`
- `/api/metadata/pacman/[id]`

Move shared code into a helper, likely `frontend/lib/metadata-route.ts`, that handles:

- id parsing
- IP-based rate limiting
- read-only `get-score-data`
- missing-token 404
- SVG metadata response
- cache headers
- consistent error response

Each route becomes a small wrapper that passes the game definition and game display
name.

### 5. Update docs without changing contract truth

`docs/mainnet-review.md` still says the contract is not ready for mainnet, while
README documents live v2 contracts. Update docs to separate:

- resolved historical blockers
- accepted v2 limitations
- deferred v3 items
- current no-contract hardening backlog

This avoids operators following stale instructions.

## Current Findings To Address

| Area | Current issue | Intended fix |
|------|---------------|--------------|
| Lint | `Math.random()` in render-time memo | Use seeded RNG already present |
| Lint | `<a href="/">` for internal nav | Replace with `next/link` |
| Lint | setState directly in several effects | Refactor loading/touch/init flows |
| Lint | refs read during render in game canvases | Mirror UI-facing values to React state |
| Config | `NEXT_PUBLIC_CONTRACT_ADDRESS ?? "."` | Add parser that throws on malformed config |
| Config | hardcoded game registry lacks validation | Validate all game definitions at module load |
| Metadata | three duplicate API route bodies | Extract shared helper |
| Docs | stale pre-mainnet review status | Rewrite as historical review + current limitations |

## Files And Boundaries

| File/Area | Change |
|-----------|--------|
| `frontend/components/desktop/NightCityWallpaper.tsx` | Replace remaining impure randomness with seeded RNG |
| `frontend/app/player/[address]/not-found.tsx` | Use `next/link` |
| `frontend/components/player/PlayerProfileBody.tsx` | Adjust effect/loading pattern |
| `frontend/components/windows/HighScoreWindow.tsx` | Adjust effect/loading/tab pattern |
| `frontend/components/windows/MyNftsWindow.tsx` | Adjust effect/loading pattern |
| `frontend/components/windows/SeasonAdminWindow.tsx` | Adjust effect/error refresh pattern |
| `frontend/components/game/GameCanvas.tsx` | Fix touch detection pattern |
| `frontend/components/game/tetris/TetrisCanvas.tsx` | Stop reading/updating refs during render |
| `frontend/components/game/pacman/PacManCanvas.tsx` | Stop render-time ref access and loop callback ordering issue |
| `frontend/components/game/*Engine.ts` | Prefer `const` where lint requires, no logic changes |
| `frontend/lib/stacks.ts` | Add config parser/validation |
| `frontend/lib/game-registry.ts` | Validate registry shape and existing constants |
| `frontend/lib/metadata-route.ts` | New shared metadata helper |
| `frontend/app/api/metadata/*/[id]/route.ts` | Thin wrappers around helper |
| `docs/mainnet-review.md` | Update status and clarify resolved vs deferred items |

Explicitly unchanged:

- `contract/contracts/*.clar`
- `contract/deployments/*.yaml`
- `contract/tests/*`
- deployed contract addresses and names

## Testing

Required verification:

```bash
cd frontend
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Optional smoke checks after build:

- open desktop locally and start each game
- finish a game and verify mint dialog still opens
- open High Score, My NFTs, Season Admin, and player profile screens
- hit each metadata route for a known token id and an invalid id

Contract safety check:

```bash
git diff -- contract
```

Expected: no changes.

## Risk

Low to medium. The work is frontend-only, but game canvas components are stateful and
can regress controls, pause behavior, or rendering if ref/state mirroring is done
carelessly. Keep changes incremental and run tests after each group.

The config validation change can surface missing env vars earlier. That is desired
for production, but local development defaults should be documented if retained.

