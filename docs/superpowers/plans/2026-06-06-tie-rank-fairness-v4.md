# Tie-Rank Fairness (`xp-arcade-v4`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `xp-arcade-v4` — a copy of v3 whose prize payout splits tied positions fairly (order-independent), enforces a burn-block claim window, and rolls unclaimed funds into the next season; then repoint the frontend.

**Architecture:** New Clarity 3 contract copied from v3. Only the prize path changes: split-occupied payout computed at claim time via a pure read-only, a `claim-deadline` (burn-block-height) snapshotted at `end-season`, and a permissionless `finalize-season` that rolls `total - paid` into the open season's pool. Frontend reads the on-chain `get-claimable-amount` and gates the claim button on `is-claim-open`.

**Tech Stack:** Clarity 3 / Clarinet 3.14 / `@hirosystems/clarinet-sdk` / Vitest 3 (contract); Next.js 16 / TypeScript / `@stacks/transactions` v7 (frontend).

Spec: `docs/superpowers/specs/2026-06-06-tie-rank-fairness-v4-design.md`.

---

## File Structure

- Create: `contract/contracts/xp-arcade-v4.clar` — the v4 contract (copy of v3 + prize changes).
- Modify: `contract/Clarinet.toml` — register `xp-arcade-v4` (clarity_version 3).
- Create: `contract/tests/xp-arcade-v4.test.ts` — copy of the v3 suite, evolved for v4 behavior.
- Modify: `frontend/lib/game-registry.ts` — point all games at `xp-arcade-v4`.
- Modify: `frontend/lib/contract-calls.ts` — add `getClaimableAmount`, `isClaimOpen`; claim post-condition uses the on-chain amount.
- Modify: `frontend/lib/claimable-prizes.ts` — respect the claim window.
- Modify: `frontend/components/windows/HighScoreWindow.tsx` — gate claim button on `is-claim-open`, handle `ERR-CLAIM-CLOSED`.
- Modify: `frontend/.env.example` — document the v4 contract name.

Commit conventions (project policy): conventional prefixes, one logical change per commit, **no `Co-Authored-By`**, stage explicit files only, every commit green.

---

## Task 1: Scaffold xp-arcade-v4 from v3 (baseline green)

**Files:**
- Create: `contract/contracts/xp-arcade-v4.clar`
- Modify: `contract/Clarinet.toml`
- Create: `contract/tests/xp-arcade-v4.test.ts`

- [ ] **Step 1: Copy the contract**

Run:
```bash
cd contract
cp contracts/xp-arcade-v3.clar contracts/xp-arcade-v4.clar
```

- [ ] **Step 2: Register v4 in Clarinet.toml**

Append to `contract/Clarinet.toml`:
```toml
[contracts.xp-arcade-v4]
path = "contracts/xp-arcade-v4.clar"
clarity_version = 3
epoch = "latest"
```

- [ ] **Step 3: Copy the test suite and repoint it at v4**

Run:
```bash
cp tests/xp-arcade-v3.test.ts tests/xp-arcade-v4.test.ts
sed -i '' 's/const C = "xp-arcade-v3"/const C = "xp-arcade-v4"/' tests/xp-arcade-v4.test.ts
```

- [ ] **Step 4: Verify everything compiles and passes**

Run: `clarinet check && npm test`
Expected: `clarinet check` exit 0; all suites pass (v3, v4 copy, snake-score). The v4 copy is byte-identical logic, so its copied tests pass.

- [ ] **Step 5: Commit**

```bash
git add contracts/xp-arcade-v4.clar Clarinet.toml tests/xp-arcade-v4.test.ts
git commit -m "feat(contract): scaffold xp-arcade-v4 as a faithful copy of v3"
```

---

## Task 2: Add constants, error codes, season-finalized map

**Files:**
- Modify: `contract/contracts/xp-arcade-v4.clar`

- [ ] **Step 1: Add the constant and error codes**

Below the existing `(define-constant MAX-SCORE u9999)` line, add:
```clarity
(define-constant CLAIM-WINDOW u4320) ;; ~30 days in burn blocks
```
Below the existing `(define-constant ERR-SEASON-STILL-OPEN (err u113))` line, add:
```clarity
(define-constant ERR-CLAIM-CLOSED (err u114))
(define-constant ERR-ALREADY-FINALIZED (err u115))
(define-constant ERR-NOT-FINALIZABLE (err u116))
```

- [ ] **Step 2: Add the season-finalized map**

Next to the other `define-map`s (after `season-paid`), add:
```clarity
(define-map season-finalized { game-id: uint, season: uint } bool)
```

- [ ] **Step 3: Verify it still compiles and passes**

Run: `clarinet check && npm test`
Expected: exit 0; all tests still pass (no behavior changed yet).

- [ ] **Step 4: Commit**

```bash
git add contracts/xp-arcade-v4.clar
git commit -m "feat(contract): add v4 claim-window constant, error codes, season-finalized map"
```

---

## Task 3: Snapshot a burn-block claim-deadline at end-season

**Files:**
- Modify: `contract/contracts/xp-arcade-v4.clar`
- Modify: `contract/tests/xp-arcade-v4.test.ts`

- [ ] **Step 1: Update the copied end-season test to expect claim-deadline**

In `tests/xp-arcade-v4.test.ts`, find the `end-season` test `"owner closes: snapshots prize, resets pool/top-ten, bumps season"`. It asserts on `get-season-prize`. Replace its prize assertions with (keep the rest of the test):
```ts
    const prize = simnet.callReadOnlyFn(C, "get-season-prize", [Cl.uint(1), Cl.uint(1)], w(1)).result;
    expect((prize as any).value.value.total.value).toBe(20000n);
    expect((prize as any).value.value["top-ten"].value.length).toBe(2);
    // v4: claim-deadline = burn-block-height at close + CLAIM-WINDOW (4320)
    expect((prize as any).value.value["claim-deadline"].value).toBe(BigInt(simnet.burnBlockHeight) + 4320n);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- -t "snapshots prize"`
Expected: FAIL — current v4 `season-prize` tuple has no `claim-deadline` field.

- [ ] **Step 3: Change the season-prize tuple shape**

In `contracts/xp-arcade-v4.clar`, find the `season-prize` map definition and replace with:
```clarity
(define-map season-prize { game-id: uint, season: uint }
  { total: uint,
    top-ten: (list 10 { player: principal, score: uint }),
    claim-deadline: uint })
```

- [ ] **Step 4: Write the deadline in end-season**

In `end-season`, replace the `(map-set season-prize ...)` call with:
```clarity
    (map-set season-prize { game-id: game-id, season: season }
      { total: (default-to u0 (map-get? season-accumulated game-id)),
        top-ten: (default-to (list) (map-get? top-ten game-id)),
        claim-deadline: (+ burn-block-height CLAIM-WINDOW) })
```

- [ ] **Step 5: Run tests to verify pass**

Run: `clarinet check && npm test`
Expected: exit 0; the updated `"snapshots prize"` test passes. (`claim-prize` reads only `total`/`top-ten` so it still compiles. If `simnet.burnBlockHeight` is undefined, use `simnet.blockHeight`'s burn equivalent — confirm the property name and adjust the test.)

- [ ] **Step 6: Commit**

```bash
git add contracts/xp-arcade-v4.clar tests/xp-arcade-v4.test.ts
git commit -m "feat(contract): snapshot a burn-block claim-deadline at end-season"
```

---

## Task 4: Pure split-occupied payout via `get-claimable-amount`

**Files:**
- Modify: `contract/contracts/xp-arcade-v4.clar`
- Modify: `contract/tests/xp-arcade-v4.test.ts`

- [ ] **Step 1: Write failing tests for the read-only**

Append this describe block to `tests/xp-arcade-v4.test.ts`:
```ts
describe("get-claimable-amount (split-occupied)", () => {
  function closeWith(scores: number[]) {
    registerSnake();
    scores.forEach((s, i) =>
      simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(s), Cl.stringAscii(`p${i}`)], w(i + 1)));
    simnet.callPublicFn(C, "end-season", [Cl.uint(1)], deployer);
  }
  const amt = (i: number) =>
    simnet.callReadOnlyFn(C, "get-claimable-amount", [Cl.uint(1), Cl.uint(1), Cl.principal(w(i))], w(1)).result;

  it("distinct scores pay the position band (rank 1-3 = 20%)", () => {
    closeWith([80, 40, 20]); // total 30000
    expect(amt(1)).toBeUint(6000); // 30000*20/100
  });

  it("two tied straddling positions 3-4 split (20%+5.71%)/2", () => {
    closeWith([90, 80, 70, 70]); // total 40000
    expect(amt(1)).toBeUint(8000); // pos1 20%
    expect(amt(2)).toBeUint(8000); // pos2 20%
    expect(amt(3)).toBeUint(5142); // (8000 + 2285)/2
    expect(amt(4)).toBeUint(5142);
  });

  it("all-ten tie splits the pool equally", () => {
    closeWith([50, 50, 50, 50, 50, 50, 50, 50, 50, 50]); // total 100000
    for (let i = 1; i <= 10; i++) expect(amt(i)).toBeUint(10000); // 100% / 10
  });

  it("ties inside the 4-10 band each get the 4/70 band", () => {
    closeWith([90, 80, 70, 60, 60]); // total 50000
    expect(amt(4)).toBeUint(2857); // 50000*4/70
    expect(amt(5)).toBeUint(2857);
  });

  it("returns 0 for a player not in the snapshot", () => {
    closeWith([80, 40, 20]);
    expect(amt(5)).toBeUint(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- -t "split-occupied"`
Expected: FAIL — `get-claimable-amount` is not defined.

- [ ] **Step 3: Replace the old rank helpers with pure folds**

In `contracts/xp-arcade-v4.clar`, DELETE these v3 artifacts: the `(define-data-var rank-player principal tx-sender)` line, the `find-caller-score` private fn, and the `rank-fold` private fn. Add in their place:
```clarity
(define-private (find-score
    (e { player: principal, score: uint })
    (acc { target: principal, found: bool, score: uint }))
  (if (and (not (get found acc)) (is-eq (get player e) (get target acc)))
    (merge acc { found: true, score: (get score e) })
    acc))

(define-private (count-rank
    (e { player: principal, score: uint })
    (acc { s: uint, higher: uint, same: uint }))
  (merge acc {
    higher: (if (> (get score e) (get s acc)) (+ (get higher acc) u1) (get higher acc)),
    same:   (if (is-eq (get score e) (get s acc)) (+ (get same acc) u1) (get same acc)) }))
```

- [ ] **Step 4: Add the read-only**

Add (near the other prize read-onlys):
```clarity
(define-read-only (get-claimable-amount (game-id uint) (season uint) (player principal))
  (match (map-get? season-prize { game-id: game-id, season: season })
    prize
      (let ((total (get total prize))
            (sc (fold find-score (get top-ten prize)
                  { target: player, found: false, score: u0 })))
        (if (or (not (get found sc)) (is-eq total u0))
          u0
          (let ((counts (fold count-rank (get top-ten prize)
                          { s: (get score sc), higher: u0, same: u0 }))
                (twenty (/ (* total u20) u100))
                (four70 (/ (* total u4) u70)))
            (let ((higher (get higher counts))
                  (same (get same counts)))
              (let ((slots-top3 (if (>= higher u3)
                                  u0
                                  (- (if (< (+ higher same) u3) (+ higher same) u3) higher))))
                (let ((slots-4-10 (- same slots-top3)))
                  (/ (+ (* slots-top3 twenty) (* slots-4-10 four70)) same)))))))
    u0))
```

- [ ] **Step 5: Run tests to verify pass**

Run: `clarinet check && npm test -- -t "split-occupied"`
Expected: exit 0; all five cases pass.

> NOTE: removing `rank-player`/`find-caller-score`/`rank-fold` will break the current `claim-prize` (it references them). That is fixed in Task 5; run the FULL suite only after Task 5. For now `clarinet check` may report unresolved references in `claim-prize` — proceed to Task 5 immediately (do not commit a non-compiling state).

- [ ] **Step 6: Do NOT commit yet** — Task 5 restores a compiling contract. Commit at the end of Task 5.

---

## Task 5: Rewire claim-prize (split-occupied + claim-window guard)

**Files:**
- Modify: `contract/contracts/xp-arcade-v4.clar`
- Modify: `contract/tests/xp-arcade-v4.test.ts`

- [ ] **Step 1: Replace claim-prize**

In `contracts/xp-arcade-v4.clar`, replace the entire `claim-prize` definition with:
```clarity
(define-public (claim-prize (game-id uint) (season uint))
  (let ((current (unwrap! (map-get? current-season game-id) ERR-NO-GAME))
        (claimed (default-to false
          (map-get? prize-claimed { player: tx-sender, game-id: game-id, season: season })))
        (prize-info (map-get? season-prize { game-id: game-id, season: season }))
        (player tx-sender))
    (asserts! (< season current) ERR-SEASON-NOT-CLOSED)
    (asserts! (is-some prize-info) ERR-PRIZE-NOT-FOUND)
    (asserts! (not claimed) ERR-ALREADY-CLAIMED)
    (let ((prize (unwrap-panic prize-info)))
      (asserts! (> (get total prize) u0) ERR-EMPTY-POOL)
      (asserts! (<= burn-block-height (get claim-deadline prize)) ERR-CLAIM-CLOSED)
      (let ((found (get found (fold find-score (get top-ten prize)
                      { target: player, found: false, score: u0 })))
            (payout (get-claimable-amount game-id season player))
            (paid (default-to u0 (map-get? season-paid { game-id: game-id, season: season }))))
        (asserts! found ERR-NOT-IN-TOP-TEN)
        (let ((final (if (> payout (- (get total prize) paid))
                       (- (get total prize) paid)
                       payout)))
          (map-set prize-claimed { player: player, game-id: game-id, season: season } true)
          (map-set season-paid { game-id: game-id, season: season } (+ paid final))
          (try! (as-contract (stx-transfer? final tx-sender player)))
          (ok final))))))
```

- [ ] **Step 2: Add order-independence + window tests**

Append to `tests/xp-arcade-v4.test.ts`:
```ts
describe("claim-prize v4 fairness + window", () => {
  function closeWith(scores: number[]) {
    registerSnake();
    scores.forEach((s, i) =>
      simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(s), Cl.stringAscii(`p${i}`)], w(i + 1)));
    simnet.callPublicFn(C, "end-season", [Cl.uint(1)], deployer);
  }
  const okUint = (r: any): bigint => r.value.value as bigint;
  const claim = (i: number) =>
    simnet.callPublicFn(C, "claim-prize", [Cl.uint(1), Cl.uint(1)], w(i)).result;

  it("ties pay the same regardless of claim order (no race)", () => {
    closeWith([90, 80, 70, 70]); // expected: 8000, 8000, 5142, 5142
    // claim lower ranks first, then higher
    expect(okUint(claim(3))).toBe(5142n);
    expect(okUint(claim(4))).toBe(5142n);
    expect(okUint(claim(1))).toBe(8000n);
    expect(okUint(claim(2))).toBe(8000n);
    // total paid never exceeds the pool
    expect(simnet.callReadOnlyFn(C, "get-season-paid", [Cl.uint(1), Cl.uint(1)], w(1)).result)
      .toBeUint(26284); // 8000+8000+5142+5142
  });

  it("rejects claims after the burn-block claim window", () => {
    closeWith([80, 40, 20]);
    expect(claim(1)).toBeOk(Cl.uint(6000)); // in-window claim works
    simnet.mineEmptyBurnBlocks(4321);       // cross CLAIM-WINDOW (4320)
    expect(claim(2)).toBeErr(Cl.uint(114)); // ERR-CLAIM-CLOSED
  });
});
```

- [ ] **Step 3: Rewrite the copied "payout invariants" block for fair behavior**

In `tests/xp-arcade-v4.test.ts`, find the copied `describe("payout invariants (review hardening)", ...)` block (carried over from v3, which asserts ties STARVE lower ranks). Replace the two tie tests (`"tied top scores can drain..."` and `"individual payout depends on claim order..."`) with a single fairness test:
```ts
  it("tied top scores split fairly instead of starving lower ranks", () => {
    // 5 tie at 80 (positions 1-5), then 70, 60 (positions 6,7). total = 70000.
    const scores = [80, 80, 80, 80, 80, 70, 60];
    registerSnake();
    scores.forEach((s, i) =>
      simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(s), Cl.stringAscii(`p${i}`)], w(i + 1)));
    simnet.callPublicFn(C, "end-season", [Cl.uint(1)], deployer);
    // every member can claim a positive share; pool is never over-drained
    let paid = 0n;
    for (let i = 1; i <= 7; i++) {
      const r = simnet.callPublicFn(C, "claim-prize", [Cl.uint(1), Cl.uint(1)], w(i)).result;
      paid += (r as any).value.value;
    }
    expect(paid <= 70000n).toBe(true);
    // the rank-6 player is NOT starved (would have been ERR-EMPTY-POOL in v3)
    expect(simnet.callReadOnlyFn(C, "has-claimed-prize",
      [Cl.principal(w(6)), Cl.uint(1), Cl.uint(1)], w(1)).result).toBeBool(true);
  });
```
Keep the first invariant test (`"never distributes more than the pool with distinct ranks; dust stays locked"`) unchanged — it still holds.

- [ ] **Step 4: Run the full suite**

Run: `clarinet check && npm test`
Expected: exit 0; all suites pass. (If `simnet.mineEmptyBurnBlocks` is not a function, check the clarinet-sdk API — the equivalent may be `simnet.mineEmptyBurnBlock()` in a loop; adjust the test and re-run.)

- [ ] **Step 5: Commit**

```bash
git add contracts/xp-arcade-v4.clar tests/xp-arcade-v4.test.ts
git commit -m "feat(contract): fair split-occupied claim payout + burn-block claim window"
```

---

## Task 6: finalize-season rolls unclaimed into the open season

**Files:**
- Modify: `contract/contracts/xp-arcade-v4.clar`
- Modify: `contract/tests/xp-arcade-v4.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/xp-arcade-v4.test.ts`:
```ts
describe("finalize-season (roll unclaimed)", () => {
  function closeWith(scores: number[]) {
    registerSnake();
    scores.forEach((s, i) =>
      simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(s), Cl.stringAscii(`p${i}`)], w(i + 1)));
    simnet.callPublicFn(C, "end-season", [Cl.uint(1)], deployer);
  }

  it("rejects finalize before the claim window closes", () => {
    closeWith([80, 40, 20]);
    expect(simnet.callPublicFn(C, "finalize-season", [Cl.uint(1), Cl.uint(1)], w(1)).result)
      .toBeErr(Cl.uint(116)); // ERR-NOT-FINALIZABLE
  });

  it("rolls total-minus-paid into the current open season pool after the window", () => {
    closeWith([90, 80, 70, 70]); // total 40000; only w1 claims (8000)
    simnet.callPublicFn(C, "claim-prize", [Cl.uint(1), Cl.uint(1)], w(1));
    simnet.mineEmptyBurnBlocks(4321);
    const r = simnet.callPublicFn(C, "finalize-season", [Cl.uint(1), Cl.uint(1)], w(2)).result;
    expect(r).toBeOk(Cl.uint(32000)); // 40000 - 8000
    // rolled into season 2's accumulated pool (no new mints since)
    expect(simnet.callReadOnlyFn(C, "get-prize-pool-balance", [Cl.uint(1)], w(1)).result)
      .toBeUint(32000);
    expect(simnet.callReadOnlyFn(C, "get-season-finalized", [Cl.uint(1), Cl.uint(1)], w(1)).result)
      .toBeBool(true);
  });

  it("rejects a second finalize", () => {
    closeWith([80, 40, 20]);
    simnet.mineEmptyBurnBlocks(4321);
    simnet.callPublicFn(C, "finalize-season", [Cl.uint(1), Cl.uint(1)], w(1));
    expect(simnet.callPublicFn(C, "finalize-season", [Cl.uint(1), Cl.uint(1)], w(1)).result)
      .toBeErr(Cl.uint(115)); // ERR-ALREADY-FINALIZED
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- -t "finalize-season"`
Expected: FAIL — `finalize-season` / `get-season-finalized` not defined.

- [ ] **Step 3: Add finalize-season and read-onlys**

Add to `contracts/xp-arcade-v4.clar`:
```clarity
(define-public (finalize-season (game-id uint) (season uint))
  (let ((prize-info (map-get? season-prize { game-id: game-id, season: season }))
        (already (default-to false
          (map-get? season-finalized { game-id: game-id, season: season }))))
    (asserts! (is-some prize-info) ERR-PRIZE-NOT-FOUND)
    (asserts! (not already) ERR-ALREADY-FINALIZED)
    (let ((prize (unwrap-panic prize-info)))
      (asserts! (> burn-block-height (get claim-deadline prize)) ERR-NOT-FINALIZABLE)
      (let ((paid (default-to u0 (map-get? season-paid { game-id: game-id, season: season }))))
        (let ((unclaimed (- (get total prize) paid)))
          (map-set season-finalized { game-id: game-id, season: season } true)
          (map-set season-accumulated game-id
            (+ (default-to u0 (map-get? season-accumulated game-id)) unclaimed))
          (ok unclaimed))))))

(define-read-only (get-season-finalized (game-id uint) (season uint))
  (default-to false (map-get? season-finalized { game-id: game-id, season: season })))

(define-read-only (is-claim-open (game-id uint) (season uint))
  (match (map-get? season-prize { game-id: game-id, season: season })
    prize (and (<= burn-block-height (get claim-deadline prize))
               (not (default-to false
                 (map-get? season-finalized { game-id: game-id, season: season }))))
    false))
```

- [ ] **Step 4: Run the full suite**

Run: `clarinet check && npm test`
Expected: exit 0; all finalize tests pass and nothing else regressed.

- [ ] **Step 5: Commit**

```bash
git add contracts/xp-arcade-v4.clar tests/xp-arcade-v4.test.ts
git commit -m "feat(contract): permissionless finalize-season rolls unclaimed into next pool"
```

---

## Task 7: Frontend — repoint registry + env to v4

**Files:**
- Modify: `frontend/lib/game-registry.ts`
- Modify: `frontend/.env.example`

- [ ] **Step 1: Update the contract name**

In `frontend/lib/game-registry.ts`, change the constant:
```ts
const V3_CONTRACT_NAME = "xp-arcade-v4";
```
(Rename the identifier to `V4_CONTRACT_NAME` and update its single usage in `SHARED_V3` for clarity; keep behavior identical otherwise.)

- [ ] **Step 2: Update the env example**

In `frontend/.env.example`, change:
```
NEXT_PUBLIC_CONTRACT_ADDRESS=SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4
```

- [ ] **Step 3: Verify type-check + existing tests**

Run: `cd frontend && npx tsc --noEmit && npm test -- game-registry`
Expected: clean; `game-registry` tests pass (update any test asserting `xp-arcade-v3` → `xp-arcade-v4`).

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/game-registry.ts frontend/.env.example frontend/lib/game-registry.test.ts
git commit -m "feat(frontend): point game registry at xp-arcade-v4"
```

---

## Task 8: Frontend — claim amount + window from on-chain reads

**Files:**
- Modify: `frontend/lib/contract-calls.ts`
- Modify: `frontend/lib/claimable-prizes.ts`
- Modify: `frontend/components/windows/HighScoreWindow.tsx`

- [ ] **Step 1: Write failing tests for the new helpers**

In `frontend/lib/contract-calls.test.ts`, add tests that `getClaimableAmount(gameId, season, address)` calls `get-claimable-amount` and returns the unwrapped uint, and `isClaimOpen(gameId, season)` calls `is-claim-open` and returns a boolean. Follow the existing mocking pattern in that file for `callReadOnlyFunction`/`fetchCallReadOnlyFunction` (match how `getSeasonPrizeForGame` is tested).

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npm test -- contract-calls`
Expected: FAIL — helpers not defined.

- [ ] **Step 3: Implement the helpers**

In `frontend/lib/contract-calls.ts`, add `getClaimableAmount` and `isClaimOpen`, mirroring the existing `*ForGame` read-only helpers (they already resolve `contractAddress`/`contractName` from `game-registry` and use `cv-unwrap`'s `unwrap()`). `getClaimableAmount` calls `get-claimable-amount` with `[uint game-onchain-id, uint season, principal address]` and returns a `bigint`/number; `isClaimOpen` calls `is-claim-open` returning `boolean`.

- [ ] **Step 4: Use the on-chain amount + window in the UI**

In `HighScoreWindow.tsx`: when building each claim row, use `getClaimableAmount` for the displayed amount and the `claimPrizeV3` post-condition (`willSendLte(amount)`), and gate the claim button with `isClaimOpen` — when closed, render a "Claim window closed" label instead of the button. In `claimable-prizes.ts` `findClaimablePrizes`, skip seasons where `isClaimOpen` is false (or mark them closed) so closed seasons don't show an active button.

- [ ] **Step 5: Run frontend checks**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: clean type-check; all tests pass (update any claim-related test expecting the old off-chain amount path).

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/contract-calls.ts frontend/lib/contract-calls.test.ts frontend/lib/claimable-prizes.ts frontend/components/windows/HighScoreWindow.tsx
git commit -m "feat(frontend): read claim amount + window state from xp-arcade-v4 on-chain"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full contract suite**

Run: `cd contract && clarinet check && npm test`
Expected: exit 0; all suites green (v3, v4, snake-score).

- [ ] **Step 2: Full frontend suite + build**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run build`
Expected: clean type-check, all tests pass, build succeeds.

- [ ] **Step 3: Update HANDOFF deploy steps (do NOT commit — docs per user pref)**

Edit `HANDOFF.md` to add the v4 deploy checklist (deploy `xp-arcade-v4`, `register-game` ×4 with the same fees/rarity as v3, `set-base-uri`, set Vercel `NEXT_PUBLIC_CONTRACT_ADDRESS`, redeploy, live-smoke incl. claim-after-window + finalize roll). Leave the file uncommitted per the standing docs preference; flag it to the user.

---

## Deploy (manual, after merge — out of plan scope)

Deploy `xp-arcade-v4` to mainnet via a Clarinet plan with the deployer wallet (`-p <plan> -d --no-dashboard`, never `-c`), `register-game` the 4 games, `set-base-uri`, set Vercel env, redeploy frontend, run the live-wallet smoke test. See spec §10.

---

## Self-Review notes

- **Spec coverage:** split-occupied (Task 4/5), burn-block window (Task 3/5), finalize roll (Task 6), fresh contract (Task 1), read-onlys `get-claimable-amount`/`get-season-finalized`/`is-claim-open` (Task 4/6), frontend repoint + on-chain amount/window (Task 7/8). Compute-at-claim approach honored (no allocation map).
- **Known API confirmations for the implementer:** `simnet.burnBlockHeight` (Task 3) and `simnet.mineEmptyBurnBlocks` (Task 5/6) property/method names — verify against the installed `@hirosystems/clarinet-sdk` and adjust if named differently; the logic is unaffected.
- **Type consistency:** `find-score`/`count-rank` accumulators and the `season-prize` tuple (now with `claim-deadline`) are used consistently across `get-claimable-amount`, `claim-prize`, `finalize-season`, `is-claim-open`.
