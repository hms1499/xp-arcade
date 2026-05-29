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
- **Một contract registry duy nhất** (`xp-arcade-v3`, xem §11) phục vụ Snake, Tetris, Pac-Man và mọi game thêm sau qua `register-game`. (§4 sketch theo mô hình per-contract cũ — giữ làm tham chiếu lịch sử; §11 là kiến trúc default.)
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
| D2 | Multi-game architecture | **Single registry contract** (xem **§11**) — thêm game = 1 contract call, không deploy. Mục tiêu roadmap là scale tới ~100 game | Single registry: blast radius gộp (1 bug ảnh hưởng mọi game), 1 collection chung trên marketplace, audit kỹ hơn 1 lần. Phương án cũ "3 contract riêng": cô lập + collection riêng nhưng mỗi game mới = deploy + audit + phí → không scale |
| D3 | Player-pull vs admin-push | **Pure player-pull** (`claim-prize` self-service) | Admin override sẽ tái tạo trust issue |
| D4 | Dust handling | **Roll-over sang season kế tiếp** trong cùng contract | Sweep-to-owner phá trustless model; cap-by-pool an toàn nhất |
| D5 | Ties > 100% pool | **First-come-first-served, cap by pool** | Pool cạn = player tie đến trễ miss. Acceptable vì contract enforce |
| D6 | Season deadline on-chain | **Thêm** `season-end-block` + cho phép anyone gọi `end-season` sau block đó | Loại bỏ owner dependency cho closing |
| D7 | Trophy NFT | **Bỏ hẳn** | Đã không dùng UI; gọn contract |
| D8 | Mint fee | Giữ `u10000` Snake, `u20000` Tetris/Pac | Có thể tinh chỉnh, không critical |
| D9 | Score cap | Giữ `u9999` | Đã ship, không nên đổi |
| D10 | Contract ABI compat | **Break compat** — một contract tên mới `xp-arcade-v3` cho cả platform | Frontend swap sang một address chung; v2 (4 contract cũ) frozen song song trên explorer là không tránh được |
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
4. Deploy v3 registry `xp-arcade-v3` to mainnet via `clarinet deployments apply --mainnet`, sau đó gọi `register-game` cho Snake/Tetris/Pac-Man (+ game mới).
5. Update `NEXT_PUBLIC_CONTRACT_ADDRESS` về MỘT contract chung (`<deployer>.xp-arcade-v3`) + Vercel env; map string-id -> uint `onchainId` trong `game-registry.ts`.
6. Switch frontend sang contract address chung + truyền `game-id` vào các call.
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
| 2 | Viết Clarity registry `xp-arcade-v3` + Vitest tests (mint/claim/end-season generic theo game-id) | 2 ngày |
| 3 | `register-game` + test pool/season isolation; seed Snake/Tetris/Pac-Man (không clone contract) | 0.5 ngày |
| 4 | Testnet deploy + smoke test | 0.5 ngày |
| 5 | Frontend retire + claim UI mới | 2 ngày |
| 6 | Mainnet deploy + cutover + announcement | 0.5 ngày |
| **Tổng** | | **~6 ngày làm việc** (registry rẻ hơn clone từ game thứ 4 trở đi) |

Buffer 30% → khoảng 1.5-2 tuần calendar nếu làm part-time.

## 9. Blockers / preconditions

- ✅ Phải xong cuộc thi hiện tại trước (contract đang ship cho contest).
- ✅ Player payout mùa cuối phải settle xong (recon = clean).
- ⚠️ Cần confirm contest rule có cho phép contract mới deploy ngay không, hay phải đợi gap period.
- ⚠️ Marketing/announcement plan để player hiểu v2 → v3 (top-10 reset).

## 11. Single Multi-Game Registry Contract (phương án D2 thay thế — cho scale tới 100 game)

**Status trong spec:** Đề xuất kiến trúc. Áp dụng nếu roadmap muốn thêm game không giới hạn mà KHÔNG deploy contract mới mỗi lần. Nếu chỉ giữ 3-4 game cố định, "3 contract riêng" (D2 default) vẫn ổn — đừng over-engineer.

### 11.1 Vấn đề cần giải

Mô hình hiện tại + §4: mỗi game = một file `.clar` ~303 dòng gần như byte-identical (chỉ khác tên, phí, base-uri). Thêm game thứ N = copy contract + audit lại + deploy + tốn phí deploy. Với 100 game, điều này không scale.

**Insight cốt lõi:** đọc `snake-score.clar`, logic contract KHÔNG có gì riêng của Snake. Nó chỉ: lưu score + tên, mint NFT, giữ top-10, cộng pool, đếm season. "Snake" chỉ nằm ở tên biến + phí + thresholds rarity. Score lại là client-trusted (contract không verify luật chơi). → Một contract generic là vừa khít cho mọi game.

### 11.2 Vì sao "factory deploy contract con" bị loại

Clarity **không có dynamic deployment** (không CREATE2-equivalent). Mọi contract phải do một giao dịch mang mã nguồn deploy. "Factory" trong Clarity vẫn = tự viết + deploy từng contract → không giải quyết được gì. Loại bỏ.

### 11.3 Ràng buộc SIP-009 và cách vượt

SIP-009 + `define-non-fungible-token` là **static**: không khai báo động 100 loại NFT. Nhưng KHÔNG cần. Dùng **một** NFT asset duy nhất cho toàn platform; `game-id` chỉ là một field trong data + khóa trong map. Token-id chạy chung toàn cục; "game nào" là metadata.

Hệ quả: trên marketplace, 100 game = **một collection** "XP Arcade Score", phân biệt bằng attribute `game` trong metadata. `transfer` / `get-owner` / `get-token-uri` thao tác trên một asset type → tương thích SIP-009 đầy đủ.

### 11.4 Data model

```clarity
;; xp-arcade-v3.clar — MỘT contract cho mọi game

;; MỘT NFT asset cho tất cả game; token-id toàn cục
(define-non-fungible-token xp-score uint)
(define-data-var last-token-id uint u0)

(define-data-var contract-owner principal tx-sender)
(define-data-var base-uri (string-ascii 80) "https://<domain>/api/metadata/score/")

;; Bảng đăng ký game — thêm game = map-set, KHÔNG deploy.
;; Thresholds rarity vào đây luôn (giải quyết D11 một cách data-driven:
;; với 100 game không thể hardcode 100 compute-rarity).
(define-map games uint {
  name: (string-ascii 24),
  fee: uint,
  active: bool,
  rare-min: uint,
  epic-min: uint,
  legend-min: uint
})

;; Mọi state cũ giờ khóa theo game-id
(define-map current-season     uint uint)   ;; game-id -> season
(define-map season-end-block   uint uint)   ;; game-id -> block (D6)
(define-map season-accumulated uint uint)   ;; game-id -> pool (D4 dust roll trong cùng key)
(define-map top-ten uint (list 10 { player: principal, score: uint }))  ;; game-id -> list

(define-map best-score
  { player: principal, game-id: uint }
  { score: uint, token-id: uint, season: uint })

(define-map player-season-mints
  { player: principal, game-id: uint, season: uint } uint)

(define-map season-prize
  { game-id: uint, season: uint }
  { total: uint, top-ten: (list 10 { player: principal, score: uint }) })

(define-map prize-claimed
  { player: principal, game-id: uint, season: uint } bool)

;; score-data có thêm game-id để metadata API tra ngược ra game
(define-map score-data uint {
  game-id: uint, player: principal, score: uint,
  player-name: (string-ascii 24), block: uint, season: uint, rarity: (string-ascii 10)
})
```

### 11.5 Hàm chính

```clarity
;; Thêm game thứ 5..100 = MỘT lệnh gọi, owner-only, không deploy
(define-public (register-game
    (game-id uint) (name (string-ascii 24)) (fee uint)
    (rare-min uint) (epic-min uint) (legend-min uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-OWNER)
    (asserts! (is-none (map-get? games game-id)) ERR-GAME-EXISTS)
    (asserts! (> fee u0) ERR-BAD-FEE)
    (map-set games game-id
      { name: name, fee: fee, active: true,
        rare-min: rare-min, epic-min: epic-min, legend-min: legend-min })
    (map-set current-season game-id u1)
    (ok true)))

;; rarity generic, đọc thresholds của game (thay 3 compute-rarity hardcode của D11)
(define-private (compute-rarity (game-id uint) (score uint))
  (let ((g (unwrap-panic (map-get? games game-id))))
    (if (>= score (get legend-min g)) "Legendary"
      (if (>= score (get epic-min g)) "Epic"
        (if (>= score (get rare-min g)) "Rare" "Common")))))

(define-public (mint-score (game-id uint) (score uint) (name (string-ascii 24)))
  (let ((g (unwrap! (map-get? games game-id) ERR-NO-GAME))
        (season (unwrap! (map-get? current-season game-id) ERR-NO-GAME))
        (new-id (+ (var-get last-token-id) u1)))
    (asserts! (get active g) ERR-GAME-INACTIVE)
    ;; ... mint-cap check theo {player, game-id, season} ...
    (try! (stx-transfer? (get fee g) tx-sender (as-contract tx-sender)))   ;; v3: pool TRONG contract
    (map-set season-accumulated game-id
      (+ (default-to u0 (map-get? season-accumulated game-id)) (get fee g)))
    (try! (nft-mint? xp-score new-id tx-sender))
    ;; ... map-set score-data (kèm game-id), best-score, top-ten theo game-id ...
    (ok new-id)))

(define-public (end-season (game-id uint))      ;; owner HOẶC anyone sau season-end-block (D6), per game
  ;; snapshot top-ten + accumulated -> season-prize {game-id, season}; dust roll-over (D4)
  ...)

(define-public (claim-prize (game-id uint) (season uint))   ;; player-pull, atomic (D3)
  ;; tính payout từ snapshot {game-id, season}
  ;; (as-contract (stx-transfer? payout tx-sender player)) — revert nếu pool cạn (D5)
  ...)

;; SIP-009: một asset, fix get-token-uri concat id (token-id giờ là toàn cục)
(define-read-only (get-token-uri (id uint))
  (ok (some (concat (var-get base-uri) (uint-to-ascii id)))))
(define-read-only (get-owner-of (id uint)) (ok (nft-get-owner? xp-score id)))
```

### 11.6 Cách compose với các quyết định v3 khác

Tất cả tính năng trustless của v3 **vẫn áp dụng, chỉ thêm khóa game-id**:

- **D3 player-pull / `as-contract` pool** — pool giữ trong contract, khóa theo `game-id`. Một contract giữ tiền cho cả 100 game; mỗi game pool độc lập qua `season-accumulated[game-id]`.
- **D4 dust roll-over** — roll trong chính `season-accumulated[game-id]`, không lẫn sang game khác.
- **D5 cap-by-pool** — kiểm tra theo pool của game đó.
- **D6 permissionless end-season** — `season-end-block[game-id]`, anyone gọi `end-season(game-id)` sau block đó.
- **D7 bỏ trophy** — giữ nguyên, càng gọn.
- **D11 rarity per-game** — chuyển từ "3 hàm hardcode" sang **thresholds lưu trong `games` map**. Đây là synergy rõ nhất: với 100 game KHÔNG thể hardcode, nên data-driven là bắt buộc — và nó cũng làm D11 sạch hơn cho cả phương án 3-contract.

### 11.7 Đánh đổi (so với D2 default "3 contract riêng")

| Tiêu chí | Single registry (§11) | 3 contract riêng (D2) |
|----------|----------------------|----------------------|
| Thêm game mới | 1 contract call `register-game` | Deploy contract mới + audit + phí |
| Blast radius | 1 bug ảnh hưởng mọi game | Cô lập từng game |
| Marketplace | 1 collection chung, phân biệt bằng attribute | Mỗi game 1 collection riêng |
| Pool/season | Khóa theo game-id (bắt buộc, đã xử lý §11.4) | Tách tự nhiên theo contract |
| Audit | 1 lần, nhưng kỹ hơn (giữ tiền cho mọi game) | N lần, mỗi lần đơn giản hơn |
| Phù hợp khi | Nhiều game / game thêm động | Số game cố định, ít |

Khuyến nghị: **>~5 game hoặc có ý định thêm game động → chọn §11.** ≤4 game cố định → D2 default vẫn hợp lý.

### 11.8 Ảnh hưởng frontend

- `frontend/lib/game-registry.ts`: `GameDef` thêm `onchainId: number` (uint on-chain) bên cạnh string `id`. `contractName` trở thành **dùng chung một giá trị** (`xp-arcade-v3`) cho mọi game thay vì mỗi game một tên.
- `contract-calls.ts`: các hàm `*ForGame(gameId)` đã nhận `gameId` rồi → chỉ cần map `gameId -> onchainId` và truyền vào tham số `game-id` của contract call. Lớp legacy snake-only nên xoá luôn dịp này.
- `/api/metadata/score/[id]`: route đọc `score-data[id].game-id` để biết game → render đúng SVG/attribute. `get-token-uri` giờ concat id nên marketplace fetch đúng.
- Migration string-id ("snake") <-> uint on-chain id: giữ map tĩnh trong `game-registry.ts` (snake=u1, tetris=u2, ...).

### 11.9 Bổ sung test surface (thêm vào §5)

- `register-game` — owner-only, reject trùng game-id, reject fee=0; non-owner revert.
- mint cho game chưa đăng ký → revert `ERR-NO-GAME`.
- pool isolation — mint Snake KHÔNG làm tăng `season-accumulated[tetris]`.
- claim-prize game A không rút được pool game B.
- `compute-rarity` đọc đúng thresholds theo từng game (Snake u300 = Legendary, Tetris u300 = Epic).
- token-id toàn cục liên tục qua nhiều game (mint Snake rồi Tetris → id tăng đơn điệu).
- end-season(game-id) chỉ snapshot game đó, không đụng game khác.

### 11.10 Tác động timeline (so với §8)

Phase 3 ("Port sang Tetris + Pac-Man = clone") **biến mất** — không clone nữa. Thay bằng ~0.5 ngày viết `register-game` + test isolation. Net: rẻ hơn khi số game tăng; với đúng 3 game thì xấp xỉ hòa vốn so với clone. ROI dương rõ rệt từ game thứ 4 trở đi.

## 12. References

- v2 design spec: `docs/superpowers/specs/2026-05-14-snake-score-nft-v2-design.md`
- Current contract: `contract/contracts/snake-score.clar`
- Current frontend admin flow: `frontend/components/windows/SeasonAdminWindow.tsx`
- Session 2026-05-22 commits (P0/P1 polish that will partially retire post-v3):
  - `f7d0fd9` tie-breaking fix
  - `4e066cc` remove unused claimPrize
  - `89c77f9`, `88e8830` pool balance precheck
  - `8ea1878`, `fd0ec9a`, `a6d2e51` reconciliation + CSV
  - `1571cab` batch Pay all unsent
