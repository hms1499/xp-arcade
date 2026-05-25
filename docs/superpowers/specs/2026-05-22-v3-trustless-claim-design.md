# v3 Trustless Claim — Design Spec (DRAFT)

**Status:** Deferred — start work after the current contest ends. Target next contest cycle on **2026-06-01**.

**Author session:** 2026-05-22

## 1. Motivation

The currently-deployed `snake-score` (mainnet `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.snake-score`) has structural issues that cannot be patched off-chain. We accumulated documentation and partial UI workarounds during the 2026-05-21/22 sessions, but the root causes need a contract redeploy:

1. **Custodial pool.** Mint fee chảy thẳng vào ví owner cá nhân vì contract không dùng `as-contract`. Owner có thể tiêu pool bất cứ lúc nào → trust-based, không trustless.
2. **`claim-prize` is record-only.** Hàm set `prize-claimed = true` và return `(ok payout)` nhưng KHÔNG transfer STX. Tiền phân phối off-chain qua Season Admin → 2 source-of-truth (on-chain claimed flag vs off-chain Zustand ledger), dễ drift.
3. **`get-token-uri` ignores `token-id`.** Trả về `(var-get base-uri)` không concat id → marketplace 404.
4. **Mint fee post-condition semantics confusing.** Fee tới ví owner thay vì contract address → explorer/wallet hiểu sai dòng tiền.
5. **Tie disbursement có thể vượt 100% pool.** Owner phải bỏ tiền túi bù.
6. **Owner detection heuristic** vì không có `get-owner` read-only.

UI workarounds đã build trong session 2026-05-22 (recon strip, CSV export, batch pay, balance precheck, payout ledger) sẽ retire phần lớn khi v3 cutover — coi như tech debt có thời hạn.

## 2. Scope

### In-scope
- **Snake, Tetris, Pac-Man** — 3 contract mới (hoặc 1 generic + trait, xem §4).
- Rewrite `mint-score`, `claim-prize`, `end-season` để pool nằm trong contract (`as-contract`).
- `claim-prize` thực sự transfer STX → player tự rút, atomic.
- Add `get-owner` read-only.
- Fix `get-token-uri` concat token id.
- Retire toàn bộ off-chain payout flow (Zustand ledger, Season Admin pay buttons, reconciliation, CSV).

### Out-of-scope (giữ MVP discipline)
- Score anti-cheat (commit-reveal, ZK, server-signed) — ngoài scope.
- Top-10 sorted on-chain — giữ min-eviction.
- Trophy NFT — đã không dùng, đề nghị **xoá hẳn** khỏi v3 contract.
- Marketplace integration features mới.

## 3. Open decisions (cần align trước khi viết Clarity)

| # | Quyết định | Default đề xuất | Tradeoff |
|---|------------|-----------------|----------|
| D1 | State migration | **Hard cutover** — mất top-10 + best-score cũ | Seed-from-v2 sẽ tốn nhiều dev time, ROI thấp vì contest reset |
| D2 | Multi-game architecture | **3 contract riêng** (consistent với hiện tại) | 1 generic + trait sẽ DRY hơn nhưng phức tạp deploy + Clarity trait limitations |
| D3 | Player-pull vs admin-push | **Pure player-pull** (`claim-prize` self-service) | Admin override sẽ tái tạo trust issue |
| D4 | Dust handling | **Roll-over sang season kế tiếp** trong cùng contract | Sweep-to-owner phá trustless model; cap-by-pool an toàn nhất |
| D5 | Ties > 100% pool | **First-come-first-served, cap by pool** | Pool cạn = player tie đến trễ miss. Acceptable vì contract enforce |
| D6 | Season deadline on-chain | **Thêm** `season-end-block` + cho phép anyone gọi `end-season` sau block đó | Loại bỏ owner dependency cho closing |
| D7 | Trophy NFT | **Bỏ hẳn** | Đã không dùng UI; gọn contract |
| D8 | Mint fee | Giữ `u10000` Snake, `u20000` Tetris/Pac | Có thể tinh chỉnh, không critical |
| D9 | Score cap | Giữ `u9999` | Đã ship, không nên đổi |
| D10 | Contract ABI compat | **Break compat** — đặt tên mới (vd `snake-score-v3`) | Frontend swap address; 2 collection song song trên explorer là không tránh được |
| D11 | Per-game rarity thresholds | **Tune theo dynamic mỗi game** thay vì dùng chung 167/500/1000 | Contract simplicity giảm (3 `compute-rarity` khác nhau) nhưng tier achievement đồng đều giữa các game |

### D11 detail — đề xuất thresholds

Vấn đề trên v2: `compute-rarity` byte-identical ở cả 3 contract (Common <167 / Rare 167-499 / Epic 500-999 / Legendary ≥1000). Snake grid 20×20 cap max practical score ~397 → **Epic + Legendary tier vĩnh viễn rỗng cho Snake collection**. Tetris (level-scaled, unbounded) và Pac-Man (multi-maze) thì 4 tier đều đạt được.

Đề xuất v3 thresholds (final numbers cần playtest):

| Game | Common | Rare | Epic | Legendary | Lý do |
|------|--------|------|------|-----------|-------|
| Snake | <50 | 50-149 | 150-299 | ≥300 | Grid cap ~397 → Legendary đạt được khi gần fill grid |
| Tetris | <100 | 100-299 | 300-699 | ≥700 | Level-scaled; nhiều Tetris ở level cao mới Legendary |
| Pac-Man | <100 | 100-299 | 300-699 | ≥700 | Clear nhiều maze; ghost combo điểm cao |

Trong v2 hiện tại đã add tooltip trong `HighScoreWindow` Snake tab giải thích "Rare Snake ≈ Epic Tetris/Pac-Man" như band-aid. v3 cutover xong thì tooltip này gỡ.

## 4. High-level contract sketch

```clarity
;; snake-score-v3.clar
(define-constant CONTRACT (as-contract tx-sender))

(define-data-var contract-owner principal tx-sender)
(define-data-var current-season uint u1)
(define-data-var season-end-block uint u0)     ;; D6
(define-data-var season-accumulated uint u0)
(define-data-var top-ten (list 10 { player: principal, score: uint }) (list))
(define-map best-score principal { score: uint, token-id: uint, season: uint })
(define-map season-prize uint { total: uint, top-ten: (list 10 ...) })
(define-map prize-claimed { player: principal, season: uint } bool)

(define-public (mint-score (score uint) (name (string-ascii 24)))
  ;; ... pay MINT_FEE to (as-contract tx-sender), mint NFT, update top-ten
)

(define-public (end-season)
  ;; Either owner OR anyone after season-end-block (D6).
  ;; Snapshot top-ten + accumulated into season-prize.
  ;; Carry leftover dust into new season-accumulated (D4).
)

(define-public (claim-prize (season uint))
  ;; Compute payout from snapshot, set prize-claimed,
  ;; (as-contract (stx-transfer? payout tx-sender player)).
  ;; Atomic. Reverts if pool exhausted (D5).
)

(define-read-only (get-owner) (var-get contract-owner))
(define-read-only (get-token-uri (id uint))
  (some (concat (var-get base-uri) (uint-to-string id))))   ;; fix
```

## 5. Test surface

Reuse `contract/tests/` infrastructure. New test groups:
- mint → fee actually arrives at contract (assert `stx-get-balance CONTRACT`).
- claim-prize → STX moves to player, balance decreases, idempotent (second call reverts).
- claim-prize → reverts when pool exhausted (D5 enforcement).
- end-season → permissionless after `season-end-block` (D6).
- end-season → dust rolls over (D4 — assert new season-accumulated = leftover).
- get-token-uri → returns base-uri + id (fix).
- All existing top-ten / best-score / mint cap tests ported.

Target: maintain ≥ 34 tests passing baseline; add ~10-15 new ones.

## 6. Migration playbook

1. Close current mainnet season via `end-season` on v2 (owner manual).
2. Distribute all remaining payouts via Season Admin (using existing batch-pay UI).
3. Verify zero outstanding obligation (recon strip "Unsent 0" cho cả 3 game).
4. Deploy v3 to mainnet via `clarinet deployments apply --mainnet`.
5. Update `NEXT_PUBLIC_CONTRACT_ADDRESS` per game + Vercel env.
6. Switch frontend to v3 contract addresses.
7. **Retire UI**: gỡ `payout-ledger`, `reconciliation`, `payout-csv`, `stx-balance`, phần lớn `SeasonAdminWindow` (chỉ giữ `End Season` + read-only views).
8. Announcement: "v2 collection frozen, v3 launched for new contest cycle starting 2026-06-01".

## 7. Frontend retire list (post-cutover)

Code có thể xoá hoàn toàn:
- `frontend/state/payout-ledger.ts`
- `frontend/lib/reconciliation.ts` + test
- `frontend/lib/payout-csv.ts` + test
- `frontend/lib/payout-memo.ts` + test
- `frontend/lib/stx-balance.ts` + test
- `frontend/lib/tx-tracker.ts` (nếu không có chỗ khác dùng)
- Phần lớn `SeasonAdminWindow.tsx` (Send STX / Retry / Batch / Recon / CSV / Balance banner — chỉ giữ End Season + countdown + danh sách mùa read-only)
- `claimPrize` đã xoá rồi (commit 4e066cc). `hasClaimedPrize`, `getSeasonPrize` có thể giữ làm read-only views.

Code thêm mới:
- UI cho player thấy "Claim X STX" button trên LeaderboardWindow khi ở top-10 mùa đã đóng.
- Helper `claimPrizeV3(gameId, season)` — wraps `openContractCall("claim-prize")`.

## 8. Timeline estimate

| Phase | Việc | Ước lượng |
|-------|------|-----------|
| 1 | Brainstorm + finalize D1-D10 | 0.5 ngày |
| 2 | Viết Clarity + Vitest tests cho Snake v3 | 2 ngày |
| 3 | Port sang Tetris + Pac-Man (clone + tinh chỉnh) | 1 ngày |
| 4 | Testnet deploy + smoke test | 0.5 ngày |
| 5 | Frontend retire + claim UI mới | 2 ngày |
| 6 | Mainnet deploy + cutover + announcement | 0.5 ngày |
| **Tổng** | | **~6.5 ngày làm việc** |

Buffer 30% → khoảng 1.5-2 tuần calendar nếu làm part-time.

## 9. Blockers / preconditions

- ✅ Phải xong cuộc thi hiện tại trước (contract đang ship cho contest).
- ✅ Player payout mùa cuối phải settle xong (recon = clean).
- ⚠️ Cần confirm contest rule có cho phép contract mới deploy ngay không, hay phải đợi gap period.
- ⚠️ Marketing/announcement plan để player hiểu v2 → v3 (top-10 reset).

## 10. References

- v2 design spec: `docs/superpowers/specs/2026-05-14-snake-score-nft-v2-design.md`
- Current contract: `contract/contracts/snake-score.clar`
- Current frontend admin flow: `frontend/components/windows/SeasonAdminWindow.tsx`
- Session 2026-05-22 commits (P0/P1 polish that will partially retire post-v3):
  - `f7d0fd9` tie-breaking fix
  - `4e066cc` remove unused claimPrize
  - `89c77f9`, `88e8830` pool balance precheck
  - `8ea1878`, `fd0ec9a`, `a6d2e51` reconciliation + CSV
  - `1571cab` batch Pay all unsent
