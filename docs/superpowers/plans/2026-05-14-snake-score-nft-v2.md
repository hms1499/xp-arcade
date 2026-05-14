# Snake Score NFT v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `snake-score.clar` and the Next.js frontend with score cap, 0.01 STX mint fee, per-season prize pool (claim-based), rarity tiers, and SIP-009 `impl-trait`.

**Architecture:** One contract file (`snake-score.clar`) gains score cap enforcement, fee accumulation via `season-accumulated`, and a new `claim-prize` flow. A local `nft-trait.clar` enables `impl-trait` in simnet. Frontend gets new contract-calls, rarity-coloured SVGs, and UI for mint fee and prize claiming.

**Tech Stack:** Clarity 4, Clarinet 3.14, `@hirosystems/clarinet-sdk` ^3.9, Vitest 3, Next.js 16 App Router, `@stacks/connect` ^8.2, `@stacks/transactions` ^7.4.

---

## File Map

| Action | Path |
|--------|------|
| Create | `contract/contracts/nft-trait.clar` |
| Modify | `contract/Clarinet.toml` |
| Modify | `contract/contracts/snake-score.clar` |
| Modify | `contract/tests/snake-score.test.ts` |
| Modify | `frontend/lib/contract-calls.ts` |
| Modify | `frontend/lib/metadata-svg.ts` |
| Modify | `frontend/app/api/metadata/score/[id]/route.ts` |
| Modify | `frontend/components/dialogs/MintDialog.tsx` |
| Modify | `frontend/components/windows/LeaderboardWindow.tsx` |
| Modify | `frontend/components/windows/MyNftsWindow.tsx` |

---

## Task 1: SIP-009 trait file + Clarinet registration

**Files:**
- Create: `contract/contracts/nft-trait.clar`
- Modify: `contract/Clarinet.toml`

- [ ] **Step 1: Create trait file**

```clarity
;; contract/contracts/nft-trait.clar
(define-trait nft-trait
  (
    (get-last-token-id () (response uint uint))
    (get-token-uri (uint) (response (optional (string-ascii 256)) uint))
    (get-owner (uint) (response (optional principal) uint))
    (transfer (uint principal principal) (response bool uint))
  )
)
```

- [ ] **Step 2: Register in Clarinet.toml**

Open `contract/Clarinet.toml`. Add before the existing `[contracts.snake-score]` block:

```toml
[contracts.nft-trait]
path = "contracts/nft-trait.clar"
clarity_version = 4
epoch = "3.0"
```

- [ ] **Step 3: Verify syntax**

```bash
cd contract && clarinet check
```

Expected: `✔ 2 contracts checked`

- [ ] **Step 4: Commit**

```bash
git add contract/contracts/nft-trait.clar contract/Clarinet.toml
git commit -m "feat(contract): add local SIP-009 nft-trait for impl-trait"
```

---

## Task 2: Error constants + impl-trait + score cap (TDD)

**Files:**
- Modify: `contract/contracts/snake-score.clar`
- Modify: `contract/tests/snake-score.test.ts`

- [ ] **Step 1: Add failing test for score cap**

In `contract/tests/snake-score.test.ts`, add after the last `describe` block:

```ts
describe("score-cap", () => {
  it("rejects mint-score when score > 9999", () => {
    const r = simnet.callPublicFn(
      "snake-score",
      "mint-score",
      [Cl.uint(10000), Cl.stringAscii("hacker")],
      wallet1
    );
    expect(r.result).toBeErr(Cl.uint(104));
  });

  it("allows mint-score at exactly 9999", () => {
    const r = simnet.callPublicFn(
      "snake-score",
      "mint-score",
      [Cl.uint(9999), Cl.stringAscii("alice")],
      wallet1
    );
    expect(r.result).toBeOk(Cl.uint(1));
  });
});
```

- [ ] **Step 2: Run tests — expect new tests to fail**

```bash
cd contract && npm test 2>&1 | tail -20
```

Expected: 2 new tests failing with "mint-score" / function mismatch.

- [ ] **Step 3: Update contract — add impl-trait, errors, score cap**

Replace the top of `contract/contracts/snake-score.clar` (lines 1–5) with:

```clarity
;; title: snake-score
;; summary: XP Snake on Stacks - score + trophy NFTs v2

(impl-trait .nft-trait.nft-trait)

(define-non-fungible-token snake-score uint)
(define-data-var last-token-id uint u0)
(define-data-var current-season uint u1)
(define-data-var season-accumulated uint u0)
```

Replace the `--- Errors ---` section (currently near line 101):

```clarity
;; --- Errors ---
(define-constant ERR-NOT-IN-TOP-TEN (err u101))
(define-constant ERR-ALREADY-CLAIMED (err u102))
(define-constant ERR-NOT-OWNER (err u103))
(define-constant ERR-SCORE-TOO-HIGH (err u104))
(define-constant ERR-SEASON-NOT-CLOSED (err u105))
(define-constant ERR-EMPTY-POOL (err u106))
(define-constant ERR-PRIZE-NOT-FOUND (err u107))
```

In `mint-score`, add as the very first line inside `let` body (before `nft-mint?`):

```clarity
    (asserts! (<= score u9999) ERR-SCORE-TOO-HIGH)
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd contract && npm test 2>&1 | tail -20
```

Expected: `16 tests passed` (14 original + 2 new).

- [ ] **Step 5: Commit**

```bash
git add contract/contracts/snake-score.clar contract/tests/snake-score.test.ts
git commit -m "feat(contract): impl-trait SIP-009, score cap u9999, error constants"
```

---

## Task 3: Rarity tiers (TDD)

**Files:**
- Modify: `contract/contracts/snake-score.clar`
- Modify: `contract/tests/snake-score.test.ts`

- [ ] **Step 1: Add failing rarity tests**

Add to `contract/tests/snake-score.test.ts`:

```ts
describe("rarity", () => {
  it("score 0 → Common", () => {
    simnet.callPublicFn("snake-score", "mint-score", [Cl.uint(0), Cl.stringAscii("a")], w(1));
    const d = simnet.callReadOnlyFn("snake-score", "get-score-data", [Cl.uint(1)], w(1)).result;
    expect(d).toBeSome(expect.objectContaining({
      value: expect.objectContaining({ rarity: Cl.stringAscii("Common") })
    }));
  });

  it("score 166 → Common", () => {
    simnet.callPublicFn("snake-score", "mint-score", [Cl.uint(166), Cl.stringAscii("a")], w(1));
    const d = simnet.callReadOnlyFn("snake-score", "get-score-data", [Cl.uint(1)], w(1)).result;
    expect(d).toBeSome(expect.objectContaining({
      value: expect.objectContaining({ rarity: Cl.stringAscii("Common") })
    }));
  });

  it("score 167 → Rare", () => {
    simnet.callPublicFn("snake-score", "mint-score", [Cl.uint(167), Cl.stringAscii("a")], w(1));
    const d = simnet.callReadOnlyFn("snake-score", "get-score-data", [Cl.uint(1)], w(1)).result;
    expect(d).toBeSome(expect.objectContaining({
      value: expect.objectContaining({ rarity: Cl.stringAscii("Rare") })
    }));
  });

  it("score 500 → Epic", () => {
    simnet.callPublicFn("snake-score", "mint-score", [Cl.uint(500), Cl.stringAscii("a")], w(1));
    const d = simnet.callReadOnlyFn("snake-score", "get-score-data", [Cl.uint(1)], w(1)).result;
    expect(d).toBeSome(expect.objectContaining({
      value: expect.objectContaining({ rarity: Cl.stringAscii("Epic") })
    }));
  });

  it("score 1000 → Legendary", () => {
    simnet.callPublicFn("snake-score", "mint-score", [Cl.uint(1000), Cl.stringAscii("a")], w(1));
    const d = simnet.callReadOnlyFn("snake-score", "get-score-data", [Cl.uint(1)], w(1)).result;
    expect(d).toBeSome(expect.objectContaining({
      value: expect.objectContaining({ rarity: Cl.stringAscii("Legendary") })
    }));
  });
});
```

- [ ] **Step 2: Run tests — new tests fail**

```bash
cd contract && npm test 2>&1 | tail -20
```

Expected: 5 new tests failing (rarity field missing from tuple).

- [ ] **Step 3: Update contract — add score-data rarity field + compute-rarity helper**

Replace the `score-data` map definition:

```clarity
(define-map score-data uint {
  player: principal,
  score: uint,
  player-name: (string-ascii 24),
  block: uint,
  season: uint,
  rarity: (string-ascii 10)
})
```

Add `compute-rarity` private helper after `skip-first-min` (before `try-insert-top-ten`):

```clarity
(define-private (compute-rarity (score uint))
  (if (>= score u1000)
      "Legendary"
      (if (>= score u500)
          "Epic"
          (if (>= score u167)
              "Rare"
              "Common"))))
```

In `mint-score`, update the `map-set score-data` call to include rarity:

```clarity
    (map-set score-data new-id {
      player: tx-sender,
      score: score,
      player-name: player-name,
      block: stacks-block-height,
      season: (var-get current-season),
      rarity: (compute-rarity score)
    })
```

- [ ] **Step 4: Update existing test that checks score-data tuple shape**

In `contract/tests/snake-score.test.ts`, find the `mint-score` describe block test that does `toBeSome(Cl.tuple({...}))`. Replace the assertion to use `objectContaining` instead of strict tuple match:

```ts
  it("mints an NFT with correct score data to caller", () => {
    const { result } = simnet.callPublicFn(
      "snake-score",
      "mint-score",
      [Cl.uint(42), Cl.stringAscii("alice")],
      wallet1
    );
    expect(result).toBeOk(Cl.uint(1));

    const owner = simnet.callReadOnlyFn(
      "snake-score",
      "get-owner",
      [Cl.uint(1)],
      wallet1
    ).result;
    expect(owner).toBeOk(Cl.some(Cl.principal(wallet1)));

    const data = simnet.callReadOnlyFn(
      "snake-score",
      "get-score-data",
      [Cl.uint(1)],
      wallet1
    ).result;
    expect(data).toBeSome(
      Cl.tuple({
        player: Cl.principal(wallet1),
        score: Cl.uint(42),
        "player-name": Cl.stringAscii("alice"),
        block: Cl.uint(simnet.blockHeight),
        season: Cl.uint(1),
        rarity: Cl.stringAscii("Common"),
      })
    );
  });
```

- [ ] **Step 5: Run all tests — all pass**

```bash
cd contract && npm test 2>&1 | tail -20
```

Expected: `21 tests passed`.

- [ ] **Step 6: Commit**

```bash
git add contract/contracts/snake-score.clar contract/tests/snake-score.test.ts
git commit -m "feat(contract): rarity tiers — Common/Rare/Epic/Legendary stored at mint"
```

---

## Task 4: Mint fee + season accumulator (TDD)

**Files:**
- Modify: `contract/contracts/snake-score.clar`
- Modify: `contract/tests/snake-score.test.ts`

- [ ] **Step 1: Add failing mint-fee tests**

Add to `contract/tests/snake-score.test.ts`:

```ts
describe("mint-fee", () => {
  it("deducts 10000 µSTX from caller on mint", () => {
    const before = simnet.getAssetsMap().get("STX")?.get(wallet1) ?? 0n;
    simnet.callPublicFn("snake-score", "mint-score", [Cl.uint(42), Cl.stringAscii("a")], wallet1);
    const after = simnet.getAssetsMap().get("STX")?.get(wallet1) ?? 0n;
    // deducted: 10000 µSTX fee + tx fee (tx fee varies; just verify at least 10000 deducted)
    expect(before - after).toBeGreaterThanOrEqual(10000n);
  });

  it("season-accumulated increases by 10000 per mint", () => {
    simnet.callPublicFn("snake-score", "mint-score", [Cl.uint(10), Cl.stringAscii("a")], w(1));
    simnet.callPublicFn("snake-score", "mint-score", [Cl.uint(20), Cl.stringAscii("b")], w(2));
    const bal = simnet.callReadOnlyFn("snake-score", "get-prize-pool-balance", [], w(1)).result;
    expect(bal).toBeUint(20000);
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd contract && npm test 2>&1 | tail -20
```

Expected: 2 new tests failing (`get-prize-pool-balance` undefined, STX not deducted).

- [ ] **Step 3: Update contract — add stx-transfer + accumulator update in mint-score**

The `season-accumulated` var is already declared in Task 2. Now update `mint-score` to add after the `asserts!` score cap line:

```clarity
    (try! (stx-transfer? u10000 tx-sender (as-contract tx-sender)))
    (var-set season-accumulated (+ (var-get season-accumulated) u10000))
```

Add `get-prize-pool-balance` read-only function (add alongside other read-only functions):

```clarity
(define-read-only (get-prize-pool-balance)
  (var-get season-accumulated))
```

- [ ] **Step 4: Run tests — all pass**

```bash
cd contract && npm test 2>&1 | tail -20
```

Expected: `23 tests passed`.

- [ ] **Step 5: Commit**

```bash
git add contract/contracts/snake-score.clar contract/tests/snake-score.test.ts
git commit -m "feat(contract): 0.01 STX mint fee, season-accumulated prize pool tracker"
```

---

## Task 5: `end-season` + prize pool snapshot (TDD)

**Files:**
- Modify: `contract/contracts/snake-score.clar`
- Modify: `contract/tests/snake-score.test.ts`

- [ ] **Step 1: Add failing end-season tests**

Add to `contract/tests/snake-score.test.ts`:

```ts
describe("end-season", () => {
  it("snapshots pool + top-ten, clears top-ten, increments season", () => {
    simnet.callPublicFn("snake-score", "mint-score", [Cl.uint(50), Cl.stringAscii("a")], w(1));
    simnet.callPublicFn("snake-score", "mint-score", [Cl.uint(80), Cl.stringAscii("b")], w(2));

    const r = simnet.callPublicFn("snake-score", "end-season", [], deployer);
    expect(r.result).toBeOk(Cl.bool(true));

    // top-ten cleared
    const top = simnet.callReadOnlyFn("snake-score", "get-top-ten", [], w(1)).result;
    expect((top as any).value.length).toBe(0);

    // season incremented
    const season = simnet.callReadOnlyFn("snake-score", "get-current-season", [], w(1)).result;
    expect(season).toBeUint(2);

    // accumulator reset
    const bal = simnet.callReadOnlyFn("snake-score", "get-prize-pool-balance", [], w(1)).result;
    expect(bal).toBeUint(0);

    // snapshot stored: total = 20000 (2 mints × 10000)
    const prize = simnet.callReadOnlyFn("snake-score", "get-season-prize", [Cl.uint(1)], w(1)).result;
    const v = (prize as any).value;
    expect(Number(v.total.value)).toBe(20000);
    expect(v["top-ten"].value.length).toBe(2);
  });

  it("non-owner calling end-season fails with ERR-NOT-OWNER", () => {
    const r = simnet.callPublicFn("snake-score", "end-season", [], w(1));
    expect(r.result).toBeErr(Cl.uint(103));
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd contract && npm test 2>&1 | tail -20
```

Expected: 2 new tests fail (`end-season` and `get-season-prize` undefined).

- [ ] **Step 3: Update contract — add season-prize map + get-season-prize + end-season**

Add maps after `best-score` map:

```clarity
(define-map season-prize uint {
  total: uint,
  top-ten: (list 10 { player: principal, score: uint })
})

(define-map prize-claimed { player: principal, season: uint } bool)
```

Add `get-season-prize` read-only alongside others:

```clarity
(define-read-only (get-season-prize (season uint))
  (map-get? season-prize season))
```

Add `end-season` public function (replace the old `reset-season` function entirely):

```clarity
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
```

- [ ] **Step 4: Update reset-season tests to use end-season**

In `contract/tests/snake-score.test.ts`, find `describe("reset-season", ...)` and replace it:

```ts
describe("end-season", () => {
  it("admin clears top-ten and increments season", () => {
    simnet.callPublicFn("snake-score", "mint-score", [Cl.uint(50), Cl.stringAscii("a")], w(1));
    const r = simnet.callPublicFn("snake-score", "end-season", [], deployer);
    expect(r.result).toBeOk(Cl.bool(true));

    const top = simnet.callReadOnlyFn("snake-score", "get-top-ten", [], w(1)).result;
    expect((top as any).value.length).toBe(0);

    const season = simnet.callReadOnlyFn("snake-score", "get-current-season", [], w(1)).result;
    expect(season).toBeUint(2);
  });

  it("non-admin caller fails with ERR-NOT-OWNER", () => {
    const r = simnet.callPublicFn("snake-score", "end-season", [], w(1));
    expect(r.result).toBeErr(Cl.uint(103));
  });

  it("snapshots pool + top-ten, clears accumulator", () => {
    simnet.callPublicFn("snake-score", "mint-score", [Cl.uint(50), Cl.stringAscii("a")], w(1));
    simnet.callPublicFn("snake-score", "mint-score", [Cl.uint(80), Cl.stringAscii("b")], w(2));
    simnet.callPublicFn("snake-score", "end-season", [], deployer);

    const bal = simnet.callReadOnlyFn("snake-score", "get-prize-pool-balance", [], w(1)).result;
    expect(bal).toBeUint(0);

    const prize = simnet.callReadOnlyFn("snake-score", "get-season-prize", [Cl.uint(1)], w(1)).result;
    const v = (prize as any).value;
    expect(Number(v.total.value)).toBe(20000);
    expect(v["top-ten"].value.length).toBe(2);
  });
});
```

- [ ] **Step 5: Run all tests — all pass**

```bash
cd contract && npm test 2>&1 | tail -20
```

Expected: `27 tests passed`.

- [ ] **Step 6: Commit**

```bash
git add contract/contracts/snake-score.clar contract/tests/snake-score.test.ts
git commit -m "feat(contract): end-season — snapshots prize pool + top-ten, resets accumulator"
```

---

## Task 6: `claim-prize` + helper read-only functions (TDD)

**Files:**
- Modify: `contract/contracts/snake-score.clar`
- Modify: `contract/tests/snake-score.test.ts`

- [ ] **Step 1: Add failing claim-prize tests**

Add to `contract/tests/snake-score.test.ts`:

```ts
describe("claim-prize", () => {
  function setupSeason() {
    // 3 players mint: w(1)=score 1000, w(2)=800, w(3)=500
    // fee per mint = 10000 µSTX → total = 30000 µSTX
    simnet.callPublicFn("snake-score", "mint-score", [Cl.uint(1000), Cl.stringAscii("a")], w(1));
    simnet.callPublicFn("snake-score", "mint-score", [Cl.uint(800), Cl.stringAscii("b")], w(2));
    simnet.callPublicFn("snake-score", "mint-score", [Cl.uint(500), Cl.stringAscii("c")], w(3));
    simnet.callPublicFn("snake-score", "end-season", [], deployer);
    // season is now 2, season 1 is closed with total=30000
  }

  it("rank-1 player receives 20% of pool (6000 µSTX from 30000)", () => {
    setupSeason();
    const r = simnet.callPublicFn("snake-score", "claim-prize", [Cl.uint(1)], w(1));
    expect(r.result).toBeOk(Cl.uint(6000));
  });

  it("rank-3 player (4th-10th tier) receives 40/70 of pool (~1714 µSTX)", () => {
    setupSeason();
    const r = simnet.callPublicFn("snake-score", "claim-prize", [Cl.uint(1)], w(3));
    // (30000 * 4) / 70 = 1714 (truncated)
    expect(r.result).toBeOk(Cl.uint(1714));
  });

  it("fails ERR-ALREADY-CLAIMED on second claim", () => {
    setupSeason();
    simnet.callPublicFn("snake-score", "claim-prize", [Cl.uint(1)], w(1));
    const r = simnet.callPublicFn("snake-score", "claim-prize", [Cl.uint(1)], w(1));
    expect(r.result).toBeErr(Cl.uint(102));
  });

  it("fails ERR-SEASON-NOT-CLOSED on current season", () => {
    simnet.callPublicFn("snake-score", "mint-score", [Cl.uint(100), Cl.stringAscii("a")], w(1));
    const r = simnet.callPublicFn("snake-score", "claim-prize", [Cl.uint(1)], w(1));
    expect(r.result).toBeErr(Cl.uint(105));
  });

  it("fails ERR-NOT-IN-TOP-TEN for player not in snapshot", () => {
    setupSeason();
    const r = simnet.callPublicFn("snake-score", "claim-prize", [Cl.uint(1)], w(8));
    expect(r.result).toBeErr(Cl.uint(101));
  });

  it("fails ERR-PRIZE-NOT-FOUND for non-existent season", () => {
    setupSeason();
    const r = simnet.callPublicFn("snake-score", "claim-prize", [Cl.uint(99)], w(1));
    expect(r.result).toBeErr(Cl.uint(107));
  });
});
```

- [ ] **Step 2: Run tests — expect 6 new failures**

```bash
cd contract && npm test 2>&1 | tail -20
```

Expected: 6 new tests fail (`claim-prize` undefined).

- [ ] **Step 3: Add find-caller-score private helper to contract**

Add after the existing `rank-fold` private function:

```clarity
(define-private (find-caller-score
    (e { player: principal, score: uint })
    (acc { found: bool, score: uint }))
  (if (and (not (get found acc)) (is-eq (get player e) tx-sender))
      { found: true, score: (get score e) }
      acc))
```

- [ ] **Step 4: Add claim-prize and has-claimed-prize to contract**

Add `has-claimed-prize` read-only (alongside other read-only functions):

```clarity
(define-read-only (has-claimed-prize (player principal) (season uint))
  (default-to false (map-get? prize-claimed { player: player, season: season })))
```

Add `claim-prize` public function (add after `end-season`):

```clarity
(define-public (claim-prize (season uint))
  (let
    (
      (current (var-get current-season))
      (claimed (default-to false
        (map-get? prize-claimed { player: tx-sender, season: season })))
      (prize-info (map-get? season-prize season))
    )
    (asserts! (< season current) ERR-SEASON-NOT-CLOSED)
    (asserts! (not claimed) ERR-ALREADY-CLAIMED)
    (asserts! (is-some prize-info) ERR-PRIZE-NOT-FOUND)
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
            (recipient tx-sender)
          )
          (try! (as-contract (stx-transfer? payout (as-contract tx-sender) recipient)))
          (map-set prize-claimed { player: tx-sender, season: season } true)
          (ok payout))))))
```

- [ ] **Step 5: Run all tests — expect all to pass**

```bash
cd contract && npm test 2>&1 | tail -20
```

Expected: `33 tests passed`.

- [ ] **Step 6: Commit**

```bash
git add contract/contracts/snake-score.clar contract/tests/snake-score.test.ts
git commit -m "feat(contract): claim-prize — claim-based prize pool distribution by rank"
```

---

## Task 7: `transfer-ownership` + update `get-token-uri` base-uri default

**Files:**
- Modify: `contract/contracts/snake-score.clar`

These are small fixes that complete the contract.

- [ ] **Step 1: Update base-uri default and add transfer-ownership**

In `snake-score.clar`, change the `base-uri` default (remove `{id}` placeholder):

```clarity
(define-data-var base-uri (string-ascii 80) "https://xp-snake.example/api/metadata/score/")
```

Add `transfer-ownership` public function (add after `set-base-uri`):

```clarity
(define-public (transfer-ownership (new-owner principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-OWNER)
    (var-set contract-owner new-owner)
    (ok true)))
```

- [ ] **Step 2: Update the get-token-uri test to match new default**

In `contract/tests/snake-score.test.ts`, find the `get-token-uri` test and update:

```ts
  it("get-token-uri returns score metadata URL", () => {
    const r = simnet.callReadOnlyFn("snake-score", "get-token-uri", [Cl.uint(1)], w(1)).result;
    expect(r).toBeOk(
      Cl.some(Cl.stringAscii("https://xp-snake.example/api/metadata/score/"))
    );
  });
```

- [ ] **Step 3: Run all tests**

```bash
cd contract && npm test 2>&1 | tail -20
```

Expected: `33 tests passed`.

- [ ] **Step 4: Commit**

```bash
git add contract/contracts/snake-score.clar contract/tests/snake-score.test.ts
git commit -m "feat(contract): transfer-ownership, fix base-uri default (no {id} placeholder)"
```

---

## Task 8: Frontend — `contract-calls.ts` new functions

**Files:**
- Modify: `frontend/lib/contract-calls.ts`

- [ ] **Step 1: Add new exports to contract-calls.ts**

Append to the end of `frontend/lib/contract-calls.ts`:

```ts
export async function getPrizePoolBalance(): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...base,
    functionName: "get-prize-pool-balance",
    functionArgs: [],
    senderAddress: stacks.contractAddress,
  });
  return Number(cvToValue(res));
}

export type SeasonPrize = {
  total: number;
  topTen: Array<{ player: string; score: number }>;
} | null;

export async function getSeasonPrize(season: number): Promise<SeasonPrize> {
  const res = await fetchCallReadOnlyFunction({
    ...base,
    functionName: "get-season-prize",
    functionArgs: [uintCV(season)],
    senderAddress: stacks.contractAddress,
  });
  const v = cvToValue(res) as null | {
    total: bigint;
    "top-ten": Array<{ player: string; score: bigint }>;
  };
  if (!v) return null;
  return {
    total: Number(v.total),
    topTen: v["top-ten"].map((e) => ({ player: String(e.player), score: Number(e.score) })),
  };
}

export async function hasClaimedPrize(player: string, season: number): Promise<boolean> {
  const res = await fetchCallReadOnlyFunction({
    ...base,
    functionName: "has-claimed-prize",
    functionArgs: [principalCV(player), uintCV(season)],
    senderAddress: player,
  });
  return Boolean(cvToValue(res));
}

export async function claimPrize(season: number): Promise<string> {
  return new Promise((resolve, reject) => {
    openContractCall({
      ...base,
      functionName: "claim-prize",
      functionArgs: [uintCV(season)],
      onFinish: (data) => resolve(data.txId),
      onCancel: () => reject(new Error("cancelled")),
    });
  });
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/contract-calls.ts
git commit -m "feat(frontend): contract-calls — getPrizePoolBalance, getSeasonPrize, claimPrize"
```

---

## Task 9: Frontend — rarity colours in SVG + metadata API

**Files:**
- Modify: `frontend/lib/metadata-svg.ts`
- Modify: `frontend/app/api/metadata/score/[id]/route.ts`

- [ ] **Step 1: Update metadata-svg.ts — add rarity colour helper and update scoreSvg**

In `frontend/lib/metadata-svg.ts`, add before `scoreSvg`:

```ts
export type Rarity = "Common" | "Rare" | "Epic" | "Legendary";

const RARITY_COLOR: Record<Rarity, string> = {
  Common: "#9ca3af",
  Rare: "#3b82f6",
  Epic: "#a855f7",
  Legendary: "#f59e0b",
};

export function rarityColor(r: string): string {
  return RARITY_COLOR[r as Rarity] ?? RARITY_COLOR.Common;
}
```

Update `scoreSvg` signature and body to accept and render rarity:

```ts
export function scoreSvg(o: {
  tokenId: number;
  score: number;
  playerName: string;
  rarity: string;
}) {
  const color = rarityColor(o.rarity);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
  <rect width="400" height="400" fill="#245edb"/>
  <rect x="0" y="0" width="400" height="32" fill="#3a78d8"/>
  <rect x="0" y="0" width="400" height="4" fill="${color}"/>
  <text x="12" y="22" font-family="Tahoma, sans-serif" font-size="14" fill="white">Snake Score #${o.tokenId}</text>
  <text x="200" y="220" font-family="Tahoma, sans-serif" font-weight="bold" font-size="140" fill="white" text-anchor="middle">${o.score}</text>
  <text x="200" y="280" font-family="Tahoma, sans-serif" font-size="22" fill="white" text-anchor="middle">${escapeXml(o.playerName)}</text>
  <text x="388" y="22" font-family="Tahoma, sans-serif" font-size="11" fill="${color}" text-anchor="end">${o.rarity}</text>
  <text x="200" y="370" font-family="Tahoma, sans-serif" font-size="14" fill="#bcd" text-anchor="middle">XP Snake on Stacks</text>
</svg>`;
}
```

- [ ] **Step 2: Update metadata API route to pass rarity**

Replace `frontend/app/api/metadata/score/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { fetchCallReadOnlyFunction, cvToValue, uintCV } from "@stacks/transactions";
import { stacks } from "@/lib/stacks";
import { scoreSvg } from "@/lib/metadata-svg";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tokenId = Number(id);
  if (!Number.isFinite(tokenId) || tokenId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  try {
    const res = await fetchCallReadOnlyFunction({
      network: stacks.network,
      contractAddress: stacks.contractAddress,
      contractName: stacks.contractName,
      functionName: "get-score-data",
      functionArgs: [uintCV(tokenId)],
      senderAddress: stacks.contractAddress,
    });
    const v = cvToValue(res) as null | {
      score: bigint;
      "player-name": string;
      rarity: string;
      season: bigint;
    };
    if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });

    const rarity = String(v.rarity ?? "Common");
    const season = Number(v.season ?? 1);
    const svg = scoreSvg({
      tokenId,
      score: Number(v.score),
      playerName: String(v["player-name"]),
      rarity,
    });
    return NextResponse.json({
      name: `Snake Score #${tokenId}`,
      description: `On-chain proof of a snake game score: ${v.score}.`,
      image: "data:image/svg+xml;utf8," + encodeURIComponent(svg),
      attributes: [
        { trait_type: "Rarity", value: rarity },
        { trait_type: "Season", value: String(season) },
        { trait_type: "Score", value: String(Number(v.score)) },
      ],
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "lookup failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Update metadata-svg Vitest tests**

In `frontend/` find the metadata-svg test file:

```bash
grep -r "scoreSvg\|metadata-svg" /Users/vanhuy/Desktop/xp-snake/frontend --include="*.test.*" -l
```

Open that file and add `rarity: "Common"` to any `scoreSvg` call. Example:

```ts
scoreSvg({ tokenId: 1, score: 42, playerName: "alice", rarity: "Common" })
```

- [ ] **Step 4: Run frontend tests**

```bash
cd frontend && npm test 2>&1 | tail -20
```

Expected: `7 tests passed` (no regressions).

- [ ] **Step 5: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/metadata-svg.ts frontend/app/api/metadata/score/[id]/route.ts
git commit -m "feat(frontend): rarity colours in score SVG, attributes in SIP-016 metadata"
```

---

## Task 10: Frontend — MintDialog mint fee display + error handling

**Files:**
- Modify: `frontend/components/dialogs/MintDialog.tsx`

- [ ] **Step 1: Update MintDialog**

In `frontend/components/dialogs/MintDialog.tsx`, replace the opening `<p>` tag in the render:

```tsx
      <p className="mb-3">
        ⚠️ <b>Game Over</b> — Score: <b>{score}</b>
        <span className="block text-xs text-gray-500 mt-1">
          Minting costs <b>0.01 STX</b> and records your score on-chain forever.
        </span>
      </p>
```

After the `setError` call in `handleMint` catch block, add score-too-high detection. Replace the catch block:

```ts
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Mint failed";
      if (msg.includes("104") || msg.toLowerCase().includes("score-too-high")) {
        setError("Score rejected by contract (too high). Please play a normal game.");
      } else {
        setError(msg);
      }
    } finally {
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/dialogs/MintDialog.tsx
git commit -m "feat(frontend): MintDialog shows 0.01 STX fee, handles score-cap error"
```

---

## Task 11: Frontend — LeaderboardWindow prize pool + Claim Prize

**Files:**
- Modify: `frontend/components/windows/LeaderboardWindow.tsx`

- [ ] **Step 1: Update LeaderboardWindow**

Replace `frontend/components/windows/LeaderboardWindow.tsx` with:

```tsx
"use client";
import { useEffect, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { Window } from "./Window";
import {
  getTopTen,
  claimTrophy,
  claimPrize,
  getPrizePoolBalance,
  type TopEntry,
} from "@/lib/contract-calls";
import { TrophyDialog } from "@/components/dialogs/TrophyDialog";
import { useToasts } from "@/state/toasts";
import { watchTx } from "@/lib/tx-tracker";

export function LeaderboardWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "leaderboard"));
  const address = useWallet((s) => s.address);
  const [rows, setRows] = useState<TopEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimedRank, setClaimedRank] = useState<number | null>(null);
  const [busyTrophy, setBusyTrophy] = useState(false);
  const [busyPrize, setBusyPrize] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [prizePool, setPrizePool] = useState<number | null>(null);

  useEffect(() => {
    if (!w) return;

    function load() {
      getTopTen()
        .then((data) => {
          const sorted = [...data].sort((a, b) => b.score - a.score);
          setRows(sorted);
          setError(null);
          setLastUpdated(new Date());
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));

      getPrizePoolBalance()
        .then(setPrizePool)
        .catch(() => {});
    }

    setRows(null);
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [w]);

  if (!w) return null;

  const myRank = address && rows
    ? rows.findIndex((r) => r.player === address) + 1
    : 0;

  async function handleClaimTrophy() {
    setBusyTrophy(true);
    try {
      const txId = await claimTrophy();
      setClaimedRank(myRank);
      useToasts.getState().push({ title: "Trophy submitted", body: "Watching for confirmation…" });
      watchTx(txId, (s) => {
        if (s === "success") {
          useToasts.getState().push({ title: "Trophy confirmed!", body: `Rank #${myRank} trophy is on-chain.` });
        } else if (s !== "pending") {
          useToasts.getState().push({ title: "Trophy tx failed", body: "Transaction rejected on-chain." });
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setBusyTrophy(false);
    }
  }

  async function handleClaimPrize() {
    const season = 1; // TODO: derive from contract once multi-season UI is built
    setBusyPrize(true);
    try {
      const txId = await claimPrize(season);
      useToasts.getState().push({ title: "Prize claim submitted", body: "Watching for confirmation…" });
      watchTx(txId, (s) => {
        if (s === "success") {
          useToasts.getState().push({ title: "Prize claimed!", body: "STX sent to your wallet." });
          setPrizePool(null);
        } else if (s !== "pending") {
          useToasts.getState().push({ title: "Claim failed", body: "Transaction rejected on-chain." });
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim prize failed");
    } finally {
      setBusyPrize(false);
    }
  }

  const poolDisplay = prizePool != null
    ? `${(prizePool / 1_000_000).toFixed(4)} STX`
    : "…";

  return (
    <>
      <Window id={w.id} title="High Scores" width={420}>
        <div className="p-2">
          {error && <p className="text-red-600 text-xs mb-2">⚠️ {error}</p>}
          <div className="flex justify-between items-center mb-2 text-xs">
            <span>🏆 Prize Pool: <b>{poolDisplay}</b></span>
            {myRank > 0 && myRank <= 10 && (
              <button
                onClick={handleClaimPrize}
                disabled={busyPrize}
                className="text-xs"
              >
                {busyPrize ? "Claiming…" : "Claim Prize"}
              </button>
            )}
          </div>
          <table className="w-full text-xs interactive">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && !error && (
                <tr><td colSpan={3}>Loading…</td></tr>
              )}
              {rows?.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-gray-500">
                    No scores yet. Be the first!
                  </td>
                </tr>
              )}
              {rows?.map((r, i) => (
                <tr
                  key={r.player}
                  style={r.player === address ? { fontWeight: "bold" } : undefined}
                >
                  <td>{i + 1}</td>
                  <td>{r.player.slice(0, 6)}…{r.player.slice(-4)}</td>
                  <td>{r.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {lastUpdated && (
            <p className="text-[9px] text-gray-400 mt-1 text-right">
              Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · auto-refresh 30s
            </p>
          )}
          {myRank > 0 && (
            <div className="mt-3 text-center">
              <button onClick={handleClaimTrophy} disabled={busyTrophy}>
                {busyTrophy ? "Claiming…" : `Claim Trophy (Rank #${myRank})`}
              </button>
            </div>
          )}
        </div>
      </Window>
      {claimedRank !== null && (
        <TrophyDialog rank={claimedRank} onClose={() => setClaimedRank(null)} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/windows/LeaderboardWindow.tsx
git commit -m "feat(frontend): leaderboard shows prize pool balance and Claim Prize button"
```

---

## Task 12: Frontend — MyNftsWindow rarity badge

**Files:**
- Modify: `frontend/components/windows/MyNftsWindow.tsx`

The `Nft` type needs a `rarity` field. NFT metadata now returns `attributes`, so we parse it.

- [ ] **Step 1: Update Nft type and fetchHoldings**

In `frontend/components/windows/MyNftsWindow.tsx`, update the `Nft` type:

```ts
type Nft = {
  type: "score" | "trophy";
  id: number;
  image: string;
  name: string;
  rarity?: string;
};
```

In `fetchHoldings`, update the map to extract rarity from attributes:

```ts
      const meta = await fetch(
        `/api/metadata/${isTrophy ? "trophy" : "score"}/${id}`
      ).then((x) => x.json());
      const rarity = !isTrophy
        ? (meta.attributes as Array<{ trait_type: string; value: string }> | undefined)
            ?.find((a) => a.trait_type === "Rarity")?.value
        : undefined;
      return {
        type: isTrophy ? "trophy" : "score",
        id,
        image: meta.image,
        name: meta.name,
        rarity,
      } as Nft;
```

- [ ] **Step 2: Render rarity badge in NFT card**

In the NFT card render, add rarity badge below the name:

```tsx
              <div
                key={`${n.type}-${n.id}`}
                className="text-center text-xs border border-gray-300 p-1"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={n.image} alt={n.name} className="w-full h-auto" />
                <div className="mt-1 truncate">{n.name}</div>
                {n.rarity && (
                  <div
                    className="text-[9px] font-bold mt-0.5"
                    style={{ color: rarityColor(n.rarity) }}
                  >
                    {n.rarity}
                  </div>
                )}
              </div>
```

- [ ] **Step 3: Import rarityColor at top of file**

Add import at top of `MyNftsWindow.tsx`:

```ts
import { rarityColor } from "@/lib/metadata-svg";
```

- [ ] **Step 4: Type-check + frontend tests**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20 && npm test 2>&1 | tail -10
```

Expected: zero type errors, `7 tests passed`.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/windows/MyNftsWindow.tsx
git commit -m "feat(frontend): MyNfts shows rarity badge with tier colour"
```

---

## Task 13: Final verification

- [ ] **Step 1: Run all contract tests**

```bash
cd contract && npm test
```

Expected: `33 tests passed, 0 failed`.

- [ ] **Step 2: Run all frontend tests**

```bash
cd frontend && npm test
```

Expected: `7 tests passed, 0 failed`.

- [ ] **Step 3: Full type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Lint**

```bash
cd frontend && npm run lint
```

Expected: no errors.

- [ ] **Step 5: Contract syntax check**

```bash
cd contract && clarinet check
```

Expected: `✔ 2 contracts checked`.

- [ ] **Step 6: Dev server smoke test**

```bash
cd frontend && npm run dev
```

Open http://localhost:3000 and verify:
- Boot screen → XP desktop loads
- MintDialog: "Minting costs 0.01 STX" label visible
- LeaderboardWindow: prize pool balance line visible
- MyNftsWindow: NFT cards render (connect wallet to test rarity badge)

---

## Notes for deployer

After contract deploy to testnet/mainnet:

1. Call `set-base-uri` with real Vercel URL immediately after deploy
2. For mainnet `impl-trait`, replace `.nft-trait.nft-trait` with the canonical mainnet SIP-009 address: `'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait`
3. The `claim-prize` season argument in LeaderboardWindow is hardcoded to `1` — a multi-season UI is future work

---

## Spec reference

`docs/superpowers/specs/2026-05-14-snake-score-nft-v2-design.md`
