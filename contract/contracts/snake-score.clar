;; title: snake-score
;; summary: XP Snake on Stacks - score + trophy NFTs v2

(impl-trait .nft-trait.nft-trait)

(define-non-fungible-token snake-score uint)
(define-data-var last-token-id uint u0)
(define-data-var current-season uint u1)
(define-data-var season-accumulated uint u0)

(define-map score-data uint {
  player: principal,
  score: uint,
  player-name: (string-ascii 24),
  block: uint,
  season: uint,
  rarity: (string-ascii 10)
})

(define-map best-score principal { score: uint, token-id: uint })

(define-map season-prize uint {
  total: uint,
  top-ten: (list 10 { player: principal, score: uint })
})

(define-map prize-claimed { player: principal, season: uint } bool)
(define-map player-season-mints { player: principal, season: uint } uint)
(define-constant MAX-MINTS-PER-SEASON u10)
(define-constant ERR-MINT-LIMIT-REACHED (err u108))

(define-data-var top-ten
  (list 10 { player: principal, score: uint })
  (list))

;; Filter out caller's existing entry (uses tx-sender from outer context)
(define-private (not-same-player (e { player: principal, score: uint }))
  (not (is-eq (get player e) tx-sender)))

;; Track min-score during removal pass via temp data vars
(define-data-var pending-min uint u0)
(define-data-var pending-removed bool false)

(define-private (min-fold
    (e { player: principal, score: uint })
    (acc { m: uint }))
  (if (< (get score e) (get m acc))
      { m: (get score e) }
      acc))

(define-private (skip-first-min (e { player: principal, score: uint }))
  (if (and (not (var-get pending-removed))
           (is-eq (get score e) (var-get pending-min)))
      (begin (var-set pending-removed true) false)
      true))

(define-private (compute-rarity (score uint))
  (if (>= score u1000)
      "Legendary"
      (if (>= score u500)
          "Epic"
          (if (>= score u167)
              "Rare"
              "Common"))))

(define-private (try-insert-top-ten (entry { player: principal, score: uint }))
  (let
    (
      (cleaned (filter not-same-player (var-get top-ten)))
      (size (len cleaned))
    )
    (if (< size u10)
        (var-set top-ten
          (unwrap-panic (as-max-len? (append cleaned entry) u10)))
        (let
          (
            (min-score (get m (fold min-fold cleaned
                                    { m: u340282366920938463463374607431768211455 })))
          )
          (if (> (get score entry) min-score)
              (begin
                (var-set pending-min min-score)
                (var-set pending-removed false)
                (var-set top-ten
                  (unwrap-panic (as-max-len?
                    (append (filter skip-first-min cleaned) entry)
                    u10))))
              false)))
    true))

(define-read-only (get-top-ten)
  (var-get top-ten))

(define-public (mint-score (score uint) (player-name (string-ascii 24)))
  (let ((new-id (+ (var-get last-token-id) u1))
        (prev (map-get? best-score tx-sender))
        (season (var-get current-season))
        (current-mints (default-to u0
          (map-get? player-season-mints
            { player: tx-sender, season: (var-get current-season) }))))
    (asserts! (<= score u9999) ERR-SCORE-TOO-HIGH)
    (asserts! (< current-mints MAX-MINTS-PER-SEASON) ERR-MINT-LIMIT-REACHED)
    (try! (stx-transfer? u10000 tx-sender (var-get contract-owner)))
    (var-set season-accumulated (+ (var-get season-accumulated) u10000))
    (try! (nft-mint? snake-score new-id tx-sender))
    (map-set score-data new-id {
      player: tx-sender,
      score: score,
      player-name: player-name,
      block: stacks-block-height,
      season: season,
      rarity: (compute-rarity score)
    })
    (var-set last-token-id new-id)
    (map-set player-season-mints
      { player: tx-sender, season: season }
      (+ current-mints u1))
    (if (or (is-none prev) (> score (get score (unwrap-panic prev))))
        (map-set best-score tx-sender { score: score, token-id: new-id })
        true)
    (try-insert-top-ten { player: tx-sender, score: score })
    (ok new-id)))

(define-read-only (get-best-score (player principal))
  (map-get? best-score player))

(define-read-only (get-owner (token-id uint))
  (ok (nft-get-owner? snake-score token-id)))

(define-read-only (get-score-data (token-id uint))
  (map-get? score-data token-id))

(define-read-only (get-last-token-id)
  (ok (var-get last-token-id)))

(define-read-only (get-prize-pool-balance)
  (var-get season-accumulated))

(define-read-only (get-season-prize (season uint))
  (map-get? season-prize season))

;; --- Errors ---
(define-constant ERR-NOT-IN-TOP-TEN (err u101))
(define-constant ERR-ALREADY-CLAIMED (err u102))
(define-constant ERR-NOT-OWNER (err u103))
(define-constant ERR-SCORE-TOO-HIGH (err u104))
(define-constant ERR-SEASON-NOT-CLOSED (err u105))
(define-constant ERR-EMPTY-POOL (err u106))
(define-constant ERR-PRIZE-NOT-FOUND (err u107))

;; --- Trophy NFT ---
(define-non-fungible-token snake-trophy uint)
(define-data-var last-trophy-id uint u0)
(define-map trophy-data uint { player: principal, rank: uint, season: uint })
(define-map trophy-claimed { player: principal, season: uint } bool)

(define-data-var contract-owner principal tx-sender)
(define-data-var base-uri (string-ascii 80) "https://xp-snake.example/api/metadata/score/")

;; Find the caller's entry in a snapshot list
(define-private (find-caller-score
    (e { player: principal, score: uint })
    (acc { found: bool, score: uint }))
  (if (and (not (get found acc)) (is-eq (get player e) tx-sender))
      { found: true, score: (get score e) }
      acc))

;; Count how many top-ten entries have score strictly greater than tx-sender's best.
(define-private (rank-fold
    (e { player: principal, score: uint })
    (acc { caller-score: uint, higher: uint, present: bool }))
  (let ((cs (get caller-score acc)))
    {
      caller-score: cs,
      higher: (if (> (get score e) cs) (+ (get higher acc) u1) (get higher acc)),
      present: (or (get present acc) (is-eq (get player e) tx-sender))
    }))

(define-read-only (get-current-season)
  (var-get current-season))

(define-read-only (get-trophy-data (trophy-id uint))
  (map-get? trophy-data trophy-id))

(define-read-only (get-trophy-owner (trophy-id uint))
  (ok (nft-get-owner? snake-trophy trophy-id)))

(define-read-only (get-last-trophy-id)
  (ok (var-get last-trophy-id)))

(define-read-only (has-claimed-prize (player principal) (season uint))
  (default-to false (map-get? prize-claimed { player: player, season: season })))

(define-read-only (has-claimed-trophy (player principal))
  (default-to false
    (map-get? trophy-claimed { player: player, season: (var-get current-season) })))

(define-public (claim-trophy)
  (let
    (
      (best (map-get? best-score tx-sender))
      (season (var-get current-season))
      (claimed (default-to false (map-get? trophy-claimed { player: tx-sender, season: season })))
    )
    (asserts! (not claimed) ERR-ALREADY-CLAIMED)
    (asserts! (is-some best) ERR-NOT-IN-TOP-TEN)
    (let
      (
        (cs (get score (unwrap-panic best)))
        (result (fold rank-fold (var-get top-ten)
                      { caller-score: cs, higher: u0, present: false }))
      )
      (asserts! (get present result) ERR-NOT-IN-TOP-TEN)
      (let ((rank (+ u1 (get higher result)))
            (new-id (+ (var-get last-trophy-id) u1)))
        (try! (nft-mint? snake-trophy new-id tx-sender))
        (map-set trophy-data new-id { player: tx-sender, rank: rank, season: season })
        (map-set trophy-claimed { player: tx-sender, season: season } true)
        (var-set last-trophy-id new-id)
        (ok new-id)))))

(define-public (end-season)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-OWNER)
    (map-set season-prize (var-get current-season) {
      total: (var-get season-accumulated),
      top-ten: (var-get top-ten)
    })
    (var-set season-accumulated u0)
    (var-set top-ten (list))
    (var-set current-season (+ (var-get current-season) u1))
    (ok true)))

(define-public (claim-prize (season uint))
  (let
    (
      (current (var-get current-season))
      (claimed (default-to false
        (map-get? prize-claimed { player: tx-sender, season: season })))
      (prize-info (map-get? season-prize season))
    )
    (asserts! (not (is-eq season current)) ERR-SEASON-NOT-CLOSED)
    (asserts! (is-some prize-info) ERR-PRIZE-NOT-FOUND)
    (asserts! (not claimed) ERR-ALREADY-CLAIMED)
    (let
      (
        (info (unwrap-panic prize-info))
        (total (get total info))
        (snapshot (get top-ten info))
      )
      (asserts! (> total u0) ERR-EMPTY-POOL)
      (let
        (
          (caller-info (fold find-caller-score snapshot { found: false, score: u0 }))
        )
        (asserts! (get found caller-info) ERR-NOT-IN-TOP-TEN)
        (let
          (
            (cs (get score caller-info))
            (rank-result (fold rank-fold snapshot
              { caller-score: cs, higher: u0, present: false }))
            (rank (+ u1 (get higher rank-result)))
            (payout (if (<= rank u3)
                        (/ (* total u20) u100)
                        (/ (* total u4) u70)))
          )
          (map-set prize-claimed { player: tx-sender, season: season } true)
          (ok payout))))))

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

(define-read-only (get-mints-remaining (player principal))
  (let ((used (default-to u0
          (map-get? player-season-mints
            { player: player, season: (var-get current-season) }))))
    (if (>= used MAX-MINTS-PER-SEASON)
        u0
        (- MAX-MINTS-PER-SEASON used))))

(define-read-only (get-top-ten-by-season (season uint))
  (if (is-eq season (var-get current-season))
      (var-get top-ten)
      (default-to (list)
        (get top-ten (map-get? season-prize season)))))

;; --- SIP-009 ---
(define-public (transfer (token-id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-OWNER)
    (nft-transfer? snake-score token-id sender recipient)))

(define-read-only (get-token-uri (token-id uint))
  (ok (some (var-get base-uri))))
