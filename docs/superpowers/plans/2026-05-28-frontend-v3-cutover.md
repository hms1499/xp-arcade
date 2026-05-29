# Frontend Cutover to xp-arcade-v3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repoint the frontend from the four per-game v2 contracts to the single `xp-arcade-v3` registry (passing `game-id` on every call), add trustless player claim UI, and hard-delete the obsolete owner-payout machinery.

**Architecture:** One shared contract id (`<deployer>.xp-arcade-v3`) for all games; a static `onchainId` map (snake=1, tetris=2, pacman=3, breakout=4) drives the `game-id` uint argument prepended to each contract call. The metadata `score` route becomes the universal v3 route, resolving the game from each token's on-chain `game-id`. Owner-initiated payout is replaced by player-pull `claim-prize`.

**Tech Stack:** Next.js 16 App Router + TypeScript 5, `@stacks/connect` ^8.2, `@stacks/transactions` ^7.4, Zustand 5, Vitest 3 (jsdom).

**Spec:** `docs/superpowers/specs/2026-05-28-frontend-v3-cutover-design.md`.

**Conventions for every task:**
- Work in `frontend/`. Run tests with `npm test` (or scoped `npx vitest run <path> -t "<name>"`). Type-check with `npx tsc --noEmit`.
- Every commit must build and pass tests (CLAUDE.md "every commit green").
- Conventional commit prefixes, NO `Co-Authored-By` trailer, stage explicit files only.
- Do NOT commit doc `.md` files (specs/plans) — project convention.
- The v3 contract is frozen and complete — never edit `contract/`. Contract arg orders are authoritative (see below).

**v3 contract call signatures (authoritative — match exactly):**
- `mint-score (game-id score player-name)` · `claim-prize (game-id season)` · `end-season (game-id)`
- `get-top-ten (game-id)` · `get-current-season (game-id)` · `get-prize-pool-balance (game-id)` · `get-season-prize (game-id season)`
- `get-best-score (game-id player)` · `get-mints-remaining (game-id player)`
- `has-claimed-prize (player game-id season)` ← player FIRST
- `get-last-token-id ()` ← global, NO game-id · `get-score-data (token-id)`

**Precondition (manual, outside this plan):** Deploy `xp-arcade-v3` to mainnet, call `register-game` for all 4 games, set `NEXT_PUBLIC_CONTRACT_ADDRESS=<deployer>.xp-arcade-v3` in Vercel + `.env`. The code below is unit-testable without deploy; live wallet testing needs the env pointing at the deployed contract.

---

## File Structure

- **Modify** `frontend/lib/game-registry.ts` — add `onchainId`, shared contract name/asset, `onchainIdFor`/`gameIdFromOnchain` helpers.
- **Modify** `frontend/lib/game-registry.test.ts` — update assertions for the shared v3 contract; add helper tests.
- **Modify** `frontend/lib/stacks.ts` — retarget the contract-id guard to the v3 contract.
- **Modify** `frontend/lib/stacks.test.ts` — update assertions to the v3 contract.
- **Modify** `frontend/lib/contract-calls.ts` — prepend `game-id` to `*ForGame` calls, add `claimPrizeV3`, then delete legacy snake-only duplicates.
- **Create** `frontend/lib/contract-calls.test.ts` — arg-shaping unit tests.
- **Delete** `frontend/components/dialogs/MintDialog.tsx` — dead (rendered nowhere); sole consumer of legacy `mintScore`.
- **Modify** `frontend/lib/metadata-route.ts` + **Modify** `frontend/app/api/metadata/score/[id]/route.ts` — universal v3 route resolving game by `game-id`.
- **Modify** `frontend/lib/metadata-route.test.ts` — cover the v3 game resolution.
- **Modify** `frontend/components/windows/HighScoreWindow.tsx` — add claim UI inside `LeaderboardTab`.
- **Modify** `frontend/components/windows/SeasonAdminWindow.tsx` — gut to End Season + read-only.
- **Delete** `frontend/state/payout-ledger.ts`, `frontend/lib/reconciliation.ts`, `frontend/lib/payout-csv.ts`, `frontend/lib/payout-memo.ts`, `frontend/lib/stx-balance.ts` (+ their `.test.ts`), and `frontend/lib/tx-tracker.ts` (+ test, only if unused). Remove `transferStx` from `contract-calls.ts`.
- **Modify** `frontend/.env.example` — document the shared v3 contract var.

---

## Task 1: game-registry — onchainId + shared v3 contract + helpers

**Files:**
- Modify: `frontend/lib/game-registry.ts`
- Test: `frontend/lib/game-registry.test.ts`

- [ ] **Step 1: Update the failing tests first**

In `frontend/lib/game-registry.test.ts`, REPLACE the `nftAssetName` test (lines ~33-38) and the `expectedPrimaryContractId` test (lines ~64-68) with the v3 expectations, and ADD a helper test. Apply these edits:

Replace the `nftAssetName matches...` test body with:
```typescript
  it("uses the shared v3 NFT asset name for all games", () => {
    expect(GAMES.snake.nftAssetName).toBe("xp-score");
    expect(GAMES.tetris.nftAssetName).toBe("xp-score");
    expect(GAMES.pacman.nftAssetName).toBe("xp-score");
    expect(GAMES.breakout.nftAssetName).toBe("xp-score");
  });

  it("maps every game to the single shared v3 contract", () => {
    for (const id of ["snake", "tetris", "pacman", "breakout"] as GameId[]) {
      expect(GAMES[id].contractName).toBe("xp-arcade-v3");
      expect(GAMES[id].contractAddress).toBe("SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV");
    }
  });

  it("assigns unique positive onchainIds", () => {
    expect(GAMES.snake.onchainId).toBe(1);
    expect(GAMES.tetris.onchainId).toBe(2);
    expect(GAMES.pacman.onchainId).toBe(3);
    expect(GAMES.breakout.onchainId).toBe(4);
  });
```

Replace the `exposes the expected primary Snake contract id` test body with:
```typescript
  it("exposes the shared v3 contract id as primary", () => {
    expect(expectedPrimaryContractId()).toBe(
      "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v3",
    );
  });
```

Add a new describe block at the end of the file:
```typescript
import { onchainIdFor, gameIdFromOnchain } from "./game-registry";

describe("onchain id mapping", () => {
  it("round-trips game id <-> onchain id", () => {
    for (const id of ["snake", "tetris", "pacman", "breakout"] as GameId[]) {
      expect(gameIdFromOnchain(onchainIdFor(id))).toBe(id);
    }
  });

  it("throws on an unknown onchain id", () => {
    expect(() => gameIdFromOnchain(99)).toThrow(/onchain id/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run lib/game-registry.test.ts`
Expected: FAIL — `onchainId` undefined, `contractName` mismatch, `onchainIdFor`/`gameIdFromOnchain` not exported.

- [ ] **Step 3: Implement the registry changes**

In `frontend/lib/game-registry.ts`:

(a) Add `onchainId` to the interface:
```typescript
export interface GameDef {
  id: GameId;
  label: string;
  emoji: string;
  onchainId: number;
  contractAddress: string;
  contractName: string;
  mintFeeUstx: bigint;
  metaSegment: string;
  nftAssetName: string;
}
```

(b) Update the `GameConfig` Omit and `GAME_METADATA` Pick to include `onchainId`; set `onchainId` + shared `nftAssetName: "xp-score"` per game. Replace the `GAME_METADATA` map with:
```typescript
type GameConfig = Omit<GameDef, "id" | "label" | "emoji" | "onchainId" | "mintFeeUstx" | "metaSegment" | "nftAssetName">;

const MAINNET_DEPLOYER = "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";
const V3_CONTRACT_NAME = "xp-arcade-v3";

const GAME_METADATA: Record<
  GameId,
  Pick<GameDef, "id" | "label" | "emoji" | "onchainId" | "mintFeeUstx" | "metaSegment" | "nftAssetName">
> = {
  snake:    { id: "snake",    label: "Snake",     emoji: "🐍", onchainId: 1, mintFeeUstx: BigInt(10_000), metaSegment: "score",    nftAssetName: "xp-score" },
  tetris:   { id: "tetris",   label: "Tetris",    emoji: "🧱", onchainId: 2, mintFeeUstx: BigInt(20_000), metaSegment: "tetris",   nftAssetName: "xp-score" },
  pacman:   { id: "pacman",   label: "Pac-Man",   emoji: "👾", onchainId: 3, mintFeeUstx: BigInt(20_000), metaSegment: "pacman",   nftAssetName: "xp-score" },
  breakout: { id: "breakout", label: "XP Bricks", emoji: "🏓", onchainId: 4, mintFeeUstx: BigInt(20_000), metaSegment: "breakout", nftAssetName: "xp-score" },
};
```

(c) Point every game at the shared v3 contract. Replace `GAME_CONTRACTS` with:
```typescript
const SHARED_V3: GameConfig = { contractAddress: MAINNET_DEPLOYER, contractName: V3_CONTRACT_NAME };

const GAME_CONTRACTS: Record<NetworkName, Record<GameId, GameConfig>> = {
  mainnet: { snake: SHARED_V3, tetris: SHARED_V3, pacman: SHARED_V3, breakout: SHARED_V3 },
  testnet: { snake: SHARED_V3, tetris: SHARED_V3, pacman: SHARED_V3, breakout: SHARED_V3 },
};
```

(d) Extend `validateGameDef` to check `onchainId` (add before the final `return game;`):
```typescript
  if (!Number.isInteger(game.onchainId) || game.onchainId <= 0) {
    throw new Error(`Invalid ${game.id} onchain id`);
  }
```

(e) Add the helpers at the end of the file (after `GAMES` is defined):
```typescript
export function onchainIdFor(gameId: GameId): number {
  return GAMES[gameId].onchainId;
}

export function gameIdFromOnchain(n: number): GameId {
  const found = GAME_IDS.find((id) => GAMES[id].onchainId === n);
  if (!found) throw new Error(`Unknown onchain id: ${n}`);
  return found;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run lib/game-registry.test.ts`
Expected: PASS. Then `npx tsc --noEmit` — fix any type errors surfaced by the new `onchainId` field.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/game-registry.ts frontend/lib/game-registry.test.ts
git commit -m "feat(frontend): map games to shared xp-arcade-v3 contract with onchainId"
```

---

## Task 2: stacks.ts — retarget contract-id guard to v3

**Files:**
- Modify: `frontend/lib/stacks.ts`
- Test: `frontend/lib/stacks.test.ts`

The guard already compares against `expectedPrimaryContractId()`, which Task 1 changed to the v3 id. Only the test literals need updating — but verify the runtime accepts the v3 id.

- [ ] **Step 1: Update the tests**

In `frontend/lib/stacks.test.ts`, replace the `parseContractId` describe block's literals so they use the v3 contract name. Apply:
```typescript
describe("parseContractId", () => {
  it("parses ADDRESS.contract-name", () => {
    expect(parseContractId("SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v3")).toEqual({
      contractAddress: "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV",
      contractName: "xp-arcade-v3",
    });
  });

  it("defaults to the shared v3 registry contract when unset", () => {
    expect(parseContractId(undefined)).toEqual({
      contractAddress: GAMES.snake.contractAddress,
      contractName: GAMES.snake.contractName,
    });
  });

  it("rejects a contract id that does not match registry config", () => {
    expect(() =>
      parseContractId("SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.snake-score-v2"),
    ).toThrow(/must match configured/);
  });

  it("rejects malformed ids", () => {
    expect(() => parseContractId(".")).toThrow(/ADDRESS\.contract-name/);
    expect(() => parseContractId("xp-arcade-v3")).toThrow(/ADDRESS\.contract-name/);
    expect(() => parseContractId("bad.xp-arcade-v3")).toThrow(/Invalid contract address/);
  });
});
```

- [ ] **Step 2: Run to verify**

Run: `cd frontend && npx vitest run lib/stacks.test.ts`
Expected: PASS (Task 1 already retargeted `expectedPrimaryContractId`). If the error message in the mismatch test differs, update the regex to match `stacks.ts`'s actual throw text.

- [ ] **Step 3: Soften the mismatch error wording (optional)**

The throw in `stacks.ts` says "must match configured Snake contract". Generalize it so it isn't Snake-specific. In `frontend/lib/stacks.ts`, change the throw message to:
```typescript
      `NEXT_PUBLIC_CONTRACT_ADDRESS (${fullId}) must match configured contract (${expectedContractId})`,
```
Ensure the test regex above (`/must match configured/`) still matches.

- [ ] **Step 4: Run + type-check**

Run: `cd frontend && npx vitest run lib/stacks.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/stacks.ts frontend/lib/stacks.test.ts
git commit -m "refactor(frontend): retarget contract-id guard to xp-arcade-v3"
```

---

## Task 3: contract-calls — prepend game-id, add claimPrizeV3

**Files:**
- Modify: `frontend/lib/contract-calls.ts`
- Create: `frontend/lib/contract-calls.test.ts`

Keep the legacy snake-only functions for now (deleted in Task 5 after their consumer is removed in Task 4) so this commit stays green.

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/contract-calls.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { uintCV, principalCV } from "@stacks/transactions";

// Capture openContractCall options.
const calls: any[] = [];
vi.mock("@stacks/connect", () => ({
  openContractCall: (opts: any) => { calls.push(opts); /* never resolves: we only inspect args */ },
  request: vi.fn(),
}));

// Override only fetchCallReadOnlyFunction; keep the real CV constructors.
const readCalls: any[] = [];
vi.mock("@stacks/transactions", async (orig) => {
  const actual = await (orig as any)();
  return {
    ...actual,
    fetchCallReadOnlyFunction: (opts: any) => {
      readCalls.push(opts);
      // Minimal CV the unwrap layer tolerates: an `(ok none)`-ish value.
      return Promise.resolve(actual.noneCV());
    },
  };
});

import {
  getBestScoreForGame,
  hasClaimedPrizeForGame,
  getTopTenForGame,
  claimPrizeV3,
  mintScoreForGame,
} from "./contract-calls";

const ADDR = "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";

beforeEach(() => { calls.length = 0; readCalls.length = 0; });

describe("contract-calls v3 arg shaping", () => {
  it("get-top-ten prepends the game-id", async () => {
    await getTopTenForGame("tetris").catch(() => {});
    expect(readCalls[0].functionName).toBe("get-top-ten");
    expect(readCalls[0].functionArgs).toEqual([uintCV(2)]);
    expect(readCalls[0].contractName).toBe("xp-arcade-v3");
  });

  it("get-best-score sends [game-id, player]", async () => {
    await getBestScoreForGame("snake", ADDR).catch(() => {});
    expect(readCalls[0].functionArgs).toEqual([uintCV(1), principalCV(ADDR)]);
  });

  it("has-claimed-prize sends [player, game-id, season] (player first)", async () => {
    await hasClaimedPrizeForGame("pacman", ADDR, 1).catch(() => {});
    expect(readCalls[0].functionArgs).toEqual([principalCV(ADDR), uintCV(3), uintCV(1)]);
  });

  it("mint-score sends [game-id, score, name]", async () => {
    await mintScoreForGame("snake", 42, "alice", ADDR).catch(() => {});
    expect(calls[0].functionName).toBe("mint-score");
    expect(calls[0].functionArgs[0]).toEqual(uintCV(1));
    expect(calls[0].functionArgs[1]).toEqual(uintCV(42));
  });

  it("claim-prize sends [game-id, season]", async () => {
    claimPrizeV3("breakout", 1, ADDR).catch(() => {});
    expect(calls[0].functionName).toBe("claim-prize");
    expect(calls[0].functionArgs).toEqual([uintCV(4), uintCV(1)]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run lib/contract-calls.test.ts`
Expected: FAIL — args lack the game-id; `claimPrizeV3` not exported. (If the `noneCV()` unwrap throws, that's fine — the `.catch()` swallows it; we only assert the captured request args.)

- [ ] **Step 3: Add game-id args + claimPrizeV3**

In `frontend/lib/contract-calls.ts`:

(a) Import the helper:
```typescript
import { GAMES, onchainIdFor, type GameId } from "./game-registry";
```

(b) Prepend `uintCV(onchainIdFor(gameId))` to each `*ForGame` call's `functionArgs`, matching the authoritative signatures. The full updated bodies:
```typescript
export async function mintScoreForGame(
  gameId: GameId, score: number, playerName: string, senderAddress: string,
): Promise<string> {
  const g = GAMES[gameId];
  return new Promise((resolve, reject) => {
    openContractCall({
      ...gameBase(gameId),
      functionName: "mint-score",
      functionArgs: [uintCV(onchainIdFor(gameId)), uintCV(score), stringAsciiCV(playerName.slice(0, 24))],
      postConditions: [Pc.principal(senderAddress).willSendEq(g.mintFeeUstx).ustx()],
      onFinish: (data) => resolve(data.txId),
      onCancel: () => reject(new Error("cancelled")),
    });
  });
}
```
For each read-only `*ForGame`, set `functionArgs`:
- `getTopTenForGame`: `[uintCV(onchainIdFor(gameId))]`
- `getBestScoreForGame`: `[uintCV(onchainIdFor(gameId)), principalCV(addr)]`
- `getMintsRemaining`: `[uintCV(onchainIdFor(gameId)), principalCV(player)]`
- `getCurrentSeasonForGame`: `[uintCV(onchainIdFor(gameId))]`
- `getPrizePoolBalanceForGame`: `[uintCV(onchainIdFor(gameId))]`
- `getSeasonPrizeForGame`: `[uintCV(onchainIdFor(gameId)), uintCV(season)]`
- `hasClaimedPrizeForGame`: `[principalCV(player), uintCV(onchainIdFor(gameId)), uintCV(season)]`
- `endSeasonForGame`: `[uintCV(onchainIdFor(gameId))]`
- `getLastTokenIdForGame`: DELETE this function (v3 `get-last-token-id` is global). Keep the global `getLastTokenId()` (Step (d)).

(c) Add `claimPrizeV3` (place near `endSeasonForGame`):
```typescript
export async function claimPrizeV3(
  gameId: GameId, season: number, senderAddress: string,
): Promise<string> {
  void senderAddress; // reserved for a future contract-send post-condition (see note)
  return new Promise((resolve, reject) => {
    openContractCall({
      ...gameBase(gameId),
      functionName: "claim-prize",
      functionArgs: [uintCV(onchainIdFor(gameId)), uintCV(season)],
      onFinish: (data) => resolve(data.txId),
      onCancel: () => reject(new Error("cancelled")),
    });
  });
}
```
> NOTE on post-conditions: `claim-prize` pays the caller via `as-contract`. Wallets in deny-mode may block the inbound transfer without a post-condition allowing the CONTRACT to send STX. During live testing, if the wallet rejects, add `postConditions: [Pc.principal(\`${GAMES[gameId].contractAddress}.${GAMES[gameId].contractName}\`).willSendLte(payoutUstx).ustx()]` (the contract caps payout, so `willSendLte` is correct). The caller in Task 7 has the computed payout to pass. Leave the param wired now; verify the PC during Task 7 manual testing.

(d) Keep the global `getLastTokenId()` but make sure it targets v3 (it already uses `base`, which now resolves to v3 via `stacks`). No arg change — `functionArgs: []`.

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run lib/contract-calls.test.ts && npx tsc --noEmit`
Expected: PASS. (Legacy snake-only functions still present — `tsc` clean.)

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/contract-calls.ts frontend/lib/contract-calls.test.ts
git commit -m "feat(frontend): pass game-id on v3 calls and add claimPrizeV3"
```

---

## Task 4: delete dead MintDialog

**Files:**
- Delete: `frontend/components/dialogs/MintDialog.tsx`

`MintDialog` is rendered nowhere (verified) and is the only consumer of the legacy snake-only `mintScore`. Removing it unblocks the legacy deletion in Task 5.

- [ ] **Step 1: Confirm it is unreferenced**

Run: `cd frontend && grep -rn "dialogs/MintDialog\|<MintDialog" components app hooks state | grep -v "SharedMintDialog"`
Expected: no output (only the file itself exists). If anything references it, STOP and migrate that caller to `SharedMintDialog` first.

- [ ] **Step 2: Delete the file**

```bash
git rm frontend/components/dialogs/MintDialog.tsx
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit && npm run build 2>&1 | tail -5`
Expected: no type errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(frontend): remove dead snake-only MintDialog"
```

---

## Task 5: remove legacy snake-only contract-calls

**Files:**
- Modify: `frontend/lib/contract-calls.ts`

With `MintDialog` gone, the legacy snake-only duplicates have no consumers (the global `getLastTokenId` and `computePayoutUstx` are NOT legacy — keep them).

- [ ] **Step 1: Confirm no consumers remain**

Run:
```bash
cd frontend && grep -rn "\b\(mintScore\|getTopTen\|getBestScore\|getPrizePoolBalance\|getSeasonPrize\|hasClaimedPrize\|getCurrentSeason\|endSeason\)(" components app hooks state | grep -v "ForGame" | grep -v "high-score" | grep -v "\.test\."
```
Expected: no output. (Any `getBestScore` hit from `@/lib/high-score` is unrelated — that's localStorage, keep it.)

- [ ] **Step 2: Delete the legacy functions**

In `frontend/lib/contract-calls.ts`, delete these exported functions and the now-unused `base`/`MINT_FEE_USTX` consts if nothing else uses them: `mintScore`, `getTopTen`, `getBestScore`, `getPrizePoolBalance`, `getSeasonPrize`, `hasClaimedPrize`, `getCurrentSeason`, `endSeason`. KEEP: all `*ForGame` functions, `getLastTokenId` (global), `claimPrizeV3`, `computePayoutUstx`, the type exports (`TopEntry`, `SeasonPrize`), and `transferStx` (removed later in Task 9). If `getLastTokenId` used `base`, inline the contract target so `base` can be removed cleanly, or keep `base` if `getLastTokenId`/`transferStx` still need it.

- [ ] **Step 3: Verify**

Run: `cd frontend && npx tsc --noEmit && npx vitest run lib/contract-calls.test.ts`
Expected: no type errors (no dangling imports of deleted functions), tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/contract-calls.ts
git commit -m "refactor(frontend): drop legacy snake-only contract calls"
```

---

## Task 6: metadata score route → universal v3 game resolution

**Files:**
- Modify: `frontend/lib/metadata-route.ts`
- Modify: `frontend/app/api/metadata/score/[id]/route.ts`
- Test: `frontend/lib/metadata-route.test.ts`

v3 `get-token-uri` concatenates the id, so ALL v3 tokens resolve via `/api/metadata/score/<id>`. The `score` route must read the token's on-chain `game-id` and render that game's card. (The `tetris`/`pacman`/`breakout` routes stay for frozen v2 collections — do not touch.)

- [ ] **Step 1: Write the failing test**

In `frontend/lib/metadata-route.test.ts`, add a test that a v3-style `score-data` (with `game-id`) resolves the game name. The existing tests mock `fetchCallReadOnlyFunction`; follow that pattern. Add:
```typescript
it("resolves the game name from the token's on-chain game-id (v3)", async () => {
  // Arrange a mocked get-score-data returning game-id 2 (tetris).
  // (Match the existing mock style in this file: return a CV that unwraps to
  //  { score, "player-name", rarity, season, "game-id" }.)
  const res = await scoreMetadataResponseV3(
    new Request("http://x/api/metadata/score/5"),
    Promise.resolve({ id: "5" }),
  );
  const body = await res.json();
  expect(body.name).toContain("Tetris");
});
```
> If the existing test file already has a reusable mock helper for `fetchCallReadOnlyFunction`, reuse it and set the returned tuple's `game-id` to `uintCV(2)`. If not, mock `@stacks/transactions` `fetchCallReadOnlyFunction` to return a tuple CV with the fields above.

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run lib/metadata-route.test.ts -t "v3"`
Expected: FAIL — `scoreMetadataResponseV3` not defined.

- [ ] **Step 3: Implement the v3 resolver**

In `frontend/lib/metadata-route.ts`:
(a) Extend the `ScoreData` type with `"game-id": string;`.
(b) Add a new exported function that queries the shared v3 contract and resolves the game by id:
```typescript
import { GAMES, gameIdFromOnchain } from "@/lib/game-registry";

export async function scoreMetadataResponseV3(
  req: Request,
  params: Promise<{ id: string }>,
) {
  const { id } = await params;
  const tokenId = Number(id);
  if (!Number.isFinite(tokenId) || tokenId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") || "anon";
  const rl = rateLimit(`metadata:${ip}`, RL_LIMIT, RL_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate limited" }, {
      status: 429,
      headers: { "Retry-After": Math.ceil((rl.resetAt - Date.now()) / 1000).toString() },
    });
  }
  try {
    const res = await fetchCallReadOnlyFunction({
      network: stacks.network,
      contractAddress: stacks.contractAddress,
      contractName: stacks.contractName,
      functionName: "get-score-data",
      functionArgs: [uintCV(tokenId)],
      senderAddress: stacks.contractAddress,
    });
    const v = unwrap<null | ScoreData>(cvToValue(res));
    if (!v) {
      return NextResponse.json({ error: "not found" }, {
        status: 404, headers: { "Cache-Control": "public, max-age=60" },
      });
    }
    const gameId = gameIdFromOnchain(Number(v["game-id"]));
    const gameName = GAMES[gameId].label;
    const rarity = String(v.rarity ?? "Common");
    const season = Number(v.season ?? 1);
    const svg = scoreSvg({
      tokenId, score: Number(v.score), playerName: String(v["player-name"]), rarity, gameName,
    });
    return NextResponse.json(
      {
        name: `${gameName} Score #${tokenId}`,
        description: `On-chain proof of a ${gameName} game score: ${v.score}.`,
        image: "data:image/svg+xml;utf8," + encodeURIComponent(svg),
        attributes: [
          { trait_type: "Rarity", value: rarity },
          { trait_type: "Season", value: String(season) },
          { trait_type: "Score", value: String(Number(v.score)) },
          { trait_type: "Game", value: gameName },
        ],
      },
      { headers: { "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "lookup failed" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Point the score route at the v3 resolver**

Replace `frontend/app/api/metadata/score/[id]/route.ts` with:
```typescript
import { scoreMetadataResponseV3 } from "@/lib/metadata-route";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return scoreMetadataResponseV3(req, params);
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd frontend && npx vitest run lib/metadata-route.test.ts && npx tsc --noEmit`
Expected: PASS. The original `scoreMetadataResponse` stays exported (still used by the tetris/pacman/breakout v2 routes) — do not delete it.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/metadata-route.ts frontend/lib/metadata-route.test.ts "frontend/app/api/metadata/score/[id]/route.ts"
git commit -m "feat(frontend): resolve v3 token metadata by on-chain game-id"
```

---

## Task 7: HighScoreWindow — player claim UI

**Files:**
- Modify: `frontend/components/windows/HighScoreWindow.tsx`

`LeaderboardTab` already loads `season`, `address`, and the sorted top-ten per `gameId`. Add claim eligibility for the most-recently-closed season the connected wallet won.

- [ ] **Step 1: Read the component**

Read `frontend/components/windows/HighScoreWindow.tsx` fully to locate `LeaderboardTab` (around lines 57-200), its `useEffect` data load, and where `season`/`address`/the sorted rows render.

- [ ] **Step 2: Add the claim helper + eligibility load**

Add imports at the top of the file:
```typescript
import {
  getSeasonPrizeForGame,
  hasClaimedPrizeForGame,
  claimPrizeV3,
  computePayoutUstx,
} from "@/lib/contract-calls";
import { useToasts } from "@/state/toasts"; // adjust to the project's toast hook
```
Inside `LeaderboardTab`, add state and an effect that, when `address` is set and `season` (current) is known and `> 1`, checks the previous season's snapshot:
```typescript
const [claim, setClaim] = useState<null | { season: number; amountUstx: number }>(null);
const [claiming, setClaiming] = useState(false);

useEffect(() => {
  if (!address || !season || season <= 1) { setClaim(null); return; }
  const closed = season - 1;
  let cancelled = false;
  (async () => {
    const [prize, already] = await Promise.all([
      getSeasonPrizeForGame(gameId, closed),
      hasClaimedPrizeForGame(gameId, address, closed),
    ]);
    if (cancelled || !prize || already) { setClaim(null); return; }
    const mine = prize.topTen.find((e) => e.player === address);
    if (!mine) { setClaim(null); return; }
    const higher = prize.topTen.filter((e) => e.score > mine.score).length;
    const rank = higher + 1;
    setClaim({ season: closed, amountUstx: computePayoutUstx(prize.total, rank) });
  })().catch(() => { if (!cancelled) setClaim(null); });
  return () => { cancelled = true; };
}, [address, season, gameId]);
```

- [ ] **Step 3: Render the Claim button**

Where the tab renders its footer/season line, add (only when `claim` is set):
```tsx
{claim && (
  <button
    className="claim-prize-btn"
    disabled={claiming}
    onClick={async () => {
      setClaiming(true);
      try {
        await claimPrizeV3(gameId, claim.season, address!);
        setClaim(null);
      } catch (e) {
        // surface via the project's toast/balloon system
      } finally {
        setClaiming(false);
      }
    }}
  >
    {claiming ? "Claiming..." : `Claim ${(claim.amountUstx / 1_000_000).toFixed(2)} STX`}
  </button>
)}
```
Match the existing xp.css button styling used elsewhere in the window; reuse the toast/balloon hook the file already imports for success/error feedback.

- [ ] **Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit && npm run build 2>&1 | tail -5`
Expected: no type errors, build succeeds. (No unit test for the JSX; manual coverage is in Step 5.)

- [ ] **Step 5: Manual smoke (document, run when env points at deployed v3)**

With a wallet that placed in a closed season's top-10: open HighScoreWindow for that game → "Claim X STX" appears → click → wallet prompts `claim-prize` → on confirm, STX arrives and the button disappears. An ineligible wallet sees no button. If the wallet denies the inbound STX, add the contract-send post-condition per the Task 3 note (`willSendLte(claim.amountUstx)`).

- [ ] **Step 6: Commit**

```bash
git add frontend/components/windows/HighScoreWindow.tsx
git commit -m "feat(frontend): add trustless claim-prize button to leaderboard"
```

---

## Task 8: SeasonAdminWindow — gut to End Season + read-only

**Files:**
- Modify: `frontend/components/windows/SeasonAdminWindow.tsx`

Remove all owner-payout controls; keep End Season, countdown, and read-only season views.

- [ ] **Step 1: Read the component**

Read `frontend/components/windows/SeasonAdminWindow.tsx` fully. Identify: the `transferStx` calls (lines ~295, ~352), reconciliation/CSV/balance imports, batch-pay handlers, and the read-only sections (current season, pool balance, snapshot, countdown).

- [ ] **Step 2: Remove the payout machinery**

Delete from the component: imports of `transferStx`, `payout-ledger`, `reconciliation`, `payout-csv`, `payout-memo`, `stx-balance` (and any `tx-tracker` used only for payout); the Send STX / Retry / Batch-pay buttons + handlers; the Reconciliation strip; the CSV export; the STX balance banner. Keep `isOwnerAddress`, the End Season button (wire to `endSeasonForGame(gameId)`), the soft countdown, and a read-only list of current season + `getPrizePoolBalanceForGame` + `getSeasonPrizeForGame` snapshot.

- [ ] **Step 3: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: no type errors. Resolve any dangling references to removed handlers/state.

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/windows/SeasonAdminWindow.tsx
git commit -m "refactor(frontend): reduce Season Admin to End Season + read-only views"
```

---

## Task 9: hard-delete obsolete owner-payout modules

**Files:**
- Delete: `frontend/state/payout-ledger.ts` (+ `.test.ts`), `frontend/lib/reconciliation.ts` (+ test), `frontend/lib/payout-csv.ts` (+ test), `frontend/lib/payout-memo.ts` (+ test), `frontend/lib/stx-balance.ts` (+ test)
- Modify: `frontend/lib/contract-calls.ts` (remove `transferStx`)
- Conditionally delete: `frontend/lib/tx-tracker.ts` (+ test)

- [ ] **Step 1: Confirm each module is now unreferenced**

Run:
```bash
cd frontend && for m in payout-ledger reconciliation payout-csv payout-memo stx-balance transferStx; do
  echo "== $m =="; grep -rn "$m" components app hooks state lib | grep -v "\.test\." | grep -v "$m.ts:";
done
```
Expected: no production references (test files for the modules themselves are fine — they're deleted too). If anything still references a module, STOP and remove that consumer first.

- [ ] **Step 2: Delete the modules + tests**

```bash
git rm frontend/state/payout-ledger.ts frontend/state/payout-ledger.test.ts \
       frontend/lib/reconciliation.ts frontend/lib/reconciliation.test.ts \
       frontend/lib/payout-csv.ts frontend/lib/payout-csv.test.ts \
       frontend/lib/payout-memo.ts frontend/lib/payout-memo.test.ts \
       frontend/lib/stx-balance.ts frontend/lib/stx-balance.test.ts
```

- [ ] **Step 3: Remove transferStx**

In `frontend/lib/contract-calls.ts`, delete `transferStx` and any now-unused imports (`request`, `makeUnsignedSTXTokenTransfer`, `deserializeTransaction`, `broadcastTransaction`).

- [ ] **Step 4: Conditionally remove tx-tracker**

Run: `cd frontend && grep -rn "tx-tracker" components app hooks state lib | grep -v "tx-tracker.ts"`
If no output, `git rm frontend/lib/tx-tracker.ts frontend/lib/tx-tracker.test.ts`. If `SharedMintDialog` or others still import `TxStatus`, KEEP tx-tracker.

- [ ] **Step 5: Verify everything**

Run: `cd frontend && npx tsc --noEmit && npm test 2>&1 | grep -E "Tests|Test Files" && npm run build 2>&1 | tail -5`
Expected: no type errors, all remaining tests pass, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A frontend/lib frontend/state
git commit -m "chore(frontend): delete obsolete owner-payout modules"
```

---

## Task 10: document the env precondition

**Files:**
- Modify: `frontend/.env.example`

- [ ] **Step 1: Update the example env**

In `frontend/.env.example`, set the contract var to the shared v3 contract and add a comment that all games now share it:
```
# Single shared registry contract for all games (Snake/Tetris/Pac-Man/XP Bricks)
NEXT_PUBLIC_CONTRACT_ADDRESS=SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v3
NEXT_PUBLIC_NETWORK=mainnet
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_SEASON_END_ISO=
```

- [ ] **Step 2: Commit**

```bash
git add frontend/.env.example
git commit -m "docs(frontend): point example env at shared xp-arcade-v3 contract"
```

---

## Self-Review checklist (run before handoff)

- **Spec coverage:** §4.1 config → T1/T2; §4.2 call layer + claimPrizeV3 + legacy deletion → T3/T4/T5; §4.3 claim UI → T7; §4.4 Season Admin → T8; §4.5 metadata route → T6; §4.6 retire list → T9; §8 env precondition → T10. ✓
- **Out of scope (correctly excluded):** deploy/register-game (precondition), Trophy NFTs, contract changes, marketing.
- **Type consistency:** `onchainId: number`, `onchainIdFor`/`gameIdFromOnchain`, `claimPrizeV3(gameId, season, senderAddress)`, `scoreMetadataResponseV3(req, params)` are used consistently across tasks. `getLastTokenId` (global) and `computePayoutUstx` are explicitly KEPT.
- **Green-commit ordering:** legacy `mintScore` consumer (MintDialog) is deleted in T4 BEFORE the legacy functions are removed in T5; `transferStx` is removed in T9 only AFTER Season Admin stops using it in T8.
- **Open items to verify during execution:**
  1. claim-prize post-condition (`willSendLte(payout)`) — confirm against a real wallet in T7 (deny-mode may block the inbound STX).
  2. `metadata-route.test.ts` mock style — reuse the file's existing `fetchCallReadOnlyFunction` mock; set `game-id` in the returned tuple (T6).
  3. tx-tracker deletion is conditional on no remaining `TxStatus` consumers (T9 Step 4).

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-05-28-frontend-v3-cutover.md`. Deploy + `register-game` + Vercel env are manual preconditions; live wallet testing requires them done.
