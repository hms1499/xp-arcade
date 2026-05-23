# Frontend Hardening Without Contract Changes Implementation Plan

> **For agentic workers:** Implement task-by-task. Keep all changes out of
> `contract/` unless the user explicitly expands scope. Do not change deployed
> contract addresses, contract names, mint fees, or ABI assumptions.

**Goal:** Make the frontend release gates clean (`lint`, `type-check`, `test`,
`build`), reduce runtime config risk, remove metadata API duplication, and update
stale docs without affecting the current contracts.

**Architecture:** Preserve current deployed contract integration. Fix React/Next
lint issues in the UI layer, add validation around existing frontend config, extract
shared metadata route code, then update docs to reflect current v2 limitations and
deferred v3 work.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zustand 5, Vitest 3,
Stacks SDK v7/v8.

Spec:
`docs/superpowers/specs/2026-05-23-frontend-hardening-no-contract-design.md`

Repo root: `/Users/vanhuy/Desktop/xp-snake`. Frontend commands run from
`/Users/vanhuy/Desktop/xp-snake/frontend`.

---

## File Map

| Area | Files |
|------|-------|
| Lint/UI fixes | `frontend/components/desktop/NightCityWallpaper.tsx`, `frontend/app/player/[address]/not-found.tsx`, `frontend/components/player/PlayerProfileBody.tsx`, `frontend/components/windows/*.tsx`, `frontend/components/game/**/*.tsx`, `frontend/components/game/**/*Engine.ts` |
| Config validation | `frontend/lib/stacks.ts`, `frontend/lib/game-registry.ts`, new focused tests if useful |
| Metadata helper | new `frontend/lib/metadata-route.ts`, existing `frontend/app/api/metadata/*/[id]/route.ts` |
| Docs | `docs/mainnet-review.md`, optionally README if wording conflicts |

---

## Task 1: Establish a clean baseline and protect contract scope

- [ ] Run `git status --short` and note existing unrelated changes.
- [ ] Run `cd frontend && npm run lint` and save the current error categories.
- [ ] Run `cd frontend && npx tsc --noEmit`.
- [ ] Run `cd frontend && npm test`.
- [ ] Do not modify any file under `contract/`.

Expected baseline:

- Type-check passes.
- Tests pass.
- Lint fails before this work.

---

## Task 2: Fix simple lint issues first

**Files:**

- `frontend/components/desktop/NightCityWallpaper.tsx`
- `frontend/app/player/[address]/not-found.tsx`
- game engine/test files with unused imports or `prefer-const`
- text JSX files with `react/no-unescaped-entities`

Steps:

- [ ] Replace `Math.random()` in `NightCityWallpaper` with the existing seeded RNG
  function.
- [ ] Replace internal `<a href="/">` links with `Link` from `next/link`.
- [ ] Remove unused imports/variables reported by lint.
- [ ] Convert `let` to `const` where lint reports `prefer-const`.
- [ ] Escape unescaped apostrophes in JSX text or move text to string constants.
- [ ] Run `cd frontend && npm run lint`.

Expected result: simple style/navigation lint errors are gone; remaining errors are
React state/ref pattern issues.

---

## Task 3: Fix touch detection and loading effect patterns

**Files:**

- `frontend/components/game/GameCanvas.tsx`
- `frontend/components/game/tetris/TetrisCanvas.tsx`
- `frontend/components/game/pacman/PacManCanvas.tsx`
- `frontend/components/player/PlayerProfileBody.tsx`
- `frontend/components/windows/HighScoreWindow.tsx`
- `frontend/components/windows/MyNftsWindow.tsx`
- `frontend/components/windows/SeasonAdminWindow.tsx`

Steps:

- [ ] For touch detection, initialize state lazily with a browser guard where safe:
  `useState(() => typeof window !== "undefined" && window.matchMedia(...).matches)`.
- [ ] If live pointer changes matter, subscribe to `matchMedia` changes in an effect
  and update state from the listener rather than synchronously setting state in the
  effect body.
- [ ] For data-loading windows, avoid immediate reset setState patterns that lint
  rejects. Prefer a single request state object (`loading`, `error`, `data`) or a
  reducer update that represents the transition.
- [ ] Preserve current loading UI behavior.
- [ ] Run `cd frontend && npm run lint`.
- [ ] Run focused tests if touched files have tests.

Expected result: `react-hooks/set-state-in-effect` errors are removed without
changing user-visible behavior.

---

## Task 4: Fix game canvas ref access during render

**Files:**

- `frontend/components/game/tetris/TetrisCanvas.tsx`
- `frontend/components/game/pacman/PacManCanvas.tsx`

Steps for Tetris:

- [ ] Keep `stateRef` for game-loop state.
- [ ] Add React state for UI-facing values: `level`, `lines`, `gameOver`.
- [ ] Update those UI values inside the existing `setState(next)` helper.
- [ ] Move level tick-speed adjustment out of render. Trigger it when level changes
  from `setState(next)` or a controlled effect based on the mirrored `level`.
- [ ] Render sidebar stats from mirrored React state, not `stateRef.current`.
- [ ] Keep keyboard controls and pause behavior unchanged.

Steps for Pac-Man:

- [ ] Initialize `lives` from a constant initial state or `createPacManState().lives`
  outside render-time ref access.
- [ ] Ensure the animation loop callback does not reference itself before declaration
  in a way that lint rejects. Use a stable RAF runner pattern if needed.
- [ ] Keep canvas drawing state in refs, but mirror only UI-facing values into React
  state.
- [ ] Run `cd frontend && npm run lint`.
- [ ] Run `cd frontend && npm test -- TetrisEngine PacManEngine`.
- [ ] Manually smoke test pause/resume and controls for both games.

Expected result: no `react-hooks/refs` or callback ordering lint errors.

---

## Task 5: Add frontend config validation without changing contract targets

**Files:**

- `frontend/lib/stacks.ts`
- `frontend/lib/game-registry.ts`
- optional tests near `frontend/lib/*`

Steps:

- [ ] Add a small parser for `NEXT_PUBLIC_CONTRACT_ADDRESS` that requires
  `ADDRESS.contract-name`.
- [ ] Validate `NEXT_PUBLIC_NETWORK` as `mainnet` or `testnet`; keep current default
  only if intentionally documented.
- [ ] Validate each `GAMES` entry has non-empty `contractAddress`, `contractName`,
  `nftAssetName`, `metaSegment`, and positive `mintFeeUstx`.
- [ ] Preserve the existing values in `game-registry.ts`.
- [ ] Add focused unit tests for parser/validation if exported.
- [ ] Run `cd frontend && npx tsc --noEmit && npm test`.

Expected result: malformed frontend config fails early and clearly; existing deployed
contract integration remains unchanged.

---

## Task 6: Extract shared metadata route helper

**Files:**

- Create `frontend/lib/metadata-route.ts`
- Modify:
  - `frontend/app/api/metadata/score/[id]/route.ts`
  - `frontend/app/api/metadata/tetris/[id]/route.ts`
  - `frontend/app/api/metadata/pacman/[id]/route.ts`

Steps:

- [ ] Create a helper that accepts request, route params, game definition, rate-limit
  key prefix, display name, and description label.
- [ ] Move shared id parsing, rate limiting, read-only lookup, SVG generation, JSON
  response, cache headers, and error handling into the helper.
- [ ] Keep route URLs and JSON shape unchanged.
- [ ] Make Snake route use the same game registry path as Tetris/Pac-Man unless
  there is a documented reason to keep `stacks.contractAddress`.
- [ ] Add/adjust tests if route helpers are testable without full Next runtime.
- [ ] Run `cd frontend && npx tsc --noEmit && npm test`.

Expected result: metadata behavior is unchanged, but duplication is removed.

---

## Task 7: Update docs for current v2 reality

**Files:**

- `docs/mainnet-review.md`
- optionally `README.md` if wording conflicts

Steps:

- [ ] Mark `docs/mainnet-review.md` as historical or update it with current status.
- [ ] Split items into resolved, accepted v2 limitations, and deferred v3 work.
- [ ] Make clear that current no-contract hardening does not fix trustless payout or
  client-trusted score.
- [ ] Link to the v3 trustless claim spec for contract-level future work.
- [ ] Keep README contract addresses and current feature descriptions intact unless
  they are factually stale.

Expected result: operators no longer see a stale "not ready" review without context.

---

## Task 8: Full verification

Run from `/Users/vanhuy/Desktop/xp-snake/frontend`:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Then from repo root:

```bash
git diff -- contract
```

Expected:

- lint passes
- type-check passes
- tests pass
- production build completes
- no contract diff

Manual smoke:

- [ ] Start dev server.
- [ ] Open desktop.
- [ ] Launch Snake, Tetris, Pac-Man.
- [ ] Verify controls, pause, game over, and mint dialog still work.
- [ ] Open High Score, My NFTs, Season Admin.
- [ ] Visit one valid and one invalid metadata route for each game.

---

## Suggested Commit Order

1. `fix(frontend): resolve simple Next and React lint issues`
2. `fix(games): align canvas state with React lint rules`
3. `chore(config): validate frontend contract configuration`
4. `refactor(metadata): share score metadata route handling`
5. `docs: update mainnet review status and frontend hardening plan`

