# Economic / On-Chain Alerting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily GitHub-Actions chain-reader that detects three economic-lifecycle conditions on the `xp-arcade-v4` prize pool and posts actionable alerts to Discord.

**Architecture:** A pure, unit-tested module (`frontend/lib/economic-alerts.ts`) computes alerts from a plain data snapshot; a thin runner (`frontend/scripts/economic-alerts.ts`, run via `node --experimental-strip-types`) does all I/O — reads read-only chain state + `/v2/info`, builds the snapshot, and POSTs a Discord message when alerts exist. A daily workflow invokes the runner. No contract change, no Redis, no new npm dependency.

**Tech Stack:** TypeScript, `@stacks/transactions` (already a dep), Node 22 `--experimental-strip-types`, Vitest 3, GitHub Actions, Discord Incoming Webhook.

## Global Constraints

- **Path must not contain spaces** — keep `Desktop/xp-snake/`.
- **No new npm dependency.** The runner is a `.ts` file executed via `node --experimental-strip-types` (verified on Node 22.16); do not add `tsx`.
- **No contract change.** Only read-only functions of `SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4` are called.
- **Pure logic separated from I/O.** All decision logic lives in `lib/economic-alerts.ts` with a 1-1 `*.test.ts`; the runner contains no branching alert logic.
- **No PII in output.** Discord messages contain game slug + uSTX amounts + block heights only — never principals (`SP…`/`ST…`) or txids (`0x…`).
- **Game slug is `breakout`** (matches `GAME_IDS`), not `bricks`, in all display output.
- **Telemetry-style safety:** missing `ALERT_WEBHOOK_URL` → print to stdout + exit 0 (no-op). Chain-read / `/v2/info` / non-2xx webhook → `console.error` + exit 1 (workflow red).
- **Conventional commits, small green commits, stage explicit files, no `Co-Authored-By`.** Commit only the files each step names.
- **Run the actual test/typecheck and read output before claiming a step passes.**
- **Thresholds** (defaults, env-overridable): `SEASON_END_WARN_BLOCKS` default `1000`; `CLAIM_WARN_BURN_BLOCKS` default `432`.
- **Alert catalog (3 rules):**
  - `season_ending_soon` (warning): `endBlock > 0 && 0 < endBlock − stacksTip ≤ seasonEndWarnBlocks`.
  - `finalize_overdue` (critical): closed season with prize, `finalized === false`, `burnTip > claimDeadline`, `total − paid > 0`.
  - `claim_closing_soon` (warning): closed season with prize, `finalized === false`, `burnTip ≤ claimDeadline`, `0 < claimDeadline − burnTip ≤ claimWarnBurnBlocks`, `total − paid > 0`.
- **Closed-season scan range:** `s ∈ [max(1, currentSeason − 2), currentSeason − 1]`.

---

### Task 1: Pure alert types + `computeAlerts`

**Files:**
- Create: `frontend/lib/economic-alerts.ts`
- Test: `frontend/lib/economic-alerts.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  ```ts
  export type Severity = "critical" | "warning";
  export type Alert = { severity: Severity; code: string; game: string; message: string };
  export type ClosedSeason = {
    season: number;
    total: number;        // uSTX
    paid: number;         // uSTX
    finalized: boolean;
    claimDeadline: number; // burn block height
  };
  export type GameState = {
    game: string;          // slug, e.g. "snake"
    currentSeason: number;
    seasonEndBlock: number; // 0 = unset
    closedSeasons: ClosedSeason[];
  };
  export type ChainSnapshot = {
    stacksTip: number;
    burnTip: number;
    games: GameState[];
  };
  export type Thresholds = { seasonEndWarnBlocks: number; claimWarnBurnBlocks: number };
  export function computeAlerts(snapshot: ChainSnapshot, thresholds: Thresholds): Alert[];
  ```

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/economic-alerts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeAlerts, type ChainSnapshot, type Thresholds } from "./economic-alerts";

const THRESHOLDS: Thresholds = { seasonEndWarnBlocks: 1000, claimWarnBurnBlocks: 432 };

function snapshot(overrides: Partial<ChainSnapshot> = {}): ChainSnapshot {
  return { stacksTip: 100_000, burnTip: 50_000, games: [], ...overrides };
}

function game(overrides: Partial<ChainSnapshot["games"][number]> = {}) {
  return {
    game: "snake",
    currentSeason: 2,
    seasonEndBlock: 0,
    closedSeasons: [],
    ...overrides,
  };
}

describe("computeAlerts — season_ending_soon (#1)", () => {
  it("fires when end-block is ahead within the warn window", () => {
    const snap = snapshot({ stacksTip: 100_000, games: [game({ seasonEndBlock: 100_500 })] });
    const alerts = computeAlerts(snap, THRESHOLDS);
    expect(alerts).toEqual([
      expect.objectContaining({ code: "season_ending_soon", severity: "warning", game: "snake" }),
    ]);
  });

  it("is silent when end-block is unset (0)", () => {
    const snap = snapshot({ games: [game({ seasonEndBlock: 0 })] });
    expect(computeAlerts(snap, THRESHOLDS)).toEqual([]);
  });

  it("is silent when the deadline already passed (dropped season_overdue rule)", () => {
    const snap = snapshot({ stacksTip: 100_000, games: [game({ seasonEndBlock: 99_000 })] });
    expect(computeAlerts(snap, THRESHOLDS)).toEqual([]);
  });

  it("is silent when the deadline is further than the warn window", () => {
    const snap = snapshot({ stacksTip: 100_000, games: [game({ seasonEndBlock: 200_000 })] });
    expect(computeAlerts(snap, THRESHOLDS)).toEqual([]);
  });
});

describe("computeAlerts — finalize_overdue (#2)", () => {
  const base = () =>
    game({
      currentSeason: 2,
      closedSeasons: [
        { season: 1, total: 1_000_000, paid: 200_000, finalized: false, claimDeadline: 40_000 },
      ],
    });

  it("fires (critical) when past claim-deadline, not finalized, money remains", () => {
    const snap = snapshot({ burnTip: 50_000, games: [base()] });
    const alerts = computeAlerts(snap, THRESHOLDS);
    expect(alerts).toEqual([
      expect.objectContaining({ code: "finalize_overdue", severity: "critical", game: "snake" }),
    ]);
  });

  it("is silent when already finalized", () => {
    const g = base();
    g.closedSeasons[0].finalized = true;
    expect(computeAlerts(snapshot({ burnTip: 50_000, games: [g] }), THRESHOLDS)).toEqual([]);
  });

  it("is silent when nothing left to claim (total === paid)", () => {
    const g = base();
    g.closedSeasons[0].paid = 1_000_000;
    expect(computeAlerts(snapshot({ burnTip: 50_000, games: [g] }), THRESHOLDS)).toEqual([]);
  });

  it("is silent when still inside the claim window", () => {
    const snap = snapshot({ burnTip: 39_000, games: [base()] });
    // burnTip < claimDeadline → not overdue; may be claim_closing_soon depending on window
    expect(snap.burnTip).toBeLessThan(40_000);
    const alerts = computeAlerts(snap, THRESHOLDS);
    expect(alerts.some((a) => a.code === "finalize_overdue")).toBe(false);
  });
});

describe("computeAlerts — claim_closing_soon (#3)", () => {
  const closing = () =>
    game({
      currentSeason: 2,
      closedSeasons: [
        { season: 1, total: 1_000_000, paid: 0, finalized: false, claimDeadline: 40_000 },
      ],
    });

  it("fires (warning) when window closes within threshold and money remains", () => {
    const snap = snapshot({ burnTip: 39_800, games: [closing()] }); // 200 blocks left ≤ 432
    const alerts = computeAlerts(snap, THRESHOLDS);
    expect(alerts).toEqual([
      expect.objectContaining({ code: "claim_closing_soon", severity: "warning", game: "snake" }),
    ]);
  });

  it("is silent when the window is not close yet", () => {
    const snap = snapshot({ burnTip: 30_000, games: [closing()] }); // 10_000 left > 432
    expect(computeAlerts(snap, THRESHOLDS)).toEqual([]);
  });

  it("is silent when no money remains", () => {
    const g = closing();
    g.closedSeasons[0].paid = 1_000_000;
    expect(computeAlerts(snapshot({ burnTip: 39_800, games: [g] }), THRESHOLDS)).toEqual([]);
  });
});

describe("computeAlerts — aggregation", () => {
  it("returns [] for an empty snapshot", () => {
    expect(computeAlerts(snapshot(), THRESHOLDS)).toEqual([]);
  });

  it("collects alerts across multiple games and closed seasons", () => {
    const snap = snapshot({
      stacksTip: 100_000,
      burnTip: 50_000,
      games: [
        game({ game: "snake", seasonEndBlock: 100_500 }), // ending soon
        game({
          game: "tetris",
          closedSeasons: [
            { season: 1, total: 500_000, paid: 0, finalized: false, claimDeadline: 40_000 }, // finalize_overdue
          ],
        }),
      ],
    });
    const codes = computeAlerts(snap, THRESHOLDS).map((a) => a.code).sort();
    expect(codes).toEqual(["finalize_overdue", "season_ending_soon"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run lib/economic-alerts.test.ts`
Expected: FAIL — `computeAlerts` / module not found.

- [ ] **Step 3: Write the minimal implementation**

Create `frontend/lib/economic-alerts.ts`:

```ts
export type Severity = "critical" | "warning";

export type Alert = {
  severity: Severity;
  code: string;
  game: string;
  message: string;
};

export type ClosedSeason = {
  season: number;
  total: number; // uSTX
  paid: number; // uSTX
  finalized: boolean;
  claimDeadline: number; // burn block height
};

export type GameState = {
  game: string; // slug, e.g. "snake"
  currentSeason: number;
  seasonEndBlock: number; // 0 = unset
  closedSeasons: ClosedSeason[];
};

export type ChainSnapshot = {
  stacksTip: number;
  burnTip: number;
  games: GameState[];
};

export type Thresholds = {
  seasonEndWarnBlocks: number;
  claimWarnBurnBlocks: number;
};

function seasonEndingSoon(
  g: GameState,
  stacksTip: number,
  thresholds: Thresholds,
): Alert | null {
  if (g.seasonEndBlock <= 0) return null;
  const remaining = g.seasonEndBlock - stacksTip;
  if (remaining <= 0 || remaining > thresholds.seasonEndWarnBlocks) return null;
  return {
    severity: "warning",
    code: "season_ending_soon",
    game: g.game,
    message: `${g.game}: season deadline in ~${remaining} stacks blocks (end-block ${g.seasonEndBlock}).`,
  };
}

function closedSeasonAlerts(
  g: GameState,
  burnTip: number,
  thresholds: Thresholds,
): Alert[] {
  const out: Alert[] = [];
  for (const s of g.closedSeasons) {
    const unclaimed = s.total - s.paid;
    if (s.finalized || unclaimed <= 0) continue;

    if (burnTip > s.claimDeadline) {
      out.push({
        severity: "critical",
        code: "finalize_overdue",
        game: g.game,
        message: `${g.game}: season ${s.season} claim window closed with ${unclaimed} uSTX unclaimed — call finalize-season(${gameLabel(g)}, ${s.season}).`,
      });
      continue;
    }

    const remaining = s.claimDeadline - burnTip;
    if (remaining > 0 && remaining <= thresholds.claimWarnBurnBlocks) {
      out.push({
        severity: "warning",
        code: "claim_closing_soon",
        game: g.game,
        message: `${g.game}: season ${s.season} claim window closes in ~${remaining} burn blocks with ${unclaimed} uSTX still unclaimed.`,
      });
    }
  }
  return out;
}

function gameLabel(g: GameState): string {
  return g.game;
}

export function computeAlerts(
  snapshot: ChainSnapshot,
  thresholds: Thresholds,
): Alert[] {
  const alerts: Alert[] = [];
  for (const g of snapshot.games) {
    const ending = seasonEndingSoon(g, snapshot.stacksTip, thresholds);
    if (ending) alerts.push(ending);
    alerts.push(...closedSeasonAlerts(g, snapshot.burnTip, thresholds));
  }
  return alerts;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run lib/economic-alerts.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/economic-alerts.ts frontend/lib/economic-alerts.test.ts
git commit -m "feat(alerts): pure computeAlerts for economic on-chain conditions"
```

---

### Task 2: `formatDiscordMessage`

**Files:**
- Modify: `frontend/lib/economic-alerts.ts`
- Test: `frontend/lib/economic-alerts.test.ts`

**Interfaces:**
- Consumes: `Alert` (Task 1).
- Produces: `export function formatDiscordMessage(alerts: Alert[]): { content: string };` — critical alerts listed before warnings; contains no principals or txids.

- [ ] **Step 1: Write the failing test**

Append to `frontend/lib/economic-alerts.test.ts`:

```ts
import { formatDiscordMessage } from "./economic-alerts";

describe("formatDiscordMessage", () => {
  const alerts = [
    { severity: "warning" as const, code: "season_ending_soon", game: "snake", message: "snake: season deadline in ~500 stacks blocks (end-block 100500)." },
    { severity: "critical" as const, code: "finalize_overdue", game: "tetris", message: "tetris: season 1 claim window closed with 500000 uSTX unclaimed — call finalize-season(tetris, 1)." },
  ];

  it("puts critical alerts before warnings", () => {
    const { content } = formatDiscordMessage(alerts);
    expect(content.indexOf("finalize_overdue")).toBeLessThan(content.indexOf("season_ending_soon"));
  });

  it("mentions counts of each severity", () => {
    const { content } = formatDiscordMessage(alerts);
    expect(content).toContain("1 critical");
    expect(content).toContain("1 warning");
  });

  it("contains no principals or txids", () => {
    const { content } = formatDiscordMessage(alerts);
    expect(content).not.toMatch(/S[PT][0-9A-Z]{6,}/); // no SP…/ST… principals
    expect(content).not.toMatch(/0x[0-9a-fA-F]{8,}/); // no txids
  });

  it("handles an empty list without throwing", () => {
    expect(() => formatDiscordMessage([])).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run lib/economic-alerts.test.ts`
Expected: FAIL — `formatDiscordMessage` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `frontend/lib/economic-alerts.ts`:

```ts
export function formatDiscordMessage(alerts: Alert[]): { content: string } {
  const critical = alerts.filter((a) => a.severity === "critical");
  const warning = alerts.filter((a) => a.severity === "warning");

  const lines: string[] = [];
  lines.push(
    `**XP Arcade — economic alerts** (${critical.length} critical, ${warning.length} warning)`,
  );
  for (const a of critical) lines.push(`🔴 [${a.code}] ${a.message}`);
  for (const a of warning) lines.push(`🟡 [${a.code}] ${a.message}`);

  return { content: lines.join("\n") };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run lib/economic-alerts.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

```bash
git add frontend/lib/economic-alerts.ts frontend/lib/economic-alerts.test.ts
git commit -m "feat(alerts): format economic alerts into a Discord message"
```

---

### Task 3: I/O runner `scripts/economic-alerts.ts`

**Files:**
- Create: `frontend/scripts/economic-alerts.ts`
- Modify: `frontend/package.json` (add `alerts:economic` script)

**Interfaces:**
- Consumes: `computeAlerts`, `formatDiscordMessage`, `ChainSnapshot`, `ClosedSeason`, `Thresholds` from `../lib/economic-alerts.ts`.
- Produces: an executable script (no exports). Reads env `STACKS_API_URL`, `ALERT_WEBHOOK_URL`, `SEASON_END_WARN_BLOCKS`, `CLAIM_WARN_BURN_BLOCKS`.

> This task has no unit test (pure logic is already covered in Tasks 1–2; the runner is thin I/O). It is verified by a real `workflow_dispatch`-style local run in Step 4.

- [ ] **Step 1: Write the runner**

Create `frontend/scripts/economic-alerts.ts`:

```ts
import {
  cvToValue,
  fetchCallReadOnlyFunction,
  uintCV,
} from "@stacks/transactions";
import {
  computeAlerts,
  formatDiscordMessage,
  type ChainSnapshot,
  type ClosedSeason,
  type GameState,
  type Thresholds,
} from "../lib/economic-alerts.ts";

const API_URL = (process.env.STACKS_API_URL ?? "https://api.hiro.so").replace(/\/$/, "");
const CONTRACT_ADDRESS = "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";
const CONTRACT_NAME = "xp-arcade-v4";
const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;

const THRESHOLDS: Thresholds = {
  seasonEndWarnBlocks: Number(process.env.SEASON_END_WARN_BLOCKS ?? 1000),
  claimWarnBurnBlocks: Number(process.env.CLAIM_WARN_BURN_BLOCKS ?? 432),
};

// slug matches GAME_IDS (breakout, not bricks)
const GAMES: Array<{ slug: string; id: number }> = [
  { slug: "snake", id: 1 },
  { slug: "tetris", id: 2 },
  { slug: "pacman", id: 3 },
  { slug: "breakout", id: 4 },
  { slug: "minesweeper", id: 5 },
  { slug: "solitaire", id: 6 },
];

function fetchWithTimeout(input: string, init: RequestInit = {}) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(10_000) });
}

async function readOnly(functionName: string, functionArgs: ReturnType<typeof uintCV>[] = []) {
  const result = await fetchCallReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName,
    functionArgs,
    senderAddress: CONTRACT_ADDRESS,
    network: "mainnet",
    client: { baseUrl: API_URL, fetch: fetchWithTimeout },
  });
  return cvToValue(result);
}

async function fetchTips(): Promise<{ stacksTip: number; burnTip: number }> {
  const res = await fetchWithTimeout(`${API_URL}/v2/info`);
  if (!res.ok) throw new Error(`/v2/info returned HTTP ${res.status}`);
  const info = await res.json();
  return {
    stacksTip: Number(info.stacks_tip_height),
    burnTip: Number(info.burn_block_height),
  };
}

async function readClosedSeason(id: number, season: number): Promise<ClosedSeason | null> {
  // get-season-prize returns (optional { total, top-ten, claim-deadline }); cvToValue → null when none
  const prize = await readOnly("get-season-prize", [uintCV(id), uintCV(season)]);
  if (prize == null) return null;
  const total = Number(prize.total?.value ?? prize.total);
  const claimDeadline = Number(prize["claim-deadline"]?.value ?? prize["claim-deadline"]);
  const paid = Number(await readOnly("get-season-paid", [uintCV(id), uintCV(season)]));
  const finalized = Boolean(await readOnly("get-season-finalized", [uintCV(id), uintCV(season)]));
  return { season, total, paid, finalized, claimDeadline };
}

async function readGame(slug: string, id: number): Promise<GameState> {
  const currentSeason = Number(await readOnly("get-current-season", [uintCV(id)]));
  const seasonEndBlock = Number(await readOnly("get-season-end-block", [uintCV(id)]));

  const closedSeasons: ClosedSeason[] = [];
  const first = Math.max(1, currentSeason - 2);
  for (let s = first; s <= currentSeason - 1; s++) {
    const closed = await readClosedSeason(id, s);
    if (closed) closedSeasons.push(closed);
  }

  return { game: slug, currentSeason, seasonEndBlock, closedSeasons };
}

async function main() {
  const { stacksTip, burnTip } = await fetchTips();
  const games: GameState[] = [];
  for (const { slug, id } of GAMES) {
    games.push(await readGame(slug, id));
  }
  const snapshot: ChainSnapshot = { stacksTip, burnTip, games };

  const alerts = computeAlerts(snapshot, THRESHOLDS);
  if (alerts.length === 0) {
    console.log("No economic alerts.");
    return;
  }

  const { content } = formatDiscordMessage(alerts);
  if (!WEBHOOK_URL) {
    console.log("ALERT_WEBHOOK_URL not set — alerts below (not posted):\n" + content);
    return;
  }

  const res = await fetchWithTimeout(WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Discord webhook returned HTTP ${res.status}`);
  console.log(`Posted ${alerts.length} economic alert(s) to Discord.`);
}

main().catch((error) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Add the npm script**

In `frontend/package.json`, add to `scripts` (after `health:production`):

```json
"alerts:economic": "node --experimental-strip-types scripts/economic-alerts.ts",
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

> Note: `tsc` may not resolve the `.ts` import extension by default. If it errors with "An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled", confirm `frontend/tsconfig.json` has `"allowImportingTsExtensions": true` (Next 16 / TS 5 projects usually do). If it is not set and cannot be enabled, change the import to `from "../lib/economic-alerts"` (no extension) for `tsc`, and verify the runtime run in Step 4 still resolves it — `--experimental-strip-types` resolves extensionless relative `.ts` imports in Node 22. Prefer whichever single form makes both `tsc` and the Node run pass; document the choice in the commit message.

- [ ] **Step 4: Real run against mainnet (no webhook)**

Run: `cd frontend && ALERT_WEBHOOK_URL= node --experimental-strip-types scripts/economic-alerts.ts`
Expected: exits 0; prints either `No economic alerts.` or `ALERT_WEBHOOK_URL not set — alerts below (not posted):` followed by a message with `breakout` (not `bricks`) and no `SP…` principals. Read the output and confirm it is sane (game slugs present, amounts are integers).

- [ ] **Step 5: Commit**

```bash
git add frontend/scripts/economic-alerts.ts frontend/package.json
git commit -m "feat(alerts): chain-reader runner posting economic alerts to Discord"
```

---

### Task 4: Daily GitHub Actions workflow

**Files:**
- Create: `.github/workflows/economic-alerts.yml`

**Interfaces:**
- Consumes: `npm run alerts:economic` (Task 3), repo secret `ALERT_WEBHOOK_URL`.
- Produces: a scheduled + manually-dispatchable workflow.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/economic-alerts.yml`:

```yaml
name: Economic Alerts

on:
  workflow_dispatch:
  schedule:
    - cron: "0 9 * * *"

permissions:
  contents: read

jobs:
  economic-alerts:
    name: Mainnet economic-lifecycle checks
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run economic alert checks
        run: npm run alerts:economic
        env:
          ALERT_WEBHOOK_URL: ${{ secrets.ALERT_WEBHOOK_URL }}
```

- [ ] **Step 2: Validate YAML locally**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/economic-alerts.yml','utf8');if(!/cron: \"0 9 \* \* \*\"/.test(s))throw new Error('cron missing');console.log('workflow OK')"`
Expected: prints `workflow OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/economic-alerts.yml
git commit -m "ci(alerts): daily economic-alerts workflow posting to Discord"
```

---

### Task 5: Full gate + docs pointer

**Files:**
- Modify: `.claude/docs/environment-quirks.md` (document `ALERT_WEBHOOK_URL` secret + `--experimental-strip-types` runner)

- [ ] **Step 1: Add the secret/setup note**

Append a short subsection to `.claude/docs/environment-quirks.md` under whatever "secrets" / "env vars" section exists (or at the end):

```markdown
## Economic-alerts workflow (phase 2 observability)

- `.github/workflows/economic-alerts.yml` runs `npm run alerts:economic` daily.
- Requires GitHub repo secret **`ALERT_WEBHOOK_URL`** (a Discord Incoming
  Webhook URL). Without it the run prints alerts to the workflow log and exits 0.
- Optional overrides: `STACKS_API_URL`, `SEASON_END_WARN_BLOCKS` (default 1000),
  `CLAIM_WARN_BURN_BLOCKS` (default 432).
- The runner is `frontend/scripts/economic-alerts.ts`, executed via
  `node --experimental-strip-types` (Node 22) — no `tsx` dependency.
```

- [ ] **Step 2: Run the full frontend gate**

Run: `cd frontend && npm run lint && npm run test && npm run typecheck`
Expected: lint clean, all Vitest suites pass (including `economic-alerts.test.ts`), typecheck clean. Read the output; do not proceed on any failure.

- [ ] **Step 3: Commit**

```bash
git add .claude/docs/environment-quirks.md
git commit -m "docs(alerts): document economic-alerts workflow + ALERT_WEBHOOK_URL"
```

---

## Post-plan: user actions (not code)

1. Create a Discord Incoming Webhook (Server Settings → Integrations → Webhooks) for the target channel.
2. Add it as GitHub repo secret `ALERT_WEBHOOK_URL` (Settings → Secrets and variables → Actions).
3. Trigger the workflow once via **Actions → Economic Alerts → Run workflow** to confirm the Discord post.
4. Push the branch (the whole observability work is currently unpushed — see memory).
