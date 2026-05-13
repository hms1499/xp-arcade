# Handoff — XP Snake on Stacks

**Status as of 2026-05-13:** Phases 0–8 complete. 14 commits, 21 tests passing (14 contract + 7 web). Production type-check clean. Browser smoke testing and testnet deploy remain.

## What's done

| Phase | Status | Output |
|---|---|---|
| 0. Scaffolding | ✅ | `.gitignore`, `README.md` |
| 1. Clarity contract | ✅ | `contract/contracts/snake-score.clar` + 14 Clarinet tests passing |
| 2. Next.js + snake engine | ✅ | `web/lib/snake-engine.ts` + 5 Vitest tests passing |
| 3. Stacks integration | ✅ | `web/lib/stacks.ts`, `web/lib/contract-calls.ts`, `web/state/wallet.ts` |
| 4. XP UI shell | ✅ | `web/components/desktop/*`, `web/components/windows/Window.tsx`, `web/state/window-manager.ts` |
| 5. Game window + mint | ✅ | `GameCanvas.tsx`, `MintDialog.tsx`, `GameWindow.tsx` |
| 6. Leaderboard + trophy | ✅ | `LeaderboardWindow.tsx`, `TrophyDialog.tsx` (with `canvas-confetti`) |
| 7. My NFTs + metadata | ✅ | `MyNftsWindow.tsx`, `app/api/metadata/{score,trophy}/[id]/route.ts`, `lib/metadata-svg.ts` + 2 Vitest tests passing |
| 8. Polish | ✅ | `BootScreen.tsx`, `Balloons` toast system. Sound effects deferred (need MP3 assets). |
| 1.8. Testnet deploy | ⏸ | Plan generated. Waiting on deployer funding + apply. |
| 9. Vercel deploy | ⏸ | Waiting on user Vercel auth. |

## To-do for you

### 1. Deploy the contract to Stacks testnet

The deployer address is **`ST2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB4PBYSC2`** (derived from your mnemonic in `contract/settings/Testnet.toml`).

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
cd web
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
cd web
npm run dev
```

Open http://localhost:3000 and walk through the demo flow:

- [ ] Boot screen renders (1.4s) → XP desktop with wallpaper, taskbar, start button
- [ ] System tray "Connect Wallet" → Leather/Xverse popup → connect testnet wallet
- [ ] Double-click "Snake.exe" → game window opens, draggable, closable
- [ ] Play a game → game over → input player name → "Mint as NFT" → wallet popup → tx submits → balloon notification appears
- [ ] Open Leaderboard → top scores load → your address highlighted → "Claim Trophy" enabled
- [ ] Click Claim → tx submits → confetti + Gold/Silver/Bronze/Top 10 dialog
- [ ] Open My NFTs → score and trophy NFTs render as SVG thumbnails
- [ ] Start menu opens, shutdown reloads page
- [ ] Disconnect from system tray clears state

### 4. Deploy to Vercel

```bash
cd web
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
- **No sound effects.** Spec §8 listed XP `ding`/`error`/`balloon` MP3s; skipped since I can't generate audio assets. To add: drop MP3s into `web/public/sounds/` and use the `lib/sounds.ts` snippet from the plan (Phase 8 task 8.2).
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
