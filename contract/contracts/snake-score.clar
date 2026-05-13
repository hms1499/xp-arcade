;; title: snake-score
;; summary: XP Snake on Stacks - score + trophy NFTs

(define-non-fungible-token snake-score uint)
(define-data-var last-token-id uint u0)
(define-data-var current-season uint u1)

(define-map score-data uint {
  player: principal,
  score: uint,
  player-name: (string-ascii 24),
  block: uint,
  season: uint
})

(define-map best-score principal { score: uint, token-id: uint })

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
        (prev (map-get? best-score tx-sender)))
    (try! (nft-mint? snake-score new-id tx-sender))
    (map-set score-data new-id {
      player: tx-sender,
      score: score,
      player-name: player-name,
      block: stacks-block-height,
      season: (var-get current-season)
    })
    (var-set last-token-id new-id)
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
