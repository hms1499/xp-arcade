# Multi-Game Shared Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract shared game infrastructure (registry, contract calls, mint-tx store, shared UI components) and refactor Snake to use it — leaving the codebase ready to add Tetris and Pac-Man with minimal effort.

**Architecture:** A `game-registry.ts` defines each game's id/label/contract. `contract-calls.ts` gains game-aware variants. `state/mint-tx.ts` tracks the active game. A `useGameSession` hook + four shared window components (`GameShellWindow`, `SharedMintDialog`, `SharedLeaderboard`, `SharedMyNfts`) replace the one-off Snake windows. Snake is migrated to use the shared layer; old components are deleted.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Zustand 5, `@stacks/connect` ^8, `@stacks/transactions` ^7, Vitest 3.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `frontend/lib/game-registry.ts` | GameId type + GAMES record |
| Modify | `frontend/lib/contract-calls.ts` | Add game-aware `mintScoreForGame`, `getTopTenForGame`, `getTopTenForGameRaw`, `getBestScoreForGame`, `getLastTokenIdForGame` |
| Modify | `frontend/lib/holdings.ts` | Generalize `fetchScoreHoldings` to accept contractId |
| Modify | `frontend/state/mint-tx.ts` | Add `gameId` to `start()` and state shape |
| Create | `frontend/hooks/useGameSession.ts` | Shared game session hook |
| Create | `frontend/components/shared/GameShellWindow.tsx` | Window wrapper with score toolbar |
| Create | `frontend/components/shared/SharedMintDialog.tsx` | Game-aware mint dialog |
| Create | `frontend/components/shared/SharedLeaderboard.tsx` | Game-aware leaderboard window |
| Create | `frontend/components/shared/SharedMyNfts.tsx` | Game-aware NFT gallery window |
| Create | `frontend/components/game/snake/SnakeWindow.tsx` | Snake window using shared layer |
| Modify | `frontend/state/window-manager.ts` | New `WindowType` with game-specific types |
| Modify | `frontend/app/page.tsx` | Render `SnakeWindow` instead of `GameWindow` |
| Modify | `frontend/components/desktop/Desktop.tsx` | Registry-driven desktop icons |
| Modify | `frontend/components/desktop/StartMenu.tsx` | Add Games section |
| Delete | `frontend/components/windows/GameWindow.tsx` | Replaced by SnakeWindow |

---

## Task 1: Create `lib/game-registry.ts`

**Files:**
- Create: `frontend/lib/game-registry.ts`
- Create: `frontend/lib/game-registry.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// frontend/lib/game-registry.test.ts
import { describe, it, expect } from "vitest";
import { GAMES, type GameId } from "./game-registry";

describe("game-registry", () => {
  it("has snake, tetris, pacman entries", () => {
    const ids: GameId[] = ["snake", "tetris", "pacman"];
    for (const id of ids) {
      expect(GAMES[id]).toBeDefined();
      expect(GAMES[id].id).toBe(id);
      expect(GAMES[id].contractAddress).toBeTruthy();
      expect(GAMES[id].contractName).toBeTruthy();
      expect(typeof GAMES[id].mintFeeUstx).toBe("bigint");
    }
  });

  it("snake mint fee is 10_000 ustx (0.01 STX)", () => {
    expect(GAMES.snake.mintFeeUstx).toBe(BigInt(10_000));
  });

  it("tetris and pacman mint fee is 20_000 ustx (0.02 STX)", () => {
    expect(GAMES.tetris.mintFeeUstx).toBe(BigInt(20_000));
    expect(GAMES.pacman.mintFeeUstx).toBe(BigInt(20_000));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm test -- --run lib/game-registry.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `game-registry.ts`**

```ts
// frontend/lib/game-registry.ts
const DEPLOYER = "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";

export type GameId = "snake" | "tetris" | "pacman";

export interface GameDef {
  id: GameId;
  label: string;
  emoji: string;
  contractAddress: string;
  contractName: string;
  mintFeeUstx: bigint;
}

export const GAMES: Record<GameId, GameDef> = {
  snake: {
    id: "snake",
    label: "Snake",
    emoji: "🐍",
    contractAddress: DEPLOYER,
    contractName: "snake-score",
    mintFeeUstx: BigInt(10_000),
  },
  tetris: {
    id: "tetris",
    label: "Tetris",
    emoji: "🧱",
    contractAddress: DEPLOYER,
    contractName: "tetris-score",
    mintFeeUstx: BigInt(20_000),
  },
  pacman: {
    id: "pacman",
    label: "Pac-Man",
    emoji: "👾",
    contractAddress: DEPLOYER,
    contractName: "pacman-score",
    mintFeeUstx: BigInt(20_000),
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npm test -- --run lib/game-registry.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/game-registry.ts frontend/lib/game-registry.test.ts
git commit -m "feat(registry): add game-registry with snake/tetris/pacman definitions"
```

---

## Task 2: Generalize `lib/contract-calls.ts`

**Files:**
- Modify: `frontend/lib/contract-calls.ts`

- [ ] **Step 1: Add `gameBase` helper and game-aware functions**

Open `frontend/lib/contract-calls.ts`. After the existing imports, add at the top:

```ts
import { GAMES, type GameId } from "./game-registry";
```

After the existing `MINT_FEE_USTX` and `base` constants, append these new functions (do NOT modify or delete any existing functions — they stay for backward compat while Snake is migrated in Task 9):

```ts
function gameBase(gameId: GameId) {
  const g = GAMES[gameId];
  return {
    network: stacks.network,
    contractAddress: g.contractAddress,
    contractName: g.contractName,
  };
}

export async function mintScoreForGame(
  gameId: GameId,
  score: number,
  playerName: string,
  senderAddress: string,
): Promise<string> {
  const g = GAMES[gameId];
  return new Promise((resolve, reject) => {
    openContractCall({
      ...gameBase(gameId),
      functionName: "mint-score",
      functionArgs: [uintCV(score), stringAsciiCV(playerName.slice(0, 24))],
      postConditions: [Pc.principal(senderAddress).willSendEq(g.mintFeeUstx).ustx()],
      onFinish: (data) => resolve(data.txId),
      onCancel: () => reject(new Error("cancelled")),
    });
  });
}

export async function getTopTenForGame(gameId: GameId): Promise<TopEntry[]> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-top-ten",
    functionArgs: [],
    senderAddress: GAMES[gameId].contractAddress,
  });
  const v = unwrap<Array<{ player: string; score: string }>>(cvToValue(res));
  return v.map((e) => ({ player: String(e.player), score: Number(e.score) }));
}

export async function getBestScoreForGame(gameId: GameId, addr: string) {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-best-score",
    functionArgs: [principalCV(addr)],
    senderAddress: addr,
  });
  const v = unwrap<null | { score: string; "token-id": string }>(cvToValue(res));
  return v ? { score: Number(v.score), tokenId: Number(v["token-id"]) } : null;
}

export async function getLastTokenIdForGame(gameId: GameId): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-last-token-id",
    functionArgs: [],
    senderAddress: GAMES[gameId].contractAddress,
  });
  return Number(unwrap(cvToValue(res)));
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/contract-calls.ts
git commit -m "feat(contract-calls): add game-aware mintScoreForGame / getTopTenForGame variants"
```

---

## Task 3: Generalize `lib/holdings.ts`

**Files:**
- Modify: `frontend/lib/holdings.ts`

- [ ] **Step 1: Add `contractId` param to `fetchScoreHoldings`**

Open `frontend/lib/holdings.ts`. Find the `fetchScoreHoldings` function signature and update it to accept an optional `contractId` param that defaults to Snake's contract:

```ts
import { GAMES } from "./game-registry";

// Change the signature from:
export async function fetchScoreHoldings(
  addr: string,
  metaBase = ""
): Promise<ScoreNft[]>

// To (add contractId as third optional param):
export async function fetchScoreHoldings(
  addr: string,
  metaBase = "",
  contractId = `${GAMES.snake.contractAddress}.${GAMES.snake.contractName}`
): Promise<ScoreNft[]>
```

Inside the function, find every usage of the hardcoded contract identifier (e.g. `stacks.contractAddress` + `stacks.contractName`) for the NFT holdings fetch and replace with `contractId`. The exact lines depend on the full file — apply the substitution to the Hiro API call that fetches NFT IDs for a specific contract.

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors. All existing callers of `fetchScoreHoldings` still compile because the third param defaults.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/holdings.ts
git commit -m "feat(holdings): accept optional contractId param, default to snake-score"
```

---

## Task 4: Extend `state/mint-tx.ts`

**Files:**
- Modify: `frontend/state/mint-tx.ts`
- Modify: `frontend/state/mint-tx.test.ts`

- [ ] **Step 1: Read existing test file**

```bash
cat frontend/state/mint-tx.test.ts
```

Understand what the existing tests cover before modifying.

- [ ] **Step 2: Add `gameId` field to store shape**

Open `frontend/state/mint-tx.ts`. Update `MintTxState` to include `gameId`:

```ts
import { type GameId } from "@/lib/game-registry";

type MintTxState = {
  gameId: GameId | null;
  txId: string | null;
  status: TxStatus;
  start: (gameId: GameId, txId: string, score: number) => void;
  reset: () => void;
};
```

Update the initial state:

```ts
export const useMintTx = create<MintTxState>((set) => ({
  gameId: null,
  txId: null,
  status: "pending",
  start: (gameId, txId, score) => {
    if (stopFn) {
      stopFn();
      stopFn = null;
    }
    set({ gameId, txId, status: "pending" });
    useWallet.getState().setMintPending(true);
    useToasts.getState().push({
      title: "Minting…",
      body: "Waiting for on-chain confirmation",
      type: "info",
      duration: 30_000,
    });
    stopFn = watchTx(txId, (s) => {
      set({ status: s });
      if (s === "pending") return;
      useWallet.getState().setMintPending(false);
      stopFn = null;
      if (s === "success") {
        playSuccess();
        useToasts.getState().push({
          title: "NFT confirmed!",
          body: `Score #${score} NFT is on-chain.`,
          type: "success",
          duration: 6000,
        });
      } else {
        useToasts.getState().push({
          title: "Mint failed",
          body: "Transaction was rejected on-chain.",
          type: "error",
          duration: 5000,
        });
      }
    });
  },
  reset: () => {
    if (stopFn) {
      stopFn();
      stopFn = null;
    }
    set({ gameId: null, txId: null, status: "pending" });
    useWallet.getState().setMintPending(false);
  },
}));
```

- [ ] **Step 3: Update existing call in `MintDialog.tsx` to pass gameId**

Open `frontend/components/dialogs/MintDialog.tsx`. Find `startMintTx(tx, score)` and change to `startMintTx("snake", tx, score)`. This is a temporary fix — `MintDialog` will be deleted in Task 9.

- [ ] **Step 4: Run tests**

```bash
cd frontend && npm test -- --run state/mint-tx
```

Expected: all existing tests PASS (or update any that check the `start` signature).

- [ ] **Step 5: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/state/mint-tx.ts frontend/components/dialogs/MintDialog.tsx
git commit -m "feat(mint-tx): add gameId to store start() and state shape"
```

---

## Task 5: Create `hooks/useGameSession.ts`

**Files:**
- Create: `frontend/hooks/useGameSession.ts`
- Create: `frontend/hooks/useGameSession.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// frontend/hooks/useGameSession.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGameSession } from "./useGameSession";

vi.mock("@/lib/contract-calls", () => ({
  getTopTenForGame: vi.fn().mockResolvedValue([
    { player: "SP1", score: 100 },
    { player: "SP2", score: 80 },
  ]),
}));

vi.mock("@/state/mint-tx", () => ({
  useMintTx: vi.fn(() => ({ gameId: null, txId: null, status: "pending" })),
}));

describe("useGameSession", () => {
  it("starts with zero score and no mint dialog", () => {
    const { result } = renderHook(() => useGameSession("snake"));
    expect(result.current.score).toBe(0);
    expect(result.current.showMint).toBe(false);
  });

  it("handleGameOver sets finalScore and showMint", async () => {
    const { result } = renderHook(() => useGameSession("tetris"));
    await act(async () => {
      await result.current.handleGameOver(120);
    });
    expect(result.current.finalScore).toBe(120);
    expect(result.current.showMint).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm test -- --run hooks/useGameSession
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useGameSession.ts`**

```ts
// frontend/hooks/useGameSession.ts
"use client";
import { useState, useCallback } from "react";
import { type GameId } from "@/lib/game-registry";
import { getTopTenForGame } from "@/lib/contract-calls";
import { useMintTx } from "@/state/mint-tx";

export function useGameSession(gameId: GameId) {
  const [score, setScore] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [showMint, setShowMint] = useState(false);
  const [isTopScore, setIsTopScore] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const activeMintGameId = useMintTx((s) => s.gameId);
  const activeTxId = useMintTx((s) => s.txId);
  const isMintPending =
    activeMintGameId === gameId && activeTxId !== null;

  const handleGameOver = useCallback(
    async (s: number) => {
      setFinalScore(s);
      setShowMint(true);
      try {
        const top = await getTopTenForGame(gameId);
        const min =
          top.length < 10 ? -1 : Math.min(...top.map((e) => e.score));
        setIsTopScore(s > min);
      } catch {
        setIsTopScore(false);
      }
    },
    [gameId],
  );

  const handlePlayAgain = useCallback(() => {
    setFinalScore(0);
    setScore(0);
    setShowMint(false);
    setIsTopScore(false);
    setResetKey((k) => k + 1);
  }, []);

  return {
    score,
    setScore,
    finalScore,
    showMint,
    setShowMint,
    isTopScore,
    resetKey,
    isMintPending,
    handleGameOver,
    handlePlayAgain,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npm test -- --run hooks/useGameSession
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/hooks/useGameSession.ts frontend/hooks/useGameSession.test.ts
git commit -m "feat(useGameSession): shared hook for score state, game-over, mint trigger"
```

---

## Task 6: Create `components/shared/GameShellWindow.tsx`

**Files:**
- Create: `frontend/components/shared/GameShellWindow.tsx`

- [ ] **Step 1: Implement `GameShellWindow`**

```tsx
// frontend/components/shared/GameShellWindow.tsx
"use client";
import { type GameId, GAMES } from "@/lib/game-registry";
import { useWindows } from "@/state/window-manager";
import { Window } from "@/components/windows/Window";

export function GameShellWindow({
  gameId,
  score,
  children,
}: {
  gameId: GameId;
  score: number;
  children: React.ReactNode;
}) {
  const game = GAMES[gameId];
  const w = useWindows((s) =>
    s.windows.find((win) => win.type === `game-${gameId}`)
  );
  const openWindow = useWindows((s) => s.open);

  if (!w) return null;

  return (
    <Window id={w.id} title={`${game.emoji} ${game.label}`}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "2px 6px",
            borderBottom: "1px solid #ccc",
            fontSize: 11,
            fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
          }}
        >
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                openWindow(`leaderboard-${gameId}`);
              }}
            >
              🏆 High Scores
            </button>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                openWindow(`mynfts-${gameId}`);
              }}
            >
              💾 My NFTs
            </button>
          </div>
          <span>
            Score: <b>{score}</b>
          </span>
        </div>
        <div className="p-2">{children}</div>
      </div>
    </Window>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: errors about unknown `WindowType` values (`game-snake` etc.) — these will be fixed in Task 10. If the only errors are from window-manager types, proceed.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/shared/GameShellWindow.tsx
git commit -m "feat(shared): GameShellWindow wrapper with score toolbar and nav buttons"
```

---

## Task 7: Create `components/shared/SharedMintDialog.tsx`

**Files:**
- Create: `frontend/components/shared/SharedMintDialog.tsx`

- [ ] **Step 1: Implement `SharedMintDialog`**

This is a parameterized clone of `frontend/components/dialogs/MintDialog.tsx` that uses `gameId` to call the right contract and display the correct fee.

```tsx
// frontend/components/shared/SharedMintDialog.tsx
"use client";
import { useState } from "react";
import { useWallet } from "@/state/wallet";
import { mintScoreForGame } from "@/lib/contract-calls";
import { useMintTx } from "@/state/mint-tx";
import { type TxStatus } from "@/lib/tx-tracker";
import { recordScore } from "@/lib/high-score";
import { GAMES, type GameId } from "@/lib/game-registry";

const STATUS_LABEL: Record<TxStatus, string> = {
  pending: "⏳ Confirming…",
  success: "✓ Confirmed!",
  abort_by_response: "✗ Failed (contract error)",
  abort_by_post_condition: "✗ Failed (post-condition)",
  failed: "✗ Failed",
};

const STATUS_COLOR: Record<TxStatus, string> = {
  pending: "#888",
  success: "#007700",
  abort_by_response: "#cc0000",
  abort_by_post_condition: "#cc0000",
  failed: "#cc0000",
};

export function SharedMintDialog({
  gameId,
  score,
  onClose,
  onPlayAgain,
}: {
  gameId: GameId;
  score: number;
  onClose: () => void;
  onPlayAgain: () => void;
}) {
  const game = GAMES[gameId];
  const address = useWallet((s) => s.address);
  const connect = useWallet((s) => s.connect);
  const mintStatus = useMintTx((s) => s.status);
  const startMintTx = useMintTx((s) => s.start);
  const [busy, setBusy] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);
  const defaultName = address ? address.slice(-8) : "anon";
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hs] = useState(() => recordScore(score));

  const feeStx = (Number(game.mintFeeUstx) / 1_000_000).toFixed(2);

  async function handleMint() {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const tx = await mintScoreForGame(
        gameId,
        score,
        name || defaultName,
        address,
      );
      setTxId(tx);
      startMintTx(gameId, tx, score);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Mint failed";
      if (
        msg.includes("104") ||
        msg.toLowerCase().includes("score-too-high")
      ) {
        setError(
          "Score rejected by contract (too high). Please play a normal game.",
        );
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  const stxExplorerBase = "https://explorer.hiro.so/txid";

  return (
    <div className="text-sm mint-dialog-enter">
      <p className="mb-3">
        ⚠️ <b>Game Over</b> — Score: <b>{score}</b>
        <span className="block text-xs mt-1">
          {hs.isNewRecord ? (
            <b style={{ color: "#007700" }}>🏅 New personal best!</b>
          ) : (
            <span className="text-gray-500">
              Personal best: <b>{hs.best}</b>
            </span>
          )}
        </span>
        <span className="block text-xs text-gray-500 mt-1">
          Minting costs <b>{feeStx} STX</b> and records your score on-chain forever.
        </span>
      </p>

      {!address ? (
        <div>
          <p className="text-xs mb-2 text-gray-500">
            Connect a wallet to mint your score as an NFT.
          </p>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={connect}>Connect Wallet</button>
            <button onClick={onPlayAgain}>Play Again</button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      ) : !txId ? (
        <div>
          <div className="mb-2">
            <label className="block text-xs mb-1">Player name (optional)</label>
            <input
              type="text"
              maxLength={24}
              value={name}
              placeholder={defaultName}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs"
            />
          </div>
          {error && (
            <p className="text-xs text-red-600 mb-2">⚠️ {error}</p>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={handleMint} disabled={busy}>
              {busy ? "Opening wallet…" : `Mint for ${feeStx} STX`}
            </button>
            <button onClick={onPlayAgain}>Play Again</button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      ) : (
        <div>
          <p
            className="text-xs mb-2"
            style={{ color: STATUS_COLOR[mintStatus] }}
          >
            {STATUS_LABEL[mintStatus]}
          </p>
          {txId && (
            <p className="text-xs mb-2">
              <a
                href={`${stxExplorerBase}/${txId}?chain=mainnet`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                View on Explorer ↗
              </a>
            </p>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onPlayAgain}>Play Again</button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors (or only window-manager type errors from Task 10 — acceptable at this stage).

- [ ] **Step 3: Commit**

```bash
git add frontend/components/shared/SharedMintDialog.tsx
git commit -m "feat(shared): SharedMintDialog parameterized by gameId with correct fee display"
```

---

## Task 8: Create `components/shared/SharedLeaderboard.tsx` and `SharedMyNfts.tsx`

**Files:**
- Create: `frontend/components/shared/SharedLeaderboard.tsx`
- Create: `frontend/components/shared/SharedMyNfts.tsx`

- [ ] **Step 1: Implement `SharedLeaderboard.tsx`**

This is a simplified version of `LeaderboardWindow.tsx` (prize-claim UI removed per CLAUDE.md) parameterized by `gameId`.

```tsx
// frontend/components/shared/SharedLeaderboard.tsx
"use client";
import { useEffect, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { Window } from "@/components/windows/Window";
import { getTopTenForGame, type TopEntry } from "@/lib/contract-calls";
import { GAMES, type GameId } from "@/lib/game-registry";
import { useSeasonCountdown, formatCountdown } from "@/lib/season-countdown";
import { shortAddress } from "@/lib/stacks-address";

type RankSnapshot = Record<string, number>;

function loadSnapshot(gameId: GameId): RankSnapshot {
  try {
    return JSON.parse(sessionStorage.getItem(`lb-snapshot-${gameId}`) ?? "{}");
  } catch {
    return {};
  }
}

function saveSnapshot(gameId: GameId, rows: TopEntry[]) {
  const snap: RankSnapshot = {};
  rows.forEach((r) => { snap[r.player] = r.score; });
  sessionStorage.setItem(`lb-snapshot-${gameId}`, JSON.stringify(snap));
}

function rankChange(
  player: string,
  currentRank: number,
  snapshot: RankSnapshot,
): "up" | "down" | "same" | "new" {
  if (!(player in snapshot)) return "new";
  const prevEntries = Object.entries(snapshot).sort((a, b) => b[1] - a[1]);
  const prevRank = prevEntries.findIndex(([addr]) => addr === player) + 1;
  if (prevRank === 0) return "new";
  if (currentRank < prevRank) return "up";
  if (currentRank > prevRank) return "down";
  return "same";
}

export function SharedLeaderboard({ gameId }: { gameId: GameId }) {
  const game = GAMES[gameId];
  const w = useWindows((s) =>
    s.windows.find((win) => win.type === `leaderboard-${gameId}`)
  );
  const address = useWallet((s) => s.address);
  const [rows, setRows] = useState<TopEntry[] | null>(null);
  const [snapshot, setSnapshot] = useState<RankSnapshot>(() =>
    loadSnapshot(gameId)
  );
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const countdown = useSeasonCountdown();

  useEffect(() => {
    if (!w) return;

    function load() {
      getTopTenForGame(gameId)
        .then((data) => {
          const sorted = [...data].sort((a, b) => b.score - a.score);
          setRows(sorted);
          setError(null);
          setLastUpdated(new Date());
          setSnapshot(loadSnapshot(gameId));
          saveSnapshot(gameId, sorted);
        })
        .catch((e) =>
          setError(e instanceof Error ? e.message : "Load failed")
        );
    }

    setRows(null);
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [w, gameId]);

  if (!w) return null;

  const myRank =
    address && rows
      ? rows.findIndex((r) => r.player === address) + 1
      : 0;

  const BADGE_BG: Record<number, string> = {
    1: "#ffd700",
    2: "#c0c0c0",
    3: "#cd7f32",
  };

  return (
    <Window id={w.id} title={`${game.emoji} ${game.label} — High Scores`} width={420}>
      <div className="p-2">
        {error && (
          <p className="text-red-600 text-xs mb-2">⚠️ {error}</p>
        )}
        {countdown.state !== "unset" && (
          <div className="flex justify-end mb-1">
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 11,
                color: countdown.state === "expired" ? "#cc0000" : "#000080",
              }}
              title={`Ends ${countdown.endsAt.toLocaleString()}`}
            >
              ⏳ {formatCountdown(countdown)}
            </span>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {rows === null && !error &&
            [0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  height: 26,
                  background: "#e0e0e0",
                  borderRadius: 3,
                  animation: "shimmer 1.2s linear infinite",
                }}
              />
            ))}
          {rows?.length === 0 && (
            <div
              style={{
                textAlign: "center",
                color: "#888",
                fontSize: 11,
                padding: "12px 0",
              }}
            >
              No scores yet. Be the first!
            </div>
          )}
          {rows?.map((r, i) => {
            const rank = i + 1;
            const isMe = r.player === address;
            const change = rankChange(r.player, rank, snapshot);
            const badgeBg = BADGE_BG[rank] ?? "#bbbbbb";
            const badgeColor =
              rank <= 3
                ? rank === 1
                  ? "#7a5c00"
                  : rank === 2
                  ? "#444"
                  : "#fff"
                : "#555";

            return (
              <div
                key={r.player}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 6px",
                  borderRadius: 3,
                  borderLeft: isMe
                    ? "3px solid #f59e0b"
                    : "3px solid transparent",
                  background: isMe
                    ? "#fff8e1"
                    : rank === 1
                    ? "#fffde7"
                    : "transparent",
                  fontSize: 11,
                  fontFamily:
                    '"Pixelated MS Sans Serif", Arial, sans-serif',
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: badgeBg,
                    color: badgeColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    fontWeight: "bold",
                    flexShrink: 0,
                  }}
                >
                  {rank}
                </div>
                <div style={{ flex: 1 }}>
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      useWindows
                        .getState()
                        .open("player-profile", { address: r.player });
                    }}
                    style={{
                      background: isMe ? "#fff3e0" : "#e3f2fd",
                      color: isMe ? "#e65100" : "#1565c0",
                      border: "none",
                      borderRadius: 10,
                      padding: "1px 7px",
                      fontSize: 10,
                      fontFamily: "monospace",
                      cursor: "pointer",
                    }}
                  >
                    {isMe
                      ? "YOU"
                      : `${r.player.slice(0, 5)}…${r.player.slice(-4)}`}
                  </button>
                </div>
                <span
                  style={{
                    fontWeight: "bold",
                    minWidth: 36,
                    textAlign: "right",
                  }}
                >
                  {r.score}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    width: 16,
                    textAlign: "center",
                    color:
                      change === "up"
                        ? "#2e7d32"
                        : change === "down"
                        ? "#c62828"
                        : "#aaa",
                  }}
                >
                  {change === "up" ? "▲" : change === "down" ? "▼" : "–"}
                </span>
              </div>
            );
          })}
        </div>
        {lastUpdated && (
          <p className="text-[9px] text-gray-400 mt-1 text-right">
            Updated{" "}
            {lastUpdated.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}{" "}
            · auto-refresh 30s
            {myRank > 0 && <> · Your rank: #{myRank}</>}
          </p>
        )}
      </div>
    </Window>
  );
}
```

- [ ] **Step 2: Implement `SharedMyNfts.tsx`**

```tsx
// frontend/components/shared/SharedMyNfts.tsx
"use client";
import { useEffect, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { Window } from "@/components/windows/Window";
import { fetchScoreHoldings, type ScoreNft } from "@/lib/holdings";
import { rarityColor } from "@/lib/metadata-svg";
import { GAMES, type GameId } from "@/lib/game-registry";

export function SharedMyNfts({ gameId }: { gameId: GameId }) {
  const game = GAMES[gameId];
  const contractId = `${game.contractAddress}.${game.contractName}`;
  const w = useWindows((s) =>
    s.windows.find((win) => win.type === `mynfts-${gameId}`)
  );
  const address = useWallet((s) => s.address);
  const [nfts, setNfts] = useState<ScoreNft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!w || !address) return;
    setNfts(null);
    setError(null);
    fetchScoreHoldings(address, "", contractId)
      .then(setNfts)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [w, address, contractId]);

  if (!w) return null;

  return (
    <Window id={w.id} title={`${game.emoji} My ${game.label} NFTs`} width={480}>
      <div className="p-2">
        {address && (
          <div className="mb-2 text-right">
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                useWindows.getState().open("player-profile", { address });
              }}
              className="text-xs"
            >
              Open my profile
            </button>
          </div>
        )}
        {!address && (
          <p className="text-sm">Connect your wallet to see your NFTs.</p>
        )}
        {address && nfts === null && !error && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
              gap: 8,
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: 72,
                  background: "#e0e0e0",
                  borderRadius: 3,
                  animation: "shimmer 1.2s linear infinite",
                }}
              />
            ))}
          </div>
        )}
        {error && (
          <p className="text-xs text-red-600">⚠️ {error}</p>
        )}
        {nfts?.length === 0 && (
          <p className="text-sm text-gray-500">
            No {game.label} NFTs yet. Play and mint a score!
          </p>
        )}
        {nfts && nfts.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
              gap: 8,
            }}
          >
            {nfts.map((nft) => (
              <div
                key={nft.id}
                style={{
                  border: "1px solid #ccc",
                  borderRadius: 3,
                  overflow: "hidden",
                  fontSize: 10,
                  textAlign: "center",
                }}
              >
                <img
                  src={nft.image}
                  alt={nft.name}
                  style={{ width: "100%", display: "block" }}
                />
                <div
                  style={{
                    padding: "2px 4px",
                    color: nft.rarity ? rarityColor(nft.rarity) : undefined,
                  }}
                >
                  {nft.score ?? nft.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Window>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors (window-manager type errors acceptable until Task 10).

- [ ] **Step 4: Commit**

```bash
git add frontend/components/shared/SharedLeaderboard.tsx frontend/components/shared/SharedMyNfts.tsx
git commit -m "feat(shared): SharedLeaderboard and SharedMyNfts parameterized by gameId"
```

---

## Task 9: Migrate Snake to shared layer

**Files:**
- Create: `frontend/components/game/snake/SnakeWindow.tsx`
- Delete: `frontend/components/windows/GameWindow.tsx`

- [ ] **Step 1: Create `SnakeWindow.tsx`**

```tsx
// frontend/components/game/snake/SnakeWindow.tsx
"use client";
import { useWindows } from "@/state/window-manager";
import { GameShellWindow } from "@/components/shared/GameShellWindow";
import { SharedMintDialog } from "@/components/shared/SharedMintDialog";
import { GameCanvas } from "@/components/game/GameCanvas";
import { useGameSession } from "@/hooks/useGameSession";
import { isWindowActive } from "@/state/window-manager";

export function SnakeWindow() {
  const w = useWindows((s) =>
    s.windows.find((win) => win.type === "game-snake")
  );
  const maxZ = useWindows((s) =>
    Math.max(
      ...s.windows.filter((win) => !win.minimized).map((win) => win.z),
      0,
    )
  );
  const close = useWindows((s) => s.close);
  const {
    score,
    finalScore,
    showMint,
    isTopScore,
    resetKey,
    handleGameOver,
    handlePlayAgain,
  } = useGameSession("snake");

  if (!w) return null;

  return (
    <GameShellWindow gameId="snake" score={score}>
      {showMint ? (
        <SharedMintDialog
          gameId="snake"
          score={finalScore}
          onClose={() => close(w.id)}
          onPlayAgain={handlePlayAgain}
        />
      ) : (
        <GameCanvas
          key={resetKey}
          onGameOver={handleGameOver}
          isTopScore={isTopScore}
          windowActive={isWindowActive(w, maxZ)}
        />
      )}
    </GameShellWindow>
  );
}
```

- [ ] **Step 2: Delete old `GameWindow.tsx`**

```bash
rm frontend/components/windows/GameWindow.tsx
```

- [ ] **Step 3: Type-check (expect errors — fix in next task)**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: errors about `GameWindow` import in `page.tsx` and unknown `"game-snake"` window type. These are fixed in Tasks 10–11.

- [ ] **Step 4: Commit (pre-fix checkpoint)**

```bash
git add frontend/components/game/snake/SnakeWindow.tsx
git rm frontend/components/windows/GameWindow.tsx
git commit -m "feat(snake): SnakeWindow using shared layer; remove old GameWindow"
```

---

## Task 10: Update `state/window-manager.ts`

**Files:**
- Modify: `frontend/state/window-manager.ts`
- Modify: `frontend/state/window-manager.test.ts`

- [ ] **Step 1: Update `WindowType`**

Open `frontend/state/window-manager.ts`. Replace the `WindowType` definition:

```ts
// Before:
export type WindowType =
  | "game"
  | "leaderboard"
  | "my-nfts"
  | "season-admin"
  | "player-profile";

// After:
import { type GameId } from "@/lib/game-registry";

export type WindowType =
  | `game-${GameId}`
  | `leaderboard-${GameId}`
  | `mynfts-${GameId}`
  | "season-admin"
  | "player-profile";
```

- [ ] **Step 2: Run window-manager tests**

```bash
cd frontend && npm test -- --run state/window-manager
```

Expected: PASS. The test types may need updating if they reference old type strings.

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: remaining errors are only in `page.tsx` (still imports `GameWindow`/`LeaderboardWindow`/`MyNftsWindow`) and `Desktop.tsx`/`StartMenu.tsx`. Fixed in Task 11.

- [ ] **Step 4: Commit**

```bash
git add frontend/state/window-manager.ts
git commit -m "refactor(window-manager): template-literal WindowType for multi-game support"
```

---

## Task 11: Update `app/page.tsx`, `Desktop.tsx`, `StartMenu.tsx`

**Files:**
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/components/desktop/Desktop.tsx`
- Modify: `frontend/components/desktop/StartMenu.tsx`

- [ ] **Step 1: Update `app/page.tsx`**

```tsx
// frontend/app/page.tsx
import { BootScreen } from "@/components/desktop/BootScreen";
import { Desktop } from "@/components/desktop/Desktop";
import { SnakeWindow } from "@/components/game/snake/SnakeWindow";
import { SharedLeaderboard } from "@/components/shared/SharedLeaderboard";
import { SharedMyNfts } from "@/components/shared/SharedMyNfts";
import { SeasonAdminWindow } from "@/components/windows/SeasonAdminWindow";
import { PlayerProfileWindow } from "@/components/windows/PlayerProfileWindow";
import { Balloons } from "@/components/dialogs/BalloonNotification";

export default function Home() {
  return (
    <BootScreen>
      <Desktop>
        <SnakeWindow />
        <SharedLeaderboard gameId="snake" />
        <SharedMyNfts gameId="snake" />
        <SeasonAdminWindow />
        <PlayerProfileWindow />
        <Balloons />
      </Desktop>
    </BootScreen>
  );
}
```

- [ ] **Step 2: Update `Desktop.tsx`**

```tsx
// frontend/components/desktop/Desktop.tsx
"use client";
import { DesktopIcon } from "./DesktopIcon";
import { Taskbar } from "./Taskbar";
import { NightCityWallpaper } from "./NightCityWallpaper";
import { useWindows } from "@/state/window-manager";
import { GAMES } from "@/lib/game-registry";
import { unlockAudio } from "@/lib/sounds";

export function Desktop({ children }: { children: React.ReactNode }) {
  const open = useWindows((s) => s.open);

  return (
    <div
      className="fixed inset-0"
      onMouseDown={unlockAudio}
      onTouchStart={unlockAudio}
      style={{ background: "#00030c" }}
    >
      <NightCityWallpaper />
      <div
        className="absolute top-4 left-4 grid grid-cols-1 gap-4"
        style={{ zIndex: 1 }}
      >
        {Object.values(GAMES).map((game) => (
          <DesktopIcon
            key={game.id}
            label={`${game.label}.exe`}
            emoji={game.emoji}
            onOpen={() => open(`game-${game.id}`)}
          />
        ))}
        <DesktopIcon
          label="High Scores"
          emoji="🏆"
          onOpen={() => open("leaderboard-snake")}
        />
        <DesktopIcon
          label="My NFTs"
          emoji="💾"
          onOpen={() => open("mynfts-snake")}
        />
      </div>
      {children}
      <Taskbar />
    </div>
  );
}
```

- [ ] **Step 3: Update `StartMenu.tsx` — add Games section**

Open `frontend/components/desktop/StartMenu.tsx`. Find the return statement and add a "Games" section before the existing menu items. Add the following inside the `<ul>` or equivalent list container (exact position depends on the full file structure — place it near the top of the menu items):

```tsx
// Add this import at the top of StartMenu.tsx:
import { GAMES } from "@/lib/game-registry";
import { useWindows } from "@/state/window-manager";

// Inside the component, add:
const openWin = useWindows((s) => s.open);  // may already exist

// Add a Games section in the JSX (inside the menu list):
<li role="none" style={{ borderTop: "1px solid #ccc", margin: "2px 0" }} />
{Object.values(GAMES).map((game) => (
  <MenuItem
    key={game.id}
    icon={game.emoji}
    label={game.label}
    onClick={() => {
      openWin(`game-${game.id}`);
      onClose();
    }}
  />
))}
<li role="none" style={{ borderTop: "1px solid #ccc", margin: "2px 0" }} />
```

- [ ] **Step 4: Delete old window components that are now replaced**

```bash
rm frontend/components/windows/LeaderboardWindow.tsx
rm frontend/components/windows/MyNftsWindow.tsx
```

- [ ] **Step 5: Full build check**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: successful build, 0 type errors.

- [ ] **Step 6: Run all tests**

```bash
cd frontend && npm test -- --run
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/page.tsx \
        frontend/components/desktop/Desktop.tsx \
        frontend/components/desktop/StartMenu.tsx
git rm frontend/components/windows/LeaderboardWindow.tsx \
       frontend/components/windows/MyNftsWindow.tsx
git commit -m "feat(desktop): registry-driven icons + Games menu; wire shared windows into page"
```

---

## Task 12: Smoke Test

- [ ] **Step 1: Start dev server**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Verify Snake flow end-to-end**
  - Desktop shows Snake.exe, Tetris.exe, Pac-Man.exe icons
  - Double-click Snake.exe → SnakeWindow opens with score toolbar
  - Play Snake → game over → SharedMintDialog appears with "0.01 STX" fee
  - Click "High Scores" button in toolbar → SharedLeaderboard opens for snake
  - Click "My NFTs" button → SharedMyNfts opens for snake
  - Start Menu → Games section shows Snake, Tetris, Pac-Man

- [ ] **Step 3: Verify Tetris/Pac-Man icons show (no window yet)**
  - Double-click Tetris.exe / Pac-Man.exe → window-manager opens a `game-tetris`/`game-pacman` window entry, but no component renders (expected — Plan 2/3 add the components)

- [ ] **Step 4: Commit if all good**

```bash
git add -p  # stage any minor smoke-test fixes
git commit -m "chore: smoke-test fixes for multi-game infra"
```

---

## After This Plan

Proceed to:
- `docs/superpowers/plans/2026-05-19-multi-game-tetris.md` — Tetris engine + window + contract
- `docs/superpowers/plans/2026-05-19-multi-game-pacman.md` — Pac-Man engine + window + contract
