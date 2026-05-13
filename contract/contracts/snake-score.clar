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

(define-public (mint-score (score uint) (player-name (string-ascii 24)))
  (let ((new-id (+ (var-get last-token-id) u1)))
    (try! (nft-mint? snake-score new-id tx-sender))
    (map-set score-data new-id {
      player: tx-sender,
      score: score,
      player-name: player-name,
      block: stacks-block-height,
      season: (var-get current-season)
    })
    (var-set last-token-id new-id)
    (ok new-id)))

(define-read-only (get-owner (token-id uint))
  (ok (nft-get-owner? snake-score token-id)))

(define-read-only (get-score-data (token-id uint))
  (map-get? score-data token-id))

(define-read-only (get-last-token-id)
  (ok (var-get last-token-id)))
