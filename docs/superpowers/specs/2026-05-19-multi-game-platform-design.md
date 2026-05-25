# Multi-Game Platform Design

**Date:** 2026-05-19
**Status:** Approved

## Overview

Mở rộng XP Snake từ một single-game thành multi-game platform với Windows 95 theme. Giai đoạn đầu gồm 3 game: Snake (đã deployed), Tetris, và Pac-Man. Mỗi game có contract Stacks riêng, NFT score minting, và on-chain leaderboard. Frontend dùng shared infrastructure thay vì duplicate code theo từng game.

---

## Section 1: Architecture Overview

```
lib/game-registry.ts          ← danh sách game + contract address
       │
       ├── components/game/snake/     (hiện tại, refactor nhẹ)
       ├── components/game/tetris/    (mới)
       └── components/game/pacman/   (mới)
              │
       shared layer:
       ├── hooks/useGameSession.ts
       ├── components/shared/GameShellWindow.tsx
       ├── components/shared/SharedLeaderboard.tsx
       ├── components/shared/SharedMintDialog.tsx
       └── components/shared/SharedMyNfts.tsx
              │
       contract layer:
       ├── lib/contract-calls.ts      (generalize theo gameId)
       ├── contract/snake-score/      (deployed, không đổi)
       ├── contract/tetris-score/     (mới — clone snake-score)
       └── contract/pacman-score/     (mới — clone snake-score)
              │
       state:
       ├── state/wallet.ts            (không đổi)
       ├── state/window-manager.ts    (thêm window types mới)
       ├── state/toasts.ts            (không đổi)
       └── state/mint-tx.ts          (mở rộng theo gameId)
```

**Nguyên tắc cốt lõi:** Game engine chỉ emit `onGameOver(score)` và `onScoreChange(score)` — không biết gì về blockchain hay mint. Shared layer xử lý phần còn lại.

---

## Section 2: Game Registry + Contract Structure

### `lib/game-registry.ts`

```ts
export type GameId = 'snake' | 'tetris' | 'pacman'

export interface GameDef {
  id: GameId
  label: string
  icon: string              // path tới icon .png trong /public
  contractAddress: string
}

export const GAMES: Record<GameId, GameDef> = {
  snake: {
    id: 'snake',
    label: 'Snake',
    icon: '/icons/snake.png',
    contractAddress: 'SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.snake-score',
  },
  tetris: {
    id: 'tetris',
    label: 'Tetris',
    icon: '/icons/tetris.png',
    contractAddress: 'SP....tetris-score',  // placeholder — điền sau khi deploy mainnet
  },
  pacman: {
    id: 'pacman',
    label: 'Pac-Man',
    icon: '/icons/pacman.png',
    contractAddress: 'SP....pacman-score',  // placeholder — điền sau khi deploy mainnet
  },
}
```

### Contract structure

`tetris-score` và `pacman-score` clone `snake-score` với hai thay đổi:
- Tên contract
- `base-uri` trỏ tới `/api/metadata/tetris/[id]` và `/api/metadata/pacman/[id]`

Functions giữ nguyên: `mint-score`, `get-top-scores`, `submit-score`, `end-season`, prize pool tracking.

**Mint fee:**
- `snake-score`: 0.01 STX (deployed mainnet, không thể thay đổi)
- `tetris-score`: 0.02 STX
- `pacman-score`: 0.02 STX

### `lib/contract-calls.ts` — generalize

Các hàm hiện tại nhận thêm `gameId` param, resolve `contractAddress` từ `GAMES[gameId]`:

```ts
mintScore(gameId: GameId, sender: string, score: number): Promise<string>
getTopScores(gameId: GameId): Promise<ScoreEntry[]>
```

---

## Section 3: Shared Frontend Layer

### `hooks/useGameSession(gameId: GameId)`

```ts
const { score, setScore, handleGameOver, isMintPending } = useGameSession('tetris')
```

- Giữ `score` trong local state
- `handleGameOver(finalScore)` lưu score + mở SharedMintDialog
- `isMintPending` đọc từ `state/mint-tx.ts` theo `gameId`

### `state/mint-tx.ts` — mở rộng

Refactor từ singleton thành map keyed by `gameId`:

```ts
// state shape: Record<GameId, MintTxState>
// actions: startMint(gameId, txid), clearMint(gameId)
```

Snake tiếp tục hoạt động bình thường, chỉ đổi `startMint('snake', txid)`.

### `components/shared/GameShellWindow.tsx`

Wrapper quanh `Window.tsx` cung cấp layout chuẩn cho mọi game:
- Score display góc trên phải
- Nút "Leaderboard" + "My NFTs" trong toolbar
- Nhận `gameId` + `children` (game engine render vào đây)

### `components/shared/SharedMintDialog.tsx`

Clone `MintDialog` hiện tại, nhận `gameId` → gọi `mintScore(gameId, ...)`.

### `components/shared/SharedLeaderboard.tsx`

Clone `LeaderboardWindow`, nhận `gameId` → gọi `getTopScores(gameId)`. Title hiển thị `"${game.label} — Leaderboard"`.

### `components/shared/SharedMyNfts.tsx`

Clone `MyNftsWindow`, nhận `gameId`, fetch NFTs từ đúng contract.

**Migration plan:** Các component cũ (`LeaderboardWindow.tsx`, `MintDialog`, `MyNftsWindow`) giữ nguyên cho đến khi shared version hoạt động ổn định, sau đó xóa.

---

## Section 4: Game Engines

### Interface chung

```ts
interface GameEngineProps {
  onGameOver: (score: number) => void
  onScoreChange: (score: number) => void
}
```

### Tetris (`components/game/tetris/`)

```
tetris/
  TetrisEngine.ts     ← pure logic: board, pieces, collision, line clear
  TetrisCanvas.tsx    ← render board bằng CSS grid
  TetrisWindow.tsx    ← wrap GameShellWindow + TetrisCanvas
```

- Board 10×20, 7 tetrominoes chuẩn (I, O, T, S, Z, J, L)
- Scoring: 1 line = 100pts, 2 = 300, 3 = 500, 4 (Tetris) = 800
- Tốc độ tăng theo level (mỗi 10 lines cleared)
- Render bằng CSS grid (pixel aesthetic Win95)
- Game over khi piece spawn bị block

### Pac-Man (`components/game/pacman/`)

```
pacman/
  PacManEngine.ts     ← maze, dots, ghost AI (simplified), collision
  PacManCanvas.tsx    ← render lên <canvas>
  PacManWindow.tsx    ← wrap GameShellWindow + PacManCanvas
```

MVP scope (không over-engineer):
- 1 maze cố định (hardcode)
- 4 ghosts với AI đơn giản (random + basic chase) — không implement Blinky/Pinky/Inky/Clyde AI đầy đủ
- Dots + power pellets, no fruit
- Scoring: dot = 10pts, power pellet = 50pts, ghost eaten = 200pts
- 3 lives, game over khi hết lives
- Render bằng `<canvas>`

### Snake (refactor nhẹ)

Engine logic (`components/game/snake/`) giữ nguyên. Chỉ thay đổi ở tầng component:
1. Tách `onGameOver` callback ra khỏi internal state để fit `GameEngineProps`
2. `GameWindow.tsx` (cũ) được thay bằng `GameShellWindow` + `useGameSession('snake')`

---

## Section 5: Desktop Integration

### Desktop Icons — sinh từ game-registry

`Desktop.tsx` loop qua `Object.values(GAMES)`:

```tsx
Object.values(GAMES).map(game => (
  <DesktopIcon
    key={game.id}
    label={game.label}
    icon={game.icon}
    onDoubleClick={() => openWindow(`game-${game.id}`)}
  />
))
```

Thêm game mới vào registry → icon tự xuất hiện, không sửa `Desktop.tsx`.

### `state/window-manager.ts` — window types mới

```ts
type WindowId =
  | `game-${GameId}`
  | `leaderboard-${GameId}`
  | `mynfts-${GameId}`
  | 'player-profile'
  | 'season-admin'
```

### Start Menu

`StartMenu.tsx` thêm section "Games" list ra 3 game. Click = `openWindow('game-${gameId}')`.

### Taskbar

Không thay đổi — đọc từ window-manager store, mỗi open window tự xuất hiện.

---

## Build Order

```
1. lib/game-registry.ts + generalize lib/contract-calls.ts
2. state/mint-tx.ts mở rộng theo gameId
3. hooks/useGameSession.ts
4. components/shared/ (GameShellWindow, SharedMintDialog, SharedLeaderboard, SharedMyNfts)
5. Refactor Snake → dùng shared layer; xóa `GameWindow.tsx`, `LeaderboardWindow.tsx`, `MintDialog`, `MyNftsWindow.tsx` cũ
6. Tetris engine + TetrisWindow
7. Pac-Man engine + PacManWindow
8. contract/tetris-score + contract/pacman-score (clone + deploy)
9. API routes /api/metadata/tetris/[id] + /api/metadata/pacman/[id]
10. Desktop/StartMenu integration
11. Smoke test toàn bộ flow: play → game over → mint → leaderboard
```

---

## Out of Scope

- Trophy NFT cho Tetris/Pac-Man
- Mobile parity
- Anti-cheat / score verification on-chain
- Fruit scoring trong Pac-Man
- Full Blinky/Pinky/Inky/Clyde ghost AI
