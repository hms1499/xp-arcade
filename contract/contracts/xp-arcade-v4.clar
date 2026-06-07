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
  { total: uint,
    top-ten: (list 10 { player: principal, score: uint }),
    claim-deadline: uint })
(define-map season-paid    { game-id: uint, season: uint } uint)
(define-map season-finalized { game-id: uint, season: uint } bool)
(define-map prize-claimed  { player: principal, game-id: uint, season: uint } bool)
(define-map score-data uint {
  game-id: uint, player: principal, score: uint, player-name: (string-ascii 24),
  block: uint, season: uint, rarity: (string-ascii 10) })

;; --- Constants ---
(define-constant MAX-MINTS-PER-SEASON u10)
(define-constant MAX-SCORE u9999)
(define-constant CLAIM-WINDOW u4320) ;; ~30 days in burn blocks
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
(define-constant ERR-CLAIM-CLOSED (err u114))
(define-constant ERR-ALREADY-FINALIZED (err u115))
(define-constant ERR-NOT-FINALIZABLE (err u116))

;; --- Read-onlys ---
(define-read-only (get-contract-owner)
  (var-get contract-owner))

(define-read-only (get-last-token-id)
  (ok (var-get last-token-id)))

(define-read-only (get-game (game-id uint))
  (map-get? games game-id))

(define-read-only (get-current-season (game-id uint))
  (default-to u0 (map-get? current-season game-id)))

(define-read-only (get-season-end-block (game-id uint))
  (default-to u0 (map-get? season-end-block game-id)))

(define-public (set-season-end-block (game-id uint) (height uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-OWNER)
    (asserts! (is-some (map-get? games game-id)) ERR-NO-GAME)
    (map-set season-end-block game-id height)
    (ok true)))

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

(define-data-var pending-min uint u0)
(define-data-var pending-removed bool false)
(define-data-var filter-player principal tx-sender)

(define-private (not-filter-player (e { player: principal, score: uint }))
  (not (is-eq (get player e) (var-get filter-player))))

(define-private (min-fold (e { player: principal, score: uint }) (acc { m: uint }))
  (if (< (get score e) (get m acc)) { m: (get score e) } acc))

(define-private (skip-first-min (e { player: principal, score: uint }))
  (if (and (not (var-get pending-removed)) (is-eq (get score e) (var-get pending-min)))
    (begin (var-set pending-removed true) false)
    true))

(define-private (try-insert-top-ten (game-id uint) (entry { player: principal, score: uint }))
  (begin
    (var-set filter-player (get player entry))
    (let ((cleaned (filter not-filter-player (default-to (list) (map-get? top-ten game-id)))))
      (if (< (len cleaned) u10)
        (map-set top-ten game-id (unwrap-panic (as-max-len? (append cleaned entry) u10)))
        (let ((min-score (get m (fold min-fold cleaned
                            { m: u340282366920938463463374607431768211455 }))))
          (if (> (get score entry) min-score)
            (begin
              (var-set pending-min min-score)
              (var-set pending-removed false)
              (map-set top-ten game-id
                (unwrap-panic (as-max-len? (append (filter skip-first-min cleaned) entry) u10))))
            false))))
    true))

(define-private (bump-best-score (game-id uint) (score uint) (token-id uint) (season uint))
  (let ((prev (map-get? best-score { player: tx-sender, game-id: game-id })))
    (if (or (is-none prev) (> score (get score (unwrap-panic prev))))
      (map-set best-score { player: tx-sender, game-id: game-id }
        { score: score, token-id: token-id, season: season })
      true)
    true))

(define-read-only (get-best-score (game-id uint) (player principal))
  (map-get? best-score { player: player, game-id: game-id }))

(define-read-only (get-top-ten (game-id uint))
  (default-to (list) (map-get? top-ten game-id)))

(define-read-only (get-score-data (token-id uint))
  (map-get? score-data token-id))

(define-read-only (get-owner (token-id uint))
  (ok (nft-get-owner? xp-score token-id)))

(define-read-only (get-prize-pool-balance (game-id uint))
  (default-to u0 (map-get? season-accumulated game-id)))

(define-read-only (get-season-prize (game-id uint) (season uint))
  (map-get? season-prize { game-id: game-id, season: season }))

(define-read-only (has-claimed-prize (player principal) (game-id uint) (season uint))
  (default-to false (map-get? prize-claimed { player: player, game-id: game-id, season: season })))

(define-read-only (get-season-paid (game-id uint) (season uint))
  (default-to u0 (map-get? season-paid { game-id: game-id, season: season })))

(define-public (end-season (game-id uint))
  (let ((season (unwrap! (map-get? current-season game-id) ERR-NO-GAME))
        (deadline (default-to u0 (map-get? season-end-block game-id)))
        (is-owner (is-eq tx-sender (var-get contract-owner))))
    (asserts! (or is-owner
                  (and (> deadline u0) (>= stacks-block-height deadline)))
              ERR-SEASON-STILL-OPEN)
    (map-set season-prize { game-id: game-id, season: season }
      { total: (default-to u0 (map-get? season-accumulated game-id)),
        top-ten: (default-to (list) (map-get? top-ten game-id)),
        claim-deadline: (+ burn-block-height CLAIM-WINDOW) })
    (map-set season-accumulated game-id u0)
    (map-set top-ten game-id (list))
    (map-set current-season game-id (+ season u1))
    (ok true)))

(define-data-var rank-player principal tx-sender)

(define-private (find-caller-score
    (e { player: principal, score: uint })
    (acc { found: bool, score: uint }))
  (if (and (not (get found acc)) (is-eq (get player e) (var-get rank-player)))
    { found: true, score: (get score e) }
    acc))

(define-private (rank-fold
    (e { player: principal, score: uint })
    (acc { caller-score: uint, higher: uint }))
  { caller-score: (get caller-score acc),
    higher: (if (> (get score e) (get caller-score acc)) (+ (get higher acc) u1) (get higher acc)) })

(define-public (claim-prize (game-id uint) (season uint))
  (let ((current (unwrap! (map-get? current-season game-id) ERR-NO-GAME))
        (claimed (default-to false
          (map-get? prize-claimed { player: tx-sender, game-id: game-id, season: season })))
        (prize-info (map-get? season-prize { game-id: game-id, season: season }))
        (player tx-sender))
    (asserts! (< season current) ERR-SEASON-NOT-CLOSED)
    (asserts! (is-some prize-info) ERR-PRIZE-NOT-FOUND)
    (asserts! (not claimed) ERR-ALREADY-CLAIMED)
    (let ((total (get total (unwrap-panic prize-info)))
          (snapshot (get top-ten (unwrap-panic prize-info))))
      (asserts! (> total u0) ERR-EMPTY-POOL)
      (var-set rank-player player)
      (let ((caller (fold find-caller-score snapshot { found: false, score: u0 })))
        (asserts! (get found caller) ERR-NOT-IN-TOP-TEN)
        (let ((rank (+ u1 (get higher (fold rank-fold snapshot { caller-score: (get score caller), higher: u0 }))))
              (paid (default-to u0 (map-get? season-paid { game-id: game-id, season: season }))))
          (let ((computed (if (<= rank u3) (/ (* total u20) u100) (/ (* total u4) u70)))
                (remaining (- total paid)))
            (asserts! (> remaining u0) ERR-EMPTY-POOL)
            (let ((payout (if (> computed remaining) remaining computed)))
              (map-set prize-claimed { player: player, game-id: game-id, season: season } true)
              (map-set season-paid { game-id: game-id, season: season } (+ paid payout))
              (try! (as-contract (stx-transfer? payout tx-sender player)))
              (ok payout))))))))

(define-read-only (get-mints-remaining (game-id uint) (player principal))
  (let ((season (default-to u1 (map-get? current-season game-id)))
        (used (default-to u0
          (map-get? player-season-mints { player: player, game-id: game-id, season: (default-to u1 (map-get? current-season game-id)) }))))
    (if (>= used MAX-MINTS-PER-SEASON) u0 (- MAX-MINTS-PER-SEASON used))))

(define-public (mint-score (game-id uint) (score uint) (player-name (string-ascii 24)))
  (let ((g (unwrap! (map-get? games game-id) ERR-NO-GAME))
        (season (unwrap! (map-get? current-season game-id) ERR-NO-GAME))
        (new-id (+ (var-get last-token-id) u1))
        (current-mints (default-to u0
          (map-get? player-season-mints
            { player: tx-sender, game-id: game-id, season: (unwrap! (map-get? current-season game-id) ERR-NO-GAME) }))))
    (asserts! (get active g) ERR-GAME-INACTIVE)
    (asserts! (<= score MAX-SCORE) ERR-SCORE-TOO-HIGH)
    (asserts! (< current-mints MAX-MINTS-PER-SEASON) ERR-MINT-LIMIT-REACHED)
    (try! (stx-transfer? (get fee g) tx-sender (as-contract tx-sender)))
    (map-set season-accumulated game-id
      (+ (default-to u0 (map-get? season-accumulated game-id)) (get fee g)))
    (try! (nft-mint? xp-score new-id tx-sender))
    (map-set score-data new-id {
      game-id: game-id, player: tx-sender, score: score, player-name: player-name,
      block: stacks-block-height, season: season, rarity: (compute-rarity game-id score) })
    (var-set last-token-id new-id)
    (map-set player-season-mints { player: tx-sender, game-id: game-id, season: season }
      (+ current-mints u1))
    (bump-best-score game-id score new-id season)
    (try-insert-top-ten game-id { player: tx-sender, score: score })
    (ok new-id)))

;; --- SIP-009 surface ---
(define-read-only (get-token-uri (token-id uint))
  (ok (some (concat (var-get base-uri) (int-to-ascii token-id)))))

(define-public (transfer (token-id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-OWNER)
    (nft-transfer? xp-score token-id sender recipient)))

(define-public (set-base-uri (uri (string-ascii 80)))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-OWNER)
    (var-set base-uri uri)
    (ok true)))

(define-public (transfer-ownership (new-owner principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-OWNER)
    (var-set contract-owner new-owner)
    (ok true)))
