;; xp-arcade-v3 -- single multi-game registry
;; Task 0: scaffold with state, constants, and owner read-onlys.

;; --- NFT ---
(define-non-fungible-token xp-score uint)

;; --- State vars ---
(define-data-var last-token-id uint u0)
(define-data-var contract-owner principal tx-sender)
(define-data-var base-uri (string-ascii 80) "https://xparcade.example/api/metadata/score/")

;; --- Maps ---
(define-map games uint {
  name: (string-ascii 24), fee: uint, active: bool,
  rare-min: uint, epic-min: uint, legend-min: uint })

(define-map current-season     uint uint)
(define-map season-end-block   uint uint)
(define-map season-accumulated uint uint)
(define-map top-ten uint (list 10 { player: principal, score: uint }))
(define-map best-score   { player: principal, game-id: uint } { score: uint, token-id: uint, season: uint })
(define-map player-season-mints { player: principal, game-id: uint, season: uint } uint)
(define-map season-prize { game-id: uint, season: uint }
  { total: uint, top-ten: (list 10 { player: principal, score: uint }) })
(define-map season-paid    { game-id: uint, season: uint } uint)
(define-map prize-claimed  { player: principal, game-id: uint, season: uint } bool)
(define-map score-data uint {
  game-id: uint, player: principal, score: uint, player-name: (string-ascii 24),
  block: uint, season: uint, rarity: (string-ascii 10) })

;; --- Constants ---
(define-constant MAX-MINTS-PER-SEASON u10)
(define-constant MAX-SCORE u9999)
(define-constant ERR-NOT-OWNER (err u100))
(define-constant ERR-NOT-IN-TOP-TEN (err u101))
(define-constant ERR-ALREADY-CLAIMED (err u102))
(define-constant ERR-SCORE-TOO-HIGH (err u104))
(define-constant ERR-SEASON-NOT-CLOSED (err u105))
(define-constant ERR-EMPTY-POOL (err u106))
(define-constant ERR-PRIZE-NOT-FOUND (err u107))
(define-constant ERR-MINT-LIMIT-REACHED (err u108))
(define-constant ERR-GAME-EXISTS (err u109))
(define-constant ERR-NO-GAME (err u110))
(define-constant ERR-BAD-FEE (err u111))
(define-constant ERR-GAME-INACTIVE (err u112))
(define-constant ERR-SEASON-STILL-OPEN (err u113))

;; --- Read-onlys ---
(define-read-only (get-contract-owner)
  (var-get contract-owner))

(define-read-only (get-last-token-id)
  (ok (var-get last-token-id)))

(define-read-only (get-game (game-id uint))
  (map-get? games game-id))

(define-read-only (get-current-season (game-id uint))
  (default-to u0 (map-get? current-season game-id)))

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

(define-public (set-game-active (game-id uint) (active bool))
  (let ((g (unwrap! (map-get? games game-id) ERR-NO-GAME)))
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-OWNER)
    (map-set games game-id (merge g { active: active }))
    (ok true)))

;; --- mint-score core ---

(define-private (compute-rarity (game-id uint) (score uint))
  (let ((g (unwrap-panic (map-get? games game-id))))
    (if (>= score (get legend-min g)) "Legendary"
      (if (>= score (get epic-min g)) "Epic"
        (if (>= score (get rare-min g)) "Rare" "Common")))))

;; STUB - expanded in Task 5
(define-private (try-insert-top-ten (game-id uint) (entry { player: principal, score: uint }))
  (let ((current (default-to (list) (map-get? top-ten game-id))))
    (if (< (len current) u10)
      (map-set top-ten game-id (unwrap-panic (as-max-len? (append current entry) u10)))
      false)
    true))

;; STUB - expanded in Task 4 (read added there)
(define-private (bump-best-score (game-id uint) (score uint) (token-id uint) (season uint))
  (let ((prev (map-get? best-score { player: tx-sender, game-id: game-id })))
    (if (or (is-none prev) (> score (get score (unwrap-panic prev))))
      (map-set best-score { player: tx-sender, game-id: game-id }
        { score: score, token-id: token-id, season: season })
      true)
    true))

(define-read-only (get-best-score (game-id uint) (player principal))
  (map-get? best-score { player: player, game-id: game-id }))

(define-read-only (get-score-data (token-id uint))
  (map-get? score-data token-id))

(define-read-only (get-owner (token-id uint))
  (ok (nft-get-owner? xp-score token-id)))

(define-read-only (get-prize-pool-balance (game-id uint))
  (default-to u0 (map-get? season-accumulated game-id)))

(define-public (mint-score (game-id uint) (score uint) (player-name (string-ascii 24)))
  (let ((g (unwrap! (map-get? games game-id) ERR-NO-GAME))
        (season (unwrap! (map-get? current-season game-id) ERR-NO-GAME))
        (new-id (+ (var-get last-token-id) u1)))
    (asserts! (get active g) ERR-GAME-INACTIVE)
    (asserts! (<= score MAX-SCORE) ERR-SCORE-TOO-HIGH)
    (try! (stx-transfer? (get fee g) tx-sender (as-contract tx-sender)))
    (map-set season-accumulated game-id
      (+ (default-to u0 (map-get? season-accumulated game-id)) (get fee g)))
    (try! (nft-mint? xp-score new-id tx-sender))
    (map-set score-data new-id {
      game-id: game-id, player: tx-sender, score: score, player-name: player-name,
      block: stacks-block-height, season: season, rarity: (compute-rarity game-id score) })
    (var-set last-token-id new-id)
    (bump-best-score game-id score new-id season)
    (try-insert-top-ten game-id { player: tx-sender, score: score })
    (ok new-id)))
