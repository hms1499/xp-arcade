# Live-Wallet Smoke Test — Mint Path (mainnet)

**Date:** 2026-06-13
**Scope:** MINT path only. Non-destructive — does **not** end a season or claim.
**Goal:** Prove the real money flow that automated health checks never exercise:
*mint fee → prize pool → Score NFT minted → metadata resolves → leaderboard updates.*

You drive the wallet (connect, play, sign the mint) in the browser. The script
`frontend/scripts/smoke-snapshot.mjs` reads on-chain state **before** and **after**
so you can diff the deltas. The script never signs or broadcasts anything.

---

## 0. Prerequisites

- [ ] A Stacks wallet (Leather/Xverse) holding a **few STX**. The mint fee varies
      per game (e.g. snake `10000` uSTX, pac-man `20000` uSTX) plus gas — the
      script prints the exact fee as `mint-fee (uSTX)`. Use a wallet you don't mind
      appearing on the public leaderboard.
- [ ] Note your address (starts with `SP…`) and pick a game:
      `snake | tetris | pacman | bricks | minesweeper`.
- [ ] From `frontend/`, confirm the script runs (read-only, safe):

```bash
cd frontend
node scripts/smoke-snapshot.mjs <SP...your-address> <game>
# or: npm run smoke:snapshot -- <SP...your-address> <game>
```

---

## 1. BEFORE — capture the baseline

- [ ] Run and **save the output** (copy the whole block):

```bash
node scripts/smoke-snapshot.mjs <SP...your-address> <game>
```

Record these four numbers from the block:

| Field | Symbol |
|---|---|
| `last-token-id` | **L0** |
| `prize-pool (uSTX)` | **P0** |
| `mints-remaining (you)` | **M0** |
| `mint-fee (uSTX)` | **F** |

- [ ] **Guard:** if `M0 == 0`, you've hit the per-season mint cap
      (`MAX-MINTS-PER-SEASON = 10`); the mint will revert with
      `ERR-MINT-LIMIT-REACHED (u108)`. Use a different wallet or game.

---

## 2. MINT — drive the wallet in the browser

- [ ] Open production: <https://xp-snake.vercel.app>
- [ ] Connect your wallet; confirm it shows your `SP…` address.
- [ ] Play the chosen game and reach the mint dialog. Note the **score X** you mint.
- [ ] Sign the mint transaction. **Verify the wallet shows a post-condition**
      sending **≤ F uSTX** (no token-moving write should be unguarded).
- [ ] Copy the **txid** and watch it to `success` on Hiro Explorer:
      `https://explorer.hiro.so/txid/<txid>?chain=mainnet`
- [ ] Wait for **confirmed** (anchored), not just pending, before step 3.

---

## 3. AFTER — re-snapshot and assert deltas

- [ ] Run again, this time passing the **new token id** you expect (`L0 + 1`) so
      the script also resolves its owner + metadata:

```bash
node scripts/smoke-snapshot.mjs <SP...your-address> <game> <L0+1>
```

Assert every row:

- [ ] **New token minted:** `last-token-id == L0 + 1`.
- [ ] **You own it:** the `token #<L0+1>` block shows `on-chain owner` == your
      address.
- [ ] **Fee reached the pool:** `prize-pool == P0 + F` (pool grew by exactly the
      mint fee; if other people minted the same game concurrently it grew by a
      multiple of F — account for that).
- [ ] **Mint counter decremented:** `mints-remaining == M0 - 1`.
- [ ] **Metadata resolves:** the `token #<L0+1>` block shows `metadata name`,
      `metadata image: present`, and `attrs Score=X` matching what you minted.
- [ ] **Best score updated** (only if `X` beats your previous best): `your
      best-score` shows `score=X token-id=L0+1`.
- [ ] **Leaderboard** (only if `X` is high enough for the top-10): your address
      appears in the `top-ten` list with score `X`, marked `<-- YOU`.
- [ ] **Wallet debited sanely:** `wallet STX` dropped by roughly `F + gas`.

---

## 4. Result

- [ ] All assertions in §3 passed → **mint path verified on mainnet.** Update
      `HANDOFF.md` ("Remaining: complete the live-wallet smoke test" → done, with
      date + txid).
- [ ] If any assertion failed → **stop and capture**: the txid, both snapshot
      blocks, and which row diverged. That's a real money-flow bug, not a UI nit.

---

## Notes / out of scope

- **end-season + claim** are intentionally NOT covered here — closing a live
  production season to test claims is destructive and needs the owner key. Verify
  that leg separately on devnet/simnet (`clarinet console`) or against an already
  ended historical season.
- The script reads contract `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4`
  on mainnet. Override endpoints with `STACKS_API_URL` / `PRODUCTION_APP_URL` env
  vars if needed.
