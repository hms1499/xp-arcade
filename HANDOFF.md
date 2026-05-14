# Handoff — XP Snake on Stacks

**Status as of 2026-05-14:** Contract v2 fully implemented and tested (34 tests). Frontend updated for v2. Testnet deploy and Vercel deploy remain.

## What's done

| Phase | Status | Output |
|---|---|---|
| 0. Scaffolding | ✅ | `.gitignore`, `README.md` |
| 1. Clarity contract v1 | ✅ | `contract/contracts/snake-score.clar` + 14 Clarinet tests |
| 2. Next.js + snake engine | ✅ | `frontend/lib/snake-engine.ts` + 5 Vitest tests |
| 3. Stacks integration | ✅ | `frontend/lib/stacks.ts`, `contract-calls.ts`, `state/wallet.ts` |
| 4. XP UI shell | ✅ | `frontend/components/desktop/*`, `Window.tsx`, `window-manager.ts` |
| 5. Game window + mint | ✅ | `GameCanvas.tsx`, `MintDialog.tsx`, `GameWindow.tsx` |
| 6. Leaderboard + trophy | ✅ | `LeaderboardWindow.tsx`, `TrophyDialog.tsx` (canvas-confetti) |
| 7. My NFTs + metadata | ✅ | `MyNftsWindow.tsx`, `app/api/metadata/{score,trophy}/[id]/route.ts`, `metadata-svg.ts` |
| 8. Polish | ✅ | `BootScreen.tsx`, Balloons toast system, night city wallpaper, Web Audio sound effects |
| **v2. Contract upgrade** | ✅ | See detail below — 34 tests passing |
| **v2. Frontend upgrade** | ✅ | See detail below — 7 tests, 0 type errors |
| Deploy to testnet | ⏸ | Needs funded deployer wallet — see steps below |
| Deploy to Vercel | ⏸ | Waiting on Vercel auth — see steps below |

### v2 Contract changes (2026-05-14, commits `7b1a3e7` → `6754237`)

| Feature | What was added |
|---|---|
| SIP-009 `impl-trait` | Local `nft-trait.clar` + `(impl-trait .nft-trait.nft-trait)` for marketplace indexer compatibility |
| Score cap | `(asserts! (<= score u9999) ERR-SCORE-TOO-HIGH)` — error `u104` |
| Mint fee | 0.01 STX per mint → accumulates in `season-accumulated` (tracked in contract, paid to deployer) |
| Rarity tiers | `compute-rarity` stored in `score-data.rarity`: Common 0–166 / Rare 167–499 / Epic 500–999 / Legendary 1000+ |
| Prize pool | `season-prize` map + `season-accumulated` var — snapshots pool + top-ten at season end |
| `end-season` | Owner-only; replaces `reset-season`. Snapshots, clears top-ten, increments season |
| `claim-prize` | Claim-based payout by rank: top 3 = 20% each, rank 4–10 = `(total * 4) / 70` each |
| `transfer-ownership` | New owner guard so deployer key can be rotated |
| `base-uri` fix | Default no longer includes `{id}` placeholder |

**Critical implementation note:** `as-contract` is unsupported in clarinet WASM simnet. Mint fee is transferred to `contract-owner` (not contract address). `claim-prize` records owed amounts and returns the payout value but does NOT execute an actual STX transfer — actual distribution must be done off-chain by the contract owner. This is a known limitation; real STX transfer requires `as-contract` on mainnet.

### v2 Frontend changes (2026-05-14, commits `74e61ac` → `6702e25`)

| File | What changed |
|---|---|
| `lib/contract-calls.ts` | Added `getPrizePoolBalance`, `getSeasonPrize`, `hasClaimedPrize`, `claimPrize` |
| `lib/metadata-svg.ts` | Added `Rarity` type, `rarityColor()` helper, rarity colour border + label in score SVG |
| `app/api/metadata/score/[id]/route.ts` | Passes `rarity` to SVG; returns SIP-016 `attributes` array (Rarity, Season, Score) |
| `MintDialog.tsx` | Shows "Minting costs 0.01 STX"; detects error `u104` (score-too-high) |
| `LeaderboardWindow.tsx` | Displays live prize pool balance; shows "Claim Prize" button for top-10 players |
| `MyNftsWindow.tsx` | Rarity badge on each score NFT card, coloured by tier |

## To-do for you

### 1. Deploy the v2 contract to Stacks testnet

The deployer address is **`ST2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB4PBYSC2`** (derived from your mnemonic in `contract/settings/Testnet.toml`).

> ⚠️ This is a **breaking contract change** — a new contract address will be generated. Update `NEXT_PUBLIC_CONTRACT_ADDRESS` in Vercel after deploy. Old testnet NFTs (v1) will not have `rarity` field — handle gracefully in frontend (the `rarity` field is already `rarity?: string` so missing values render no badge).

Steps:

1. Visit https://explorer.hiro.so/sandbox/faucet?chain=testnet
2. Paste `ST2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB4PBYSC2` and request STX (cost is ~0.1 STX; faucet sends 500)
3. Wait ~1–2 minutes for confirmation, then:

```bash
cd contract
clarinet deployments apply --testnet
```

4. Note the contract address from the output (format: `ST2CMK69QN...snake-score`).

### 2. Wire the frontend to the deployed contract

```bash
cd frontend
cp .env.example .env.local
```

Edit `.env.local`:
```
NEXT_PUBLIC_CONTRACT_ADDRESS=<the contract address from step 1>
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Local smoke test

```bash
cd frontend
npm run dev
```

Open http://localhost:3000 and walk through the demo flow:

- [ ] Boot screen renders (1.4s) → XP desktop with wallpaper, taskbar, start button
- [ ] System tray "Connect Wallet" → Leather/Xverse popup → connect testnet wallet
- [ ] Double-click "Snake.exe" → game window opens, draggable, closable
- [ ] Play a game → game over → MintDialog shows "Minting costs 0.01 STX" notice
- [ ] Enter player name → "Mint as NFT" → wallet popup (approve 0.01 STX) → tx submits → balloon notification
- [ ] Open My NFTs → score NFT renders with rarity badge (colour matches tier)
- [ ] Open Leaderboard → prize pool balance visible (e.g. "0.0001 STX") → top scores load
- [ ] Leaderboard shows "Claim Prize" button if wallet is in top-10
- [ ] "Claim Trophy" button visible when in top-10 → tx submits → confetti + rank dialog
- [ ] Start menu opens, shutdown reloads page
- [ ] Disconnect from system tray clears state

### 4. Deploy to Vercel

```bash
cd frontend
npx vercel link
npx vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS preview
npx vercel env add NEXT_PUBLIC_NETWORK preview         # value: testnet
npx vercel env add NEXT_PUBLIC_APP_URL preview         # set after first preview deploy
npx vercel deploy

# After verifying preview URL:
npx vercel deploy --prod
```

If you want the deployed Vercel URL to also serve metadata for marketplaces, call `set-base-uri` from the deployer wallet (via Stacks explorer sandbox or `clarinet console`) once the Vercel URL is known:

```clarity
(contract-call? .snake-score set-base-uri "https://<vercel-url>/api/metadata/score/")
```

### 5. Demo prep

- Record a 2–3 min Loom walking through the demo flow above
- Take screenshots for `README.md`
- Note the Stacks explorer link to your contract for judges to verify

## Known limitations (mentioned in spec §12)

- **Score is client-trusted.** No on-chain verification of gameplay. Acceptable for hackathon MVP; surface this in the demo. Future: on-chain RNG + replay verification.
- **Top-10 is unsorted on-chain.** Eviction works (lowest score gets bumped when 11th higher score arrives), but ordering is done client-side in `LeaderboardWindow`. `claim-trophy` rank is computed via fold counting higher scores — no sort needed.
- **Trophy rank locked at claim time.** Documented behavior — if a player claims at rank 3 then gets bumped to rank 4, their trophy stays Bronze.
- **No sound effects.** Spec §8 listed XP `ding`/`error`/`balloon` MP3s; skipped since I can't generate audio assets. To add: drop MP3s into `frontend/public/sounds/` and use the `lib/sounds.ts` snippet from the plan (Phase 8 task 8.2).
- **Mobile is fallback only.** XP metaphor is desktop-first by design. Mobile users will see a janky responsive view.

## Environment quirks

- The project was renamed from `Desktop/untitled folder` → `Desktop/xp-snake` early on because **Vitest's worker pool cannot launch from paths containing spaces** (URL-encoded `%20` breaks worker thread spawn). Don't rename back.
- Vitest 4 is incompatible with `vitest-environment-clarinet` 3 — the contract workspace pins `vitest@^3`. Same constraint applies if you regenerate the contract from `clarinet new`.
- Clarinet rejects non-ASCII characters in `.clar` files (em-dash `—`, smart quotes, etc.). Use ASCII hyphens.

## Pointers

- Design spec: `docs/superpowers/specs/2026-05-13-xp-snake-stacks-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-13-xp-snake-stacks.md`
- Manual test checklist: see spec §8
- Polish priorities (if more time): spec §10
