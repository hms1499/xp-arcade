# Contract Review — Pre-Mainnet Deploy

**Contract:** `contract/contracts/snake-score.clar`  
**Reviewed:** 2026-05-14  
**Reviewer:** Claude Sonnet 4.6  
**Status:** ⛔ NOT READY FOR MAINNET — blocking issues listed below

---

## Summary

The contract is safe for testnet MVP use, but has four issues that must be addressed before a mainnet deploy where real funds/NFTs are at stake. Two of them are data-integrity bugs (cross-season exploit, non-unique token URIs); two are process gates (placeholder URI, deployer address).

---

## Blocking Issues (must fix before mainnet)

### 1. Cross-season best-score exploit — HIGH

**Lines:** `16`, `83–86`, `145–157`

`best-score` maps each player to their all-time highest score and is **never cleared on `reset-season`**. The trophy rank is computed from `best-score[tx-sender]` compared against the *current* top-ten — not the season's scores.

**Attack path:**

1. Season 1 — Player A mints score 100, enters top-ten.
2. Owner calls `reset-season` — top-ten cleared, `current-season` → 2.
3. Season 2 — Player A mints score 1 to re-enter top-ten with minimal effort.
4. Nine other players each get score 50. Top-ten = `[50×9, 1]`.
5. Player A calls `claim-trophy`:
   - `best-score[A]` = 100 (from Season 1 — never cleared)
   - `present` = true (A is in Season 2 top-ten via score 1)
   - rank-fold counts how many Season 2 scores exceed **100** → 0
   - Rank = **1** → A receives a Gold Trophy despite having Season 2 score of 1.

**Fix:** Clear `best-score` for all top-ten players on `reset-season`, or make it season-keyed:

```clarity
;; Option A — season-keyed best score
(define-map best-score { player: principal, season: uint }
  { score: uint, token-id: uint })
```

Then in `mint-score` use `{ player: tx-sender, season: (var-get current-season) }` as the key, and in `claim-trophy` read `best-score` with the *current* season key.

---

### 2. `get-token-uri` returns the same URI for every token — MEDIUM

**Line:** `185–186`

```clarity
(define-read-only (get-token-uri (token-id uint))
  (ok (some (var-get base-uri))))
```

`token-id` is accepted as a parameter but **completely ignored**. Every token — score #1 through #9999 — resolves to the exact same URI string. Wallets and marketplaces expect a token-specific metadata URI (or at minimum a URI with the token ID appended).

The `base-uri` value also contains the literal string `{id}` as a placeholder, but Clarity has no built-in string interpolation to substitute it at runtime.

**Fix:** The cleanest Clarity pattern is to store a base without `{id}` and have callers construct the full URL by appending the token ID. But since Clarity lacks `int-to-ascii`, the standard approach is:

```clarity
;; Store base URI without placeholder, e.g. "https://xp-snake.vercel.app/api/metadata/score/"
;; Marketplaces append the token ID themselves (standard indexer behaviour).
;; Alternatively, emit metadata inline via a map if off-chain infra is unreliable.
```

For the frontend metadata API routes (`/api/metadata/score/[id]`), this already works correctly — the Next.js route handles the token ID. The issue is only on-chain: `get-token-uri` must not return a URI with a literal `{id}` that no tool knows to substitute.

**Minimum fix before mainnet:** Call `set-base-uri` post-deploy with the real URL *without* `{id}`:

```
https://xp-snake.vercel.app/api/metadata/score/
```

---

### 3. Placeholder `base-uri` will break all marketplace metadata — HIGH (process gate)

**Line:** `113`

```clarity
(define-data-var base-uri (string-ascii 80)
  "https://xp-snake.example/api/metadata/score/{id}")
```

`xp-snake.example` does not exist. Any wallet or marketplace that tries to fetch token metadata immediately after deployment will receive a DNS failure. The contract will appear broken to every user.

**Fix:** Immediately after deployment, call `set-base-uri` from the deployer wallet:

```clarity
(contract-call? .snake-score set-base-uri
  "https://xp-snake.vercel.app/api/metadata/score/")
```

This should be the **first transaction** after the deploy transaction confirms. Add it as Step 0 in the deploy runbook.

---

### 4. `contract-owner` is set to `tx-sender` at deploy time — MEDIUM (process gate)

**Line:** `112`

```clarity
(define-data-var contract-owner principal tx-sender)
```

This is a standard Clarity pattern and not a code bug — the deployer becomes the owner at the moment the contract is published. The concern for mainnet is operational:

- If you deploy from a hot wallet (e.g., Leather with testnet mnemonic imported), the hot wallet becomes the permanent mainnet owner.
- There is **no `transfer-ownership` function** in the contract. Once set, ownership cannot be changed.
- If the deployer private key is lost or compromised, `reset-season` and `set-base-uri` become permanently inaccessible.

**Fix (pre-deploy):** Either hard-code the intended mainnet owner as a constant:

```clarity
(define-constant CONTRACT-OWNER 'SP1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX)
```

Or add a `transfer-ownership` function guarded by the current owner:

```clarity
(define-public (transfer-ownership (new-owner principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-OWNER)
    (var-set contract-owner new-owner)
    (ok true)))
```

---

## Non-Blocking Observations (acceptable for MVP, document for v2)

### 5. `mint-score` has no authorization — documented limitation

**Line:** `71`

Anyone can call `mint-score(9999, "hacker")` with an arbitrary score. This is the "score is client-trusted" limitation documented in `HANDOFF.md` and `CLAUDE.md`. It is acceptable for a hackathon MVP but means on-chain leaderboard data cannot be trusted on mainnet.

**For v2:** Implement a commitment scheme:
- Before playing: player submits `commit(hash(seed, player_addr))` on-chain.
- After game: player submits `reveal(seed, moves_hash, score)`.
- Contract verifies `hash(seed, player_addr)` matches commitment before minting.

This doesn't prove the score is correct but prevents simple score injection.

---

### 6. `pending-min` / `pending-removed` are global data-vars — design smell

**Lines:** `27–28`, `37–41`, `58–60`

These are used as "local" state inside `try-insert-top-ten`, but are declared as contract-level `define-data-var`. In Clarity, each transaction is atomic and single-threaded, so there is no race condition. However, it is architecturally confusing: a reader of the contract might expect these vars to persist meaningful state between calls, but they are only valid during one invocation of `try-insert-top-ten`.

No action required — just document them clearly or refactor in a future version.

---

### 7. `snake-trophy` has no `transfer` function — intentional but limits marketplace use

**Lines:** `107`, `179–183`

`transfer` on line 180 only transfers `snake-score` NFTs. `snake-trophy` has no transfer mechanism. This is intentional for the MVP (trophies are soul-bound), but means trophies cannot be listed on Gamma, Byzantion, or any marketplace.

**Document:** Trophies are non-transferable by design. If future versions want transferable trophies, add:

```clarity
(define-public (transfer-trophy (token-id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-OWNER)
    (nft-transfer? snake-trophy token-id sender recipient)))
```

---

### 8. SIP-009 trait is declared but not formally implemented

The contract does not include `(impl-trait ...)` for SIP-009. The functions are present and match the trait signature, but Clarity marketplaces that check `impl-trait` declarations will not auto-detect compliance.

**Minimum fix for indexer compatibility:**

```clarity
(impl-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)
```

Replace with the correct mainnet SIP-009 trait address before deploying.

---

## Deploy Runbook (in order)

1. ✅ Ensure deployer wallet is funded with ~0.5 STX for fees
2. ✅ Update `settings/Mainnet.toml` with the real deployer mnemonic
3. ⬜ **Fix cross-season best-score exploit** (Issue #1) before deploying
4. ⬜ Run `clarinet check` — must pass with zero errors
5. ⬜ Run `npm test` in `contract/` — all 14 tests must pass
6. ⬜ Deploy: `clarinet deployments apply --mainnet`
7. ⬜ **Immediately** call `set-base-uri` with real Vercel URL (Issue #3)
8. ⬜ Verify on Hiro Explorer: contract deployed, `get-token-uri` returns real URL
9. ⬜ Set `NEXT_PUBLIC_CONTRACT_ADDRESS` in Vercel env to mainnet contract ID
10. ⬜ Trigger Vercel production deploy
11. ⬜ End-to-end smoke test: connect wallet → mint score → verify NFT appears in explorer

---

## Issues Index

| # | Severity | Blocking? | Summary |
|---|----------|-----------|---------|
| 1 | HIGH | ✅ Yes | Cross-season best-score → wrong trophy rank |
| 2 | MEDIUM | ✅ Yes | `get-token-uri` ignores token-id param |
| 3 | HIGH | ✅ Yes | Placeholder URI breaks metadata on deploy |
| 4 | MEDIUM | ⚠️ Process | `contract-owner` → deployer, no transfer mechanism |
| 5 | INFO | ❌ No | Unbounded minting — documented limitation |
| 6 | INFO | ❌ No | Global pending-min/removed vars — design smell |
| 7 | INFO | ❌ No | Trophies non-transferable — intentional |
| 8 | LOW | ❌ No | `impl-trait` not declared for SIP-009 |
