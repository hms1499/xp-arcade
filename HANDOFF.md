# Handoff — XP Snake on Stacks

**Status as of 2026-05-16:** Contract **deployed to Stacks mainnet**. Frontend live at **https://xp-snake.vercel.app**. Trophy UI removed, claim-prize UI removed, Season Admin window built, soft countdown via env var. Repo pushed to `github.com/hms1499/xp-snake`. **Production smoke test remains.**

---

## Live state

| Thing | Value |
|---|---|
| Network | Stacks **mainnet** |
| Main contract | `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.snake-score` |
| SIP-009 trait | `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.nft-trait` |
| Deployer / `contract-owner` | `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV` |
| Total deploy cost | ~0.098 STX |
| Tests | contract: 42 ✓ · frontend: 125 ✓ · `npm run typecheck`: clean · `npm run build`: clean |
| GitHub | `https://github.com/hms1499/xp-snake` (default branch: `main`) |

On-chain right now: 1 score NFT minted (token #1, score 2, player `SPV5...QFH8Y`), pool = 0.01 STX, current season = 1.

---

## What changed this session

| Commit | Summary |
|---|---|
| `538218c` | Added mainnet deployment plan; deployed both contracts |
| `4690717` | Frontend env + UI fallbacks now point to mainnet |
| `f2dbad9` | **Fix:** STX post-condition for mint fee (was being rejected by wallet) |
| `f2dbad9` | **Fix:** `unwrap()` helper for nested `{type, value}` shape from `@stacks/transactions` v7 `cvToValue` — was rendering "undefined" / NaN in leaderboard |
| `521efb4` | **Fix:** moved `unwrap` to `lib/cv-unwrap.ts` so server API routes (`/api/metadata/*`) can use it |
| `5019071` | **Refactor:** dropped Trophy NFT UI — TrophyDialog, trophy metadata route, `claim-trophy` helper, `trophySvg`, `canvas-confetti` dep. Contract still exposes trophy functions; just not surfaced. |
| `b9825dc` | **Feat:** `SeasonAdminWindow` (owner-only, gated by `address === stacks.contractAddress`) — End Season button + per-row Send STX for past-season payouts. `LeaderboardWindow` now discovers claimable past seasons automatically (was hardcoded to `season=1` which always failed). |
| `6a3c683` | **Feat:** soft countdown via `NEXT_PUBLIC_SEASON_END_ISO` shown in Leaderboard header + Season Admin |
| `50c04d7` + `2c7c22f` | README rewrite |
| (this session) | **Feat:** public player profile at `/player/[address]` — NFT grid, best/mints/seasons/fees stats, rarity breakdown, copy-address + explorer link, linked from every leaderboard row and from MyNftsWindow |
| (this session) | **Perf:** 1y immutable `Cache-Control` on `/api/metadata/score/[id]` + 60-req/min/IP rate limit |
| (this session) | **Refactor:** extracted `lib/holdings.ts`, `lib/player-stats.ts`, `lib/stacks-address.ts`, `lib/rate-limit.ts` (each with vitest coverage) |
| (this session) | **Feat:** PlayerProfileWindow — in-app XP window for player profiles. Leaderboard rows + MyNftsWindow now open the window in-place instead of redirecting. Window-manager extended with payload so the same window swaps between addresses. `/player/[address]` route still exists as the public shareable view (both wrap `PlayerProfileBody`). |
| (this session) | **CI:** added `frontend` CI scripts, GitHub Actions for frontend + contract checks, and metadata route coverage for invalid IDs, missing NFTs, success responses, and rate limiting. |
| (this session) | **Safety:** hardened Season Admin payouts with typed `SEND` confirmation, full recipient/amount/memo preview, owner-balance preflight, and guards against resending rows already marked pending or paid. |
| (this session) | **Review:** added frontend score-risk checks for mint dialogs and Season Admin. This flags unusually high or too-fast scores for admin review without changing contract behavior. |

---

## To-do for next session

### 0. CI / hardening follow-up

- [ ] Confirm the new GitHub Actions workflow is green on the remote branch.
- [ ] Decide whether Clarinet warnings from `clarinet check` should fail CI in a future contract-hardening pass.
- [ ] Add Playwright smoke coverage for desktop boot, game launch, mint dialog, High Score, My NFTs empty/error states, and mobile controls.

### 1. Production smoke test

After Vercel is live, walk through every flow with the **owner wallet** and a **second non-owner wallet**:

**As non-owner player:**
- [ ] Boot → desktop loads, taskbar + Start menu visible
- [ ] Start → no "Season Admin" entry (correct — hidden from non-owners)
- [ ] Connect wallet (Leather / Xverse mainnet) → tray shows address
- [ ] Play Snake → game over → MintDialog opens with "0.01 STX" copy
- [ ] While playing, click another XP window → Snake auto-pauses ("⏸ PAUSED"); clicking back does NOT auto-resume; Esc/Resume continues
- [ ] HUD shows `Score: n · Best: m`; beating the stored best makes `Best` climb live
- [ ] Game-over overlay shows gold `NEW PERSONAL BEST!` on a record, else white `BEST: n`; on-chain `NEW HIGH SCORE` line (if top-10) still appears separately without overlapping `Press any key...`
- [ ] Mint → wallet popup shows `Will transfer exactly 0.01 STX` post-condition → confirm
- [ ] Balloon "Mint submitted" → wait ~30s → "NFT confirmed!"
- [ ] My NFTs → score NFT renders with inline SVG + rarity badge
- [ ] Leaderboard → top-10 shows real addresses + scores (no "undefined"/NaN); countdown ticks
- [ ] Any window: click the middle titlebar button → fills desktop, stops above taskbar, button shows Restore glyph; click again restores exact prior position/size
- [ ] Double-click a titlebar → toggles maximize/restore; titlebar drag is disabled while maximized
- [ ] Maximize then minimize to taskbar then reopen → window is still maximized; maximizing the Snake window keeps the game playable; a maximized window with tall content scrolls (no clip behind taskbar)
- [ ] ~~If in top-10 of a *past* season: claim box appears with computed payout~~ *(claim-prize UI removed — see Known limitations)*

**As owner:**
- [ ] Connect with `SP2C...3SV` → Start menu now shows 🛠️ "Season Admin"
- [ ] Season Admin → current season + pool match on-chain (verify via `clarinet console` or Hiro Explorer)
- [ ] Click End Season → confirm dialog → wallet popup → tx submits
- [ ] After mine: window auto-reloads, Season 1 appears as past season with payout table
- [ ] Click "Send STX" on a row → wallet popup for `openSTXTransfer` with correct amount → confirm
- [ ] Recipient receives STX *(no in-app claim flow — payouts are owner-initiated only)*

### 2. Demo prep

- 2–3 min Loom of the full owner + player flow
- Screenshot the README's "Live contracts" link working in Hiro Explorer
- Note the Stacks-explorer URL pattern for judges: `explorer.hiro.so/txid/SP2CMK69...snake-score?chain=mainnet`

---

## Known limitations / quirks (carry forward)

1. **Claim-prize UI removed.** The `claim-prize` contract function and `hasClaimedPrize` / `getSeasonPrize` helpers remain on-chain and in `contract-calls.ts`, but the in-app claim flow (prize discovery in LeaderboardWindow, claim button, payout display) has been dropped. Payouts are owner-initiated: the Season Admin "Send STX" button is the only workflow. Players are not expected to trigger anything.
2. **`as-contract` not used.** All STX goes through the owner wallet, not the contract.
3. **Score is client-trusted.** No on-chain anti-cheat. Mention in the demo.
4. **Soft deadline only.** `NEXT_PUBLIC_SEASON_END_ISO` is display-only; doesn't block mints past the date. Owner must call `end-season` manually to honour it.
5. **Owner detection heuristic.** "Season Admin" entry shows when `wallet.address === stacks.contractAddress`. Breaks if `transfer-ownership` is called (contract has no read-only for `contract-owner` — would need a redeploy to add). Acceptable for MVP.
6. **Trophy code still on-chain.** `claim-trophy`, `get-trophy-data` etc. live in mainnet contract; we just don't expose them. If someone calls them directly the contract still works.
7. **Mint fee → owner wallet, not contract.** Pool is a counter (`season-accumulated`), not a balance. Real STX accumulates in owner wallet.
8. **No path with spaces.** Vitest's worker pool fails on URL-encoded paths.

---

## Files / structure cheat-sheet

| Where | What |
|---|---|
| `contract/contracts/snake-score.clar` | All on-chain logic |
| `contract/contracts/nft-trait.clar` | SIP-009 trait |
| `contract/tests/*.test.ts` | 34 Vitest tests |
| `contract/deployments/default.mainnet-plan.yaml` | Mainnet plan (cost ~0.098 STX) |
| `frontend/lib/contract-calls.ts` | All read/write contract helpers + `computePayoutUstx` + `transferStx` |
| `frontend/lib/cv-unwrap.ts` | Client-neutral helper for `@stacks/transactions` v7 `cvToValue` |
| `frontend/lib/season-countdown.ts` | `useSeasonCountdown` hook + `formatCountdown` |
| `frontend/components/windows/SeasonAdminWindow.tsx` | Owner-only window (exports `isOwnerAddress`) |
| `frontend/components/windows/LeaderboardWindow.tsx` | Top-10 + claim-prize discovery + countdown |
| `frontend/.env.local` | Local mainnet config (gitignored) |

---

## Pointers

- README at the repo root has full project overview + commands
- Design spec: `docs/superpowers/specs/2026-05-14-snake-score-nft-v2-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-14-snake-score-nft-v2.md`
- Repo conventions (for AI assistants): `CLAUDE.md`
