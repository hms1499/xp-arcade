# UI/UX Polish — Design Spec

**Date:** 2026-05-16  
**Project:** XP Snake (mainnet deployed)  
**Scope:** Six visual/interaction improvements across the existing frontend. No contract changes. No new windows or features — polish only.

---

## 1. Context

The game is live on mainnet. The core loop (play → game over → mint NFT → leaderboard) works correctly. This spec addresses six areas where the UI feels rough or misses opportunities to reinforce the Windows XP desktop theme and improve player engagement.

Constraints to preserve:
- Desktop-first. Mobile gets a responsive fallback, not parity.
- No new Zustand stores. Existing: `wallet.ts`, `window-manager.ts`, `toasts.ts`.
- Canvas rendering stays in `GameCanvas.tsx` (no external game-engine deps).
- All animation must respect `prefers-reduced-motion`.

---

## 2. Area 1 — Game Feel & Visual Feedback

**File:** `frontend/components/game/GameCanvas.tsx`

### 2.1 Snake rendering

Replace flat same-color squares with a gradient body:

- **Head segment:** `#7fff7f` with a `0 0 4px #7fff7f` box shadow (CSS via canvas `shadowBlur`).
- **Body segments:** linearly interpolate fill from `#4aee4a` (neck) to `#0f660f` (tail). Formula: `lerp(i / snake.length)` where i=0 is neck.
- **Segment size:** keep `CELL - 1` wide/tall. Add `2px` border-radius (draw with `roundRect` or manual arc corners).

### 2.2 Food

- Draw food as a filled circle (`arc`) rather than a square, radius `(CELL-1)/2 - 1`.
- Apply canvas `shadowBlur = 8`, `shadowColor = "#ff8800"` for glow.
- Pulse: alternate `shadowBlur` between 6 and 12 on a 600ms timer (track with a `foodPulseRef`).

### 2.3 Background

- Replace solid `#000` fill with `#050f05`.
- Draw a dot-grid overlay: 1px dots at every `CELL` interval in `#0a2a0a`. Draw once into an offscreen canvas; blit each frame.

### 2.4 Score popup

When score increases, spawn a `+1` text that floats upward over 500ms then disappears:
- Track popups in a `useRef<{x, y, born}[]>` (not state — no re-render).
- Render in the canvas loop: `fillText("+1", ...)` with alpha `= 1 - elapsed/500`, y offset `= -elapsed * 0.04`.

### 2.5 Speed indicator

Replace the text-based `⚡ MAX SPEED` label with a small horizontal bar (5px tall) beneath the score line. Bar width = `lerp(0, 100%, (BASE_TICK_MS - tickMs) / (BASE_TICK_MS - MIN_TICK_MS))`. Color: green → yellow → red as speed increases.

### 2.6 Reduced-motion fallback

When `prefers-reduced-motion: reduce` is active:
- Skip food pulse (static glow only).
- Skip score popup animation.
- Skip gradient body (use flat `#0f0`).

---

## 3. Area 2 — Game Over Flow

**Files:** `GameCanvas.tsx`, `GameWindow.tsx`, `MintDialog.tsx`

### 3.1 Death sequence

Current: `onGameOver(score)` is called immediately → `GameWindow` swaps to `MintDialog`.  
New sequence:

1. Snake dies → canvas draws a red full-screen flash (`rgba(255,0,0,0.35)`) for 200ms.
2. After flash: draw the game-over overlay on the canvas (see §3.2). `onGameOver` is **not** called yet.
3. After 600ms (or on any keypress / tap): call `onGameOver(score)` to trigger `MintDialog`.

`GameCanvas` manages this internally via a `gameOverPhase` ref (`null | "flash" | "overlay"`). It calls the parent-provided `onGameOver` prop only when the sequence completes.

### 3.2 Game-over canvas overlay

Rendered directly on the game canvas while in `"overlay"` phase:

```
rgba(0,0,0,0.72) full-canvas fill

"GAME OVER"          — white, monospace, 16px, bold, letter-spacing 3px
"SCORE: {n}"         — #7fff7f, monospace, 13px
"✦ NEW HIGH SCORE ✦" — #ffd700, 11px  (only if score qualifies for top-10)
"Press any key..."   — #555, 10px, monospace
```

"New high score" check: `GameCanvas` receives a new optional prop `isTopScore: boolean` from `GameWindow`. `GameWindow` calls `getTopTen()` (already imported in the project) once when `finalScore` is set. If the top-10 has fewer than 10 entries, or if `finalScore` exceeds the minimum score in the returned list, `isTopScore = true`. This is a one-time async call on game over; no store change required.

### 3.3 MintDialog entry

`MintDialog` gains a CSS `@keyframes` slide-up: `translateY(20px) → translateY(0)` + `opacity 0→1` over 180ms. Applied via a `data-entering` attribute removed after the animation completes.

---

## 4. Area 3 — Boot Screen Polish

**File:** `frontend/components/desktop/BootScreen.tsx`

### 4.1 Layout

Replace current markup with a centered column on `#000080` background:

```
[xpsnake logo text — yellow "xp" + white thin "snake"]
[status text — rotating messages, see §4.2]
[XP-style progress bar — see §4.3]
[small footnote — "Stacks mainnet"]
```

### 4.2 Status text rotation

Show one of these messages, cycling every 800ms:

1. `"Loading fonts..."`
2. `"Connecting to Stacks mainnet..."`
3. `"Preparing game engine..."`
4. `"Almost ready..."`

Implemented with a `useEffect` + `setInterval` driving a state index. Stop cycling when transition begins.

### 4.3 Progress bar

XP-style "ghost" indeterminate bar: a narrow highlight segment (`20%` width) that slides right-to-left continuously via CSS `@keyframes`. Track: `120px × 12px`, `#000058` background, `1px solid #4444aa` border, `2px` radius. No actual progress tracking needed — purely aesthetic.

### 4.4 Transition to desktop

Current: instant swap.  
New: BootScreen fades to black (`opacity: 1→0` over 400ms) then unmounts. Desktop fades in (`opacity: 0→1` over 300ms). Controlled by a `fading` state boolean in BootScreen.

### 4.5 Skip on revisit

On first visit: show full boot screen.  
On revisit (page refresh): skip after 800ms instead of the full duration. Use `sessionStorage.getItem("booted")` to detect.

---

## 5. Area 4 — Wallet Connect & NFT Flow

**Files:** `SystemTray.tsx`, `Taskbar.tsx`, `MintDialog.tsx`, `state/toasts.ts`

### 5.1 Remove inline banner from GameWindow

Delete the yellow "Playing offline" banner from `GameWindow.tsx`. Wallet discovery moves to the balloon (§5.2).

### 5.2 XP-style wallet balloon

Add a `WalletBalloon` component rendered by `SystemTray`. It appears 3 seconds after first page load if no wallet is connected. Appearance:

```
[Fox/wallet icon]  Connect your wallet
                   Save scores on-chain & mint NFTs
                   [Connect Now button]          [✕]
```

Positioned: `position: fixed`, bottom-right above the system tray. Has a CSS triangle tail pointing down-right toward the tray area.

Auto-dismisses after 8 seconds. Manual close via `✕`. On close, sets `sessionStorage.setItem("balloon-dismissed", "1")` — never shown again in that session.

### 5.3 Wallet chip in Taskbar

When connected, show a compact chip in the Taskbar (between the window buttons and system tray):

```
[○ green dot]  SP2C...3SV
```

- Address truncated: first 4 + "..." + last 3 chars.
- Click: opens `PlayerProfileWindow` (already exists).
- Chip uses existing Win95 button chrome.

### 5.4 Toast notifications

Upgrade the existing toast system (`state/toasts.ts`) to support a `type` field: `"info" | "success" | "error"`. Render different icons per type. Existing toasts that don't specify type default to `"info"`.

Specific toasts to add:
- **Mint success:** `"NFT #<id> minted! 🎮"` — type `"success"`, duration 6s.
- **Mint pending:** `"Minting… waiting for tx"` — type `"info"`, dismissed when tx confirms.
- **Connect error:** `"Wallet connection failed"` — type `"error"`, duration 5s.

### 5.5 Transaction pending indicator

While a mint tx is in-flight, show a spinner (CSS border-rotate animation) in the System Tray next to the clock. Driven by a `pendingTx` flag in `wallet.ts` store.

---

## 6. Area 5 — Window Animations & Interactions

**File:** `frontend/components/windows/Window.tsx`

### 6.1 Open animation

Windows animate in on mount: `transform: scale(0.92)` + `opacity: 0` → `scale(1)` + `opacity: 1` over `150ms ease-out`. CSS only via `@starting-style` (supported in Chrome 117+, Safari 17.4+) with a `prefers-reduced-motion` media query that disables it.

Fallback for older browsers: a `data-mounted` attribute set by `useEffect` after one frame, toggling a CSS class that applies the transition.

### 6.2 Close animation

When user clicks the close button:
- Run `scale(1) opacity(1) → scale(0.92) opacity(0)` over `120ms`.
- After animation, call the existing `close()` from window-manager.
- Implemented by adding a `closing` state in `Window.tsx`; the `×` button sets `closing=true` instead of calling `close()` directly. An `onAnimationEnd` / `onTransitionEnd` handler calls `close()`.

### 6.3 Minimize to taskbar

Minimize button (`_`) triggers the close animation targeted toward the taskbar button position. Use `getBoundingClientRect()` on both the window and its taskbar button to compute a `transform-origin` for the collapse. This is a best-effort visual — exact position match is not required.

### 6.4 Focus flash

When a non-focused window receives a `mousedown`:
- Briefly set titlebar brightness to `1.4` for `80ms` then back to `1.0` via CSS `filter`.
- Implemented via a `flashing` ref + `setTimeout`.

### 6.5 Drag clamping

`Window.tsx` already has drag logic. Add clamping so the window's titlebar cannot be dragged fully off-screen:
- `x = clamp(x, -width + 60, viewportWidth - 60)`
- `y = clamp(y, 0, viewportHeight - 28)` (28 = taskbar height)

---

## 7. Area 6 — Leaderboard & My NFTs Polish

**Files:** `LeaderboardWindow.tsx`, `MyNftsWindow.tsx`

### 7.1 Leaderboard row upgrades

Each row gains:

| Element | Detail |
|---------|--------|
| Rank badge | Circular badge: gold (#ffd700) for #1, silver (#c0c0c0) for #2, bronze (#cd7f32) for #3, grey for rest |
| Address chip | Monospace pill with light-blue background; truncated SP address |
| "YOU" highlight | If row matches connected wallet: amber left-border, `background: #fff8e1`, chip says "YOU" |
| Rank change indicator | `▲` green / `▼` red / `–` grey. Stored in `sessionStorage` as previous snapshot; computed on each load |

### 7.2 Loading skeleton

Replace any spinner/blank with a 3-row skeleton (grey animated shimmer bars) while data loads. Matches the row height of real rows.

### 7.3 My NFTs — grid view

Current view: 4-column grid with NFT image thumbnail + name + rarity label. Images are served from the `/api/metadata/score/[id]` route. Improvement: replace the generic border/image layout with an XP-terminal-themed card that displays score and rarity more prominently without relying solely on the SVG image. New layout:

- Grid: `repeat(auto-fill, minmax(72px, 1fr))`, gap `8px`.
- Each NFT card: black background, `1px solid #1a3a1a`, `4px` radius.
  - Score value: monospace, `#0f0`, bold.
  - "Score" label: `#555`, 9px.
  - Rank at mint: `#7fff7f`, 9px (from NFT metadata if available).
- Empty state: "No NFTs yet — play a game and mint your score!"
- Loading: 4-cell skeleton grid.

### 7.4 Leaderboard rank change tracking

On each successful leaderboard fetch, save `{address: score}` map to `sessionStorage("lb-snapshot")`. On next fetch, diff against snapshot to compute `▲ / ▼ / –`. Reset snapshot on `end-season` (detect via season number change).

---

## 8. Out of Scope

The following are explicitly excluded from this spec:

- Sound effects (need MP3 assets, tracked separately in plan Phase 8.2).
- Mobile parity (desktop-first by design).
- Contract changes of any kind.
- Trophy UI (removed intentionally, do not re-add).
- Claim-prize UI (removed intentionally, do not re-add).
- New windows or application features.

---

## 9. Success Criteria

| Criterion | How to verify |
|-----------|---------------|
| Game canvas renders gradient snake + glowing food | Visual inspection, no console errors |
| Game over → canvas overlay → MintDialog (no instant swap) | Play a game, observe sequence |
| Boot screen shows progress bar animation | Hard-refresh the page |
| Wallet balloon appears on first visit (disconnected) | Clear sessionStorage, load page, wait 3s |
| Wallet chip shows truncated address when connected | Connect wallet, check taskbar |
| Windows animate on open and close | Open/close any window |
| Leaderboard shows gold/silver/bronze badges + YOU highlight | Load leaderboard with connected wallet |
| My NFTs shows card grid | Connect wallet with minted NFTs |
| `prefers-reduced-motion` disables all CSS animations | Enable via OS or DevTools, check |
| TypeScript: `npx tsc --noEmit` passes | Run in `frontend/` |
| Vitest: `npm test` passes (6 tests) | Run in `frontend/` |
