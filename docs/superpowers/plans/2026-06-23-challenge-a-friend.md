# Challenge a Friend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Challenge a friend" share action that produces a beat-my-score deep link; when a friend opens it, the app prompts Accept & Play, launches the challenged game, and shows a live target banner until they beat it.

**Architecture:** Pure `challenge-link.ts` (build/parse/validate) + a small in-memory `state/challenge.ts` store + a pure `challenge-progress.ts` (met detection). React glue: `ChallengeLoader` reads the URL on load, `ChallengeDialog` is the Accept prompt, `ChallengeBanner` (a new presentational unit mounted in `GameShellWindow`) shows the target and fires the celebration, and `ShareActions` gains the copy-link button.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zustand 5, Vitest 3. Frontend only.

## Global Constraints

- Frontend only. No contract change, no API route, no new npm dependency.
- All work under `frontend/`. Run gates from `frontend/`.
- `@testing-library/react` is NOT a dependency. Component tests use the project pattern: `renderToStaticMarkup` (`react-dom/server`) for static content, and `createRoot`+`act` (`react-dom/client` + `react`) with `globalThis.IS_REACT_ACT_ENVIRONMENT = true` for interaction — mirror `components/dialogs/WelcomeDialog.test.tsx` and `components/desktop/TrayBalloon.test.tsx`.
- Reuse existing modules — do NOT reimplement: `GAME_IDS`/`GAMES`/`GameId` (`@/lib/game-registry`), `isStacksAddress`/`shortAddress` (`@/lib/stacks-address`), `stacks` (`@/lib/stacks`, has `appUrl`), `formatScoreValue` (`@/lib/score-format`), `playSuccess` (`@/lib/sounds`), `useWallet` (`@/state/wallet`), `useWindows` (`@/state/window-manager`, `open(\`game-${id}\`)`), `useSessionStats` (`@/state/session-stats`, `byGame[gameId].bestScore`), `useToasts` (`@/state/toasts`, `push({title, body, type, duration})`), `useFocusTrap` (`@/hooks/useFocusTrap`).
- Score bound: targets are integers in `[1, MAX_CHALLENGE_SCORE]` where `MAX_CHALLENGE_SCORE = 9999` (the on-chain MAX-SCORE cap).
- The `by` URL param is ALWAYS rendered through `shortAddress` after an `isStacksAddress` check — never raw.
- Commit prefixes: conventional (`feat:`, `test:`). No `Co-Authored-By`. Stage explicit files. Do NOT push.
- Final gate: `npx tsc --noEmit`, `npm test`, `npm run lint`.

### Shared types (defined in Task 1, used throughout)

```ts
// lib/challenge-link.ts
export type Challenge = { gameId: GameId; target: number; by?: string };
// state/challenge.ts
export type ChallengeStatus = "pending" | "accepted" | "met";
```

---

### Task 1: `buildChallengeUrl` + types — `lib/challenge-link.ts`

**Files:**
- Create: `frontend/lib/challenge-link.ts`
- Test: `frontend/lib/challenge-link.test.ts`

**Interfaces:**
- Consumes: `GameId` (`@/lib/game-registry`), `isStacksAddress` (`@/lib/stacks-address`), `stacks` (`@/lib/stacks`).
- Produces: `type Challenge`; `MAX_CHALLENGE_SCORE: number`; `buildChallengeUrl({ gameId, score, by? }): string`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/challenge-link.test.ts
import { describe, expect, it } from "vitest";
import { buildChallengeUrl, MAX_CHALLENGE_SCORE } from "./challenge-link";

const ADDR = "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";

describe("buildChallengeUrl", () => {
  it("encodes game and score", () => {
    const url = new URL(buildChallengeUrl({ gameId: "snake", score: 150 }));
    expect(url.searchParams.get("challenge")).toBe("snake");
    expect(url.searchParams.get("score")).toBe("150");
    expect(url.searchParams.get("by")).toBeNull();
  });

  it("includes a valid by address", () => {
    const url = new URL(buildChallengeUrl({ gameId: "tetris", score: 80, by: ADDR }));
    expect(url.searchParams.get("by")).toBe(ADDR);
  });

  it("omits a malformed by address", () => {
    const url = new URL(buildChallengeUrl({ gameId: "snake", score: 10, by: "not-an-addr" }));
    expect(url.searchParams.get("by")).toBeNull();
  });

  it("caps at 9999", () => {
    expect(MAX_CHALLENGE_SCORE).toBe(9999);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/challenge-link.test.ts`
Expected: FAIL — cannot find module `./challenge-link`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/lib/challenge-link.ts
import { type GameId } from "./game-registry";
import { isStacksAddress } from "./stacks-address";
import { stacks } from "./stacks";

export type Challenge = { gameId: GameId; target: number; by?: string };

/** On-chain MAX-SCORE cap — the largest target a challenge may carry. */
export const MAX_CHALLENGE_SCORE = 9999;

export function buildChallengeUrl(c: {
  gameId: GameId;
  score: number;
  by?: string;
}): string {
  const u = new URL(stacks.appUrl);
  u.searchParams.set("challenge", c.gameId);
  u.searchParams.set("score", String(c.score));
  if (c.by && isStacksAddress(c.by)) u.searchParams.set("by", c.by);
  return u.toString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/challenge-link.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/challenge-link.ts frontend/lib/challenge-link.test.ts
git commit -m "feat(challenge): buildChallengeUrl + Challenge type + score cap"
```

---

### Task 2: `parseChallengeParams` — `lib/challenge-link.ts`

**Files:**
- Modify: `frontend/lib/challenge-link.ts`
- Test: `frontend/lib/challenge-link.test.ts`

**Interfaces:**
- Consumes: `GAME_IDS` (`@/lib/game-registry`), `isStacksAddress`, `Challenge`, `MAX_CHALLENGE_SCORE`.
- Produces: `parseChallengeParams(sp: URLSearchParams): Challenge | null`.

- [ ] **Step 1: Write the failing test (append)**

```ts
import { parseChallengeParams } from "./challenge-link";

function sp(q: Record<string, string>): URLSearchParams {
  return new URLSearchParams(q);
}

describe("parseChallengeParams", () => {
  it("parses a valid challenge with by", () => {
    expect(parseChallengeParams(sp({ challenge: "snake", score: "150", by: ADDR })))
      .toEqual({ gameId: "snake", target: 150, by: ADDR });
  });

  it("drops a malformed by but keeps the challenge", () => {
    expect(parseChallengeParams(sp({ challenge: "snake", score: "150", by: "xx" })))
      .toEqual({ gameId: "snake", target: 150, by: undefined });
  });

  it("rejects an unknown game", () => {
    expect(parseChallengeParams(sp({ challenge: "pong", score: "150" }))).toBeNull();
  });

  it("rejects non-numeric / out-of-range scores", () => {
    expect(parseChallengeParams(sp({ challenge: "snake", score: "abc" }))).toBeNull();
    expect(parseChallengeParams(sp({ challenge: "snake", score: "0" }))).toBeNull();
    expect(parseChallengeParams(sp({ challenge: "snake", score: "-5" }))).toBeNull();
    expect(parseChallengeParams(sp({ challenge: "snake", score: "10000" }))).toBeNull();
  });

  it("rejects when game or score is missing", () => {
    expect(parseChallengeParams(sp({ score: "150" }))).toBeNull();
    expect(parseChallengeParams(sp({ challenge: "snake" }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/challenge-link.test.ts`
Expected: FAIL — `parseChallengeParams` is not exported.

- [ ] **Step 3: Write minimal implementation (append; extend the game-registry import to add `GAME_IDS`)**

```ts
import { GAME_IDS, type GameId } from "./game-registry"; // GAME_IDS added to existing import

export function parseChallengeParams(sp: URLSearchParams): Challenge | null {
  const game = sp.get("challenge");
  if (!game || !(GAME_IDS as readonly string[]).includes(game)) return null;

  const raw = sp.get("score");
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const target = Number(raw);
  if (!Number.isInteger(target) || target < 1 || target > MAX_CHALLENGE_SCORE)
    return null;

  const by = sp.get("by");
  return {
    gameId: game as GameId,
    target,
    by: by && isStacksAddress(by) ? by : undefined,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/challenge-link.test.ts`
Expected: PASS (full file).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/challenge-link.ts frontend/lib/challenge-link.test.ts
git commit -m "feat(challenge): parseChallengeParams with strict validation"
```

---

### Task 3: Challenge store — `state/challenge.ts`

**Files:**
- Create: `frontend/state/challenge.ts`
- Test: `frontend/state/challenge.test.ts`

**Interfaces:**
- Consumes: `Challenge` (`@/lib/challenge-link`).
- Produces: `type ChallengeStatus = "pending" | "accepted" | "met"`; `useChallenge` store with `active: Challenge | null`, `status: ChallengeStatus | null`, and actions `setPending(c)`, `accept()`, `decline()`, `markMet()`, `clear()`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/state/challenge.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { useChallenge } from "./challenge";
import type { Challenge } from "@/lib/challenge-link";

const C: Challenge = { gameId: "snake", target: 150, by: undefined };

describe("useChallenge", () => {
  beforeEach(() => useChallenge.getState().clear());

  it("setPending sets active + pending", () => {
    useChallenge.getState().setPending(C);
    expect(useChallenge.getState().active).toEqual(C);
    expect(useChallenge.getState().status).toBe("pending");
  });

  it("accept moves to accepted", () => {
    useChallenge.getState().setPending(C);
    useChallenge.getState().accept();
    expect(useChallenge.getState().status).toBe("accepted");
  });

  it("markMet only transitions from accepted", () => {
    useChallenge.getState().setPending(C);
    useChallenge.getState().markMet();
    expect(useChallenge.getState().status).toBe("pending"); // no-op from pending
    useChallenge.getState().accept();
    useChallenge.getState().markMet();
    expect(useChallenge.getState().status).toBe("met");
  });

  it("decline and clear reset", () => {
    useChallenge.getState().setPending(C);
    useChallenge.getState().decline();
    expect(useChallenge.getState().active).toBeNull();
    expect(useChallenge.getState().status).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run state/challenge.test.ts`
Expected: FAIL — cannot find module `./challenge`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/state/challenge.ts
"use client";
import { create } from "zustand";
import type { Challenge } from "@/lib/challenge-link";

export type ChallengeStatus = "pending" | "accepted" | "met";

type ChallengeState = {
  active: Challenge | null;
  status: ChallengeStatus | null;
  setPending: (c: Challenge) => void;
  accept: () => void;
  decline: () => void;
  markMet: () => void;
  clear: () => void;
};

export const useChallenge = create<ChallengeState>((set) => ({
  active: null,
  status: null,
  setPending: (c) => set({ active: c, status: "pending" }),
  accept: () => set((s) => (s.status === "pending" ? { status: "accepted" } : s)),
  decline: () => set({ active: null, status: null }),
  markMet: () => set((s) => (s.status === "accepted" ? { status: "met" } : s)),
  clear: () => set({ active: null, status: null }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run state/challenge.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/state/challenge.ts frontend/state/challenge.test.ts
git commit -m "feat(challenge): in-memory challenge store with status transitions"
```

---

### Task 4: Met detection — `lib/challenge-progress.ts`

**Files:**
- Create: `frontend/lib/challenge-progress.ts`
- Test: `frontend/lib/challenge-progress.test.ts`

**Interfaces:**
- Consumes: `Challenge` (`@/lib/challenge-link`), `ChallengeStatus` (`@/state/challenge`), `GameId` (`@/lib/game-registry`).
- Produces: `shouldMarkMet(status, challenge, gameId, score, sessionBest): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/challenge-progress.test.ts
import { describe, expect, it } from "vitest";
import { shouldMarkMet } from "./challenge-progress";
import type { Challenge } from "./challenge-link";

const C: Challenge = { gameId: "snake", target: 150 };

describe("shouldMarkMet", () => {
  it("true when accepted, same game, run score reaches target", () => {
    expect(shouldMarkMet("accepted", C, "snake", 150, 0)).toBe(true);
  });
  it("true when session best reaches target", () => {
    expect(shouldMarkMet("accepted", C, "snake", 10, 200)).toBe(true);
  });
  it("false below target", () => {
    expect(shouldMarkMet("accepted", C, "snake", 149, 149)).toBe(false);
  });
  it("false for a different game", () => {
    expect(shouldMarkMet("accepted", C, "tetris", 999, 999)).toBe(false);
  });
  it("false unless status is accepted", () => {
    expect(shouldMarkMet("pending", C, "snake", 999, 999)).toBe(false);
    expect(shouldMarkMet("met", C, "snake", 999, 999)).toBe(false);
    expect(shouldMarkMet(null, C, "snake", 999, 999)).toBe(false);
  });
  it("false when no active challenge", () => {
    expect(shouldMarkMet("accepted", null, "snake", 999, 999)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/challenge-progress.test.ts`
Expected: FAIL — cannot find module `./challenge-progress`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/lib/challenge-progress.ts
import type { Challenge } from "./challenge-link";
import type { ChallengeStatus } from "@/state/challenge";
import type { GameId } from "./game-registry";

export function shouldMarkMet(
  status: ChallengeStatus | null,
  challenge: Challenge | null,
  gameId: GameId,
  score: number,
  sessionBest: number,
): boolean {
  if (status !== "accepted" || !challenge || challenge.gameId !== gameId) return false;
  return score >= challenge.target || sessionBest >= challenge.target;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/challenge-progress.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/challenge-progress.ts frontend/lib/challenge-progress.test.ts
git commit -m "feat(challenge): shouldMarkMet pure met-detection"
```

---

### Task 5: `ChallengeBanner` component — `components/shared/ChallengeBanner.tsx`

Presentational; renders the target/progress row and fires `onMet` once when the run reaches the target. Mounted in `GameShellWindow` (Task 9). No network, so it is easy to test in isolation.

**Files:**
- Create: `frontend/components/shared/ChallengeBanner.tsx`
- Test: `frontend/components/shared/ChallengeBanner.test.tsx`

**Interfaces:**
- Consumes: `Challenge` (`@/lib/challenge-link`), `ChallengeStatus` (`@/state/challenge`), `shouldMarkMet` (`@/lib/challenge-progress`), `GameId`/`GAMES` (`@/lib/game-registry`), `shortAddress` (`@/lib/stacks-address`), `formatScoreValue` (`@/lib/score-format`).
- Produces: `ChallengeBanner({ challenge, status, gameId, score, sessionBest, onMet })`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/components/shared/ChallengeBanner.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { ChallengeBanner } from "./ChallengeBanner";
import type { Challenge } from "@/lib/challenge-link";

// @ts-expect-error -- React act flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const C: Challenge = { gameId: "snake", target: 150, by: undefined };

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => {
  if (root && container) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("ChallengeBanner", () => {
  it("renders nothing for a different game", () => {
    const html = renderToStaticMarkup(
      <ChallengeBanner challenge={C} status="accepted" gameId="tetris" score={0} sessionBest={0} onMet={() => {}} />,
    );
    expect(html).toBe("");
  });

  it("renders the target while accepted and below target", () => {
    const html = renderToStaticMarkup(
      <ChallengeBanner challenge={C} status="accepted" gameId="snake" score={20} sessionBest={20} onMet={() => {}} />,
    );
    expect(html).toContain("150");
    expect(html.toLowerCase()).toContain("beat");
  });

  it("shows crushed copy when status is met", () => {
    const html = renderToStaticMarkup(
      <ChallengeBanner challenge={C} status="met" gameId="snake" score={200} sessionBest={200} onMet={() => {}} />,
    );
    expect(html.toLowerCase()).toContain("crushed");
  });

  it("calls onMet once when the run reaches the target", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onMet = vi.fn();
    act(() => {
      root!.render(
        <ChallengeBanner challenge={C} status="accepted" gameId="snake" score={150} sessionBest={0} onMet={onMet} />,
      );
    });
    expect(onMet).toHaveBeenCalledTimes(1);
  });

  it("does not call onMet below the target", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onMet = vi.fn();
    act(() => {
      root!.render(
        <ChallengeBanner challenge={C} status="accepted" gameId="snake" score={100} sessionBest={100} onMet={onMet} />,
      );
    });
    expect(onMet).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run components/shared/ChallengeBanner.test.tsx`
Expected: FAIL — cannot find module `./ChallengeBanner`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/components/shared/ChallengeBanner.tsx
"use client";
import { useEffect } from "react";
import { type GameId, GAMES } from "@/lib/game-registry";
import { shortAddress } from "@/lib/stacks-address";
import { formatScoreValue } from "@/lib/score-format";
import { shouldMarkMet } from "@/lib/challenge-progress";
import type { Challenge } from "@/lib/challenge-link";
import type { ChallengeStatus } from "@/state/challenge";

export function ChallengeBanner({
  challenge, status, gameId, score, sessionBest, onMet,
}: {
  challenge: Challenge | null;
  status: ChallengeStatus | null;
  gameId: GameId;
  score: number;
  sessionBest: number;
  onMet: () => void;
}) {
  useEffect(() => {
    if (shouldMarkMet(status, challenge, gameId, score, sessionBest)) onMet();
  }, [status, challenge, gameId, score, sessionBest, onMet]);

  if (!challenge || challenge.gameId !== gameId) return null;
  if (status !== "accepted" && status !== "met") return null;

  const who = challenge.by ? shortAddress(challenge.by) : "a friend";
  const target = formatScoreValue(gameId, challenge.target);

  return (
    <div
      className="challenge-banner"
      style={{
        padding: "4px 6px", borderBottom: "1px solid #d0d0c8",
        background: status === "met" ? "#e8f5e8" : "#fffbe6",
        color: "#444", fontSize: 10,
        fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
        fontWeight: "bold",
      }}
    >
      {status === "met"
        ? `✅ Challenge crushed! You beat ${target} in ${GAMES[gameId].label}.`
        : `🎯 Beat ${who}'s ${target} — your run ${formatScoreValue(gameId, score)} · session best ${formatScoreValue(gameId, sessionBest)}`}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run components/shared/ChallengeBanner.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/shared/ChallengeBanner.tsx frontend/components/shared/ChallengeBanner.test.tsx
git commit -m "feat(challenge): ChallengeBanner with one-shot onMet"
```

---

### Task 6: `ChallengeDialog` component — `components/dialogs/ChallengeDialog.tsx`

Presentational Accept prompt; wiring lives in Desktop (Task 9). Mirrors `WelcomeDialog` (props + `useFocusTrap`).

**Files:**
- Create: `frontend/components/dialogs/ChallengeDialog.tsx`
- Test: `frontend/components/dialogs/ChallengeDialog.test.tsx`

**Interfaces:**
- Consumes: `Challenge` (`@/lib/challenge-link`), `GAMES` (`@/lib/game-registry`), `shortAddress` (`@/lib/stacks-address`), `formatScoreValue` (`@/lib/score-format`), `useFocusTrap` (`@/hooks/useFocusTrap`).
- Produces: `ChallengeDialog({ challenge, onAccept, onDecline })`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/components/dialogs/ChallengeDialog.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { ChallengeDialog } from "./ChallengeDialog";
import type { Challenge } from "@/lib/challenge-link";

// @ts-expect-error -- React act flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const ADDR = "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";
const C: Challenge = { gameId: "snake", target: 150, by: ADDR };

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => {
  if (root && container) act(() => root!.unmount());
  container?.remove();
  root = null; container = null;
});

describe("ChallengeDialog", () => {
  it("renders the challenger, target, game, and both actions", () => {
    const html = renderToStaticMarkup(
      <ChallengeDialog challenge={C} onAccept={() => {}} onDecline={() => {}} />,
    );
    expect(html).toContain("150");
    expect(html).toContain("Snake");
    expect(html).toContain("SP2CM"); // shortAddress head
    expect(html).toContain("Accept &amp; Play");
    expect(html).toContain("Maybe later");
  });

  it("reads 'A friend' when by is absent", () => {
    const html = renderToStaticMarkup(
      <ChallengeDialog challenge={{ gameId: "snake", target: 150 }} onAccept={() => {}} onDecline={() => {}} />,
    );
    expect(html).toContain("A friend");
  });

  it("fires onAccept and onDecline", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onAccept = vi.fn(); const onDecline = vi.fn();
    act(() => {
      root!.render(<ChallengeDialog challenge={C} onAccept={onAccept} onDecline={onDecline} />);
    });
    const buttons = Array.from(container.querySelectorAll("button"));
    const accept = buttons.find((b) => b.textContent?.includes("Accept"))!;
    const later = buttons.find((b) => b.textContent?.includes("Maybe later"))!;
    act(() => accept.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    act(() => later.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDecline).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run components/dialogs/ChallengeDialog.test.tsx`
Expected: FAIL — cannot find module `./ChallengeDialog`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/components/dialogs/ChallengeDialog.tsx
"use client";
import { type GameId, GAMES } from "@/lib/game-registry";
import { shortAddress } from "@/lib/stacks-address";
import { formatScoreValue } from "@/lib/score-format";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { Challenge } from "@/lib/challenge-link";

export function ChallengeDialog({
  challenge, onAccept, onDecline,
}: {
  challenge: Challenge;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const ref = useFocusTrap<HTMLDivElement>(onDecline);
  const who = challenge.by ? shortAddress(challenge.by) : "A friend";
  const target = formatScoreValue(challenge.gameId as GameId, challenge.target);
  const game = GAMES[challenge.gameId].label;

  return (
    <div
      ref={ref} tabIndex={-1} className="window" role="dialog" aria-modal="true"
      aria-label="Challenge invitation"
      style={{ position: "fixed", top: "30%", left: "50%", transform: "translateX(-50%)", width: 320, zIndex: 1000 }}
    >
      <div className="title-bar">
        <div className="title-bar-text">🎯 You&apos;ve been challenged</div>
      </div>
      <div className="window-body" style={{ fontSize: 12 }}>
        <p style={{ marginTop: 0 }}>
          <b>{who}</b> challenges you to beat <b>{target}</b> in <b>{game}</b>.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
          <button type="button" onClick={onDecline}>Maybe later</button>
          <button type="button" onClick={onAccept}>Accept &amp; Play</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run components/dialogs/ChallengeDialog.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/dialogs/ChallengeDialog.tsx frontend/components/dialogs/ChallengeDialog.test.tsx
git commit -m "feat(challenge): ChallengeDialog accept/decline prompt"
```

---

### Task 7: `ChallengeLoader` — `components/desktop/ChallengeLoader.tsx`

Reads the URL on mount, sets the pending challenge, strips the params.

**Files:**
- Create: `frontend/components/desktop/ChallengeLoader.tsx`
- Test: `frontend/components/desktop/ChallengeLoader.test.tsx`

**Interfaces:**
- Consumes: `parseChallengeParams` (`@/lib/challenge-link`), `useChallenge` (`@/state/challenge`).
- Produces: `ChallengeLoader()` (renders null).

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/components/desktop/ChallengeLoader.test.tsx
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChallengeLoader } from "./ChallengeLoader";
import { useChallenge } from "@/state/challenge";

// @ts-expect-error -- React act flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const ADDR = "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";

let root: Root; let container: HTMLDivElement;
beforeEach(() => {
  useChallenge.getState().clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.history.replaceState({}, "", "/");
});

describe("ChallengeLoader", () => {
  it("parses a challenge URL into the store and strips the params", () => {
    window.history.replaceState({}, "", `/?challenge=snake&score=150&by=${ADDR}&keep=1`);
    act(() => root.render(<ChallengeLoader />));
    const st = useChallenge.getState();
    expect(st.active).toEqual({ gameId: "snake", target: 150, by: ADDR });
    expect(st.status).toBe("pending");
    expect(window.location.search).not.toContain("challenge");
    expect(window.location.search).toContain("keep=1"); // unrelated params preserved
  });

  it("does nothing for a URL without a valid challenge", () => {
    window.history.replaceState({}, "", "/?foo=bar");
    act(() => root.render(<ChallengeLoader />));
    expect(useChallenge.getState().active).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run components/desktop/ChallengeLoader.test.tsx`
Expected: FAIL — cannot find module `./ChallengeLoader`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/components/desktop/ChallengeLoader.tsx
"use client";
import { useEffect } from "react";
import { parseChallengeParams } from "@/lib/challenge-link";
import { useChallenge } from "@/state/challenge";

export function ChallengeLoader() {
  const setPending = useChallenge((s) => s.setPending);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const challenge = parseChallengeParams(url.searchParams);
    if (!challenge) return;
    setPending(challenge);
    // Strip the challenge params so a refresh / re-share does not re-trigger.
    url.searchParams.delete("challenge");
    url.searchParams.delete("score");
    url.searchParams.delete("by");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, [setPending]);

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run components/desktop/ChallengeLoader.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/desktop/ChallengeLoader.tsx frontend/components/desktop/ChallengeLoader.test.tsx
git commit -m "feat(challenge): ChallengeLoader reads + strips deep-link params"
```

---

### Task 8: "Challenge a friend" action — `components/shared/ShareActions.tsx`

**Files:**
- Modify: `frontend/components/shared/ShareActions.tsx`
- Test: `frontend/components/shared/ShareActions.test.tsx`

**Interfaces:**
- Consumes: `buildChallengeUrl` (`@/lib/challenge-link`), `useWallet` (`@/state/wallet`).
- Produces: a third button in `ShareActions` (no new exported symbol).

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/components/shared/ShareActions.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// @ts-expect-error -- React act flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/state/wallet", () => ({
  useWallet: (sel: (s: { address: string | null }) => unknown) =>
    sel({ address: "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV" }),
}));

import { ShareActions } from "./ShareActions";

let root: Root; let container: HTMLDivElement;
const writeText = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText } });
  writeText.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ShareActions challenge button", () => {
  it("copies a challenge deep link with game and score", async () => {
    act(() => root.render(<ShareActions gameId="snake" score={150} />));
    const btn = Array.from(container.querySelectorAll("button"))
      .find((b) => b.textContent?.includes("Challenge a friend"))!;
    await act(async () => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    const url = writeText.mock.calls[0][0] as string;
    expect(url).toContain("challenge=snake");
    expect(url).toContain("score=150");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run components/shared/ShareActions.test.tsx`
Expected: FAIL — no "Challenge a friend" button yet.

- [ ] **Step 3: Write minimal implementation**

Add to `ShareActions.tsx`: import `buildChallengeUrl` and `useWallet`, a `challengeCopied` state + timer (mirror the existing `copied` pattern), and a third button.

```tsx
// add imports
import { buildChallengeUrl } from "@/lib/challenge-link";
import { useWallet } from "@/state/wallet";
```

Inside the component, after the existing `copied` state:

```tsx
  const address = useWallet((s) => s.address);
  const [challengeCopied, setChallengeCopied] = useState(false);
  const challengeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (challengeTimer.current) clearTimeout(challengeTimer.current);
    },
    [],
  );

  async function handleChallenge() {
    try {
      await navigator.clipboard.writeText(
        buildChallengeUrl({ gameId, score, by: address ?? undefined }),
      );
      setChallengeCopied(true);
      if (challengeTimer.current) clearTimeout(challengeTimer.current);
      challengeTimer.current = setTimeout(() => setChallengeCopied(false), 2000);
    } catch {
      // clipboard unavailable — leave label as-is
    }
  }
```

Add the button after the "Copy link" button in the returned fragment:

```tsx
      <button type="button" onClick={handleChallenge}>
        {challengeCopied ? "Challenge copied!" : "Challenge a friend"}
      </button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run components/shared/ShareActions.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/shared/ShareActions.tsx frontend/components/shared/ShareActions.test.tsx
git commit -m "feat(challenge): Challenge-a-friend copy-link action in ShareActions"
```

---

### Task 9: Wire into `GameShellWindow` + `Desktop` + full gate

Two thin integrations (banner host + loader/dialog mount + celebration handler), then the full project gate.

**Files:**
- Modify: `frontend/components/shared/GameShellWindow.tsx`
- Modify: `frontend/components/desktop/Desktop.tsx`

**Interfaces:**
- Consumes: `ChallengeBanner`, `ChallengeLoader`, `ChallengeDialog`, `useChallenge`, `playSuccess`, `useToasts`.

- [ ] **Step 1: Add the banner to `GameShellWindow.tsx`**

Add imports:

```tsx
import { ChallengeBanner } from "@/components/shared/ChallengeBanner";
import { useChallenge } from "@/state/challenge";
import { useToasts } from "@/state/toasts";
import { playSuccess } from "@/lib/sounds";
```

Inside the component (near the other store reads):

```tsx
  const challenge = useChallenge((s) => s.active);
  const challengeStatus = useChallenge((s) => s.status);
  const markMet = useChallenge((s) => s.markMet);
  const pushToast = useToasts((s) => s.push);

  function handleChallengeMet() {
    markMet();
    playSuccess();
    pushToast({
      title: "Challenge crushed!",
      body: `You beat the target in ${game.label}.`,
      type: "success",
    });
  }
```

Render `<ChallengeBanner .../>` immediately AFTER the `game-goal-row` div (before `<div className="game-shell-stage ...">`):

```tsx
        <ChallengeBanner
          challenge={challenge}
          status={challengeStatus}
          gameId={gameId}
          score={score}
          sessionBest={sessionStats.bestScore}
          onMet={handleChallengeMet}
        />
```

- [ ] **Step 2: Mount `ChallengeLoader` + `ChallengeDialog` in `Desktop.tsx`**

Add imports:

```tsx
import { ChallengeLoader } from "@/components/desktop/ChallengeLoader";
import { ChallengeDialog } from "@/components/dialogs/ChallengeDialog";
import { useChallenge } from "@/state/challenge";
import { useWindows } from "@/state/window-manager";
```

In the component body (mirror the existing `welcomeOpen` wiring):

```tsx
  const challenge = useChallenge((s) => s.active);
  const challengeStatus = useChallenge((s) => s.status);
  const acceptChallenge = useChallenge((s) => s.accept);
  const declineChallenge = useChallenge((s) => s.decline);
  const openWindow = useWindows((s) => s.open);
```

(If `useWindows`'s `open` is already bound in `Desktop.tsx`, reuse that binding instead of re-declaring.)

Near the existing `<WelcomeDialog … />` mount, add:

```tsx
        <ChallengeLoader />
        {challengeStatus === "pending" && challenge && (
          <ChallengeDialog
            challenge={challenge}
            onAccept={() => {
              acceptChallenge();
              openWindow(`game-${challenge.gameId}`);
            }}
            onDecline={declineChallenge}
          />
        )}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Full test suite**

Run: `cd frontend && npm test`
Expected: PASS — all suites, including the new challenge suites and everything pre-existing.

- [ ] **Step 5: Lint**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/shared/GameShellWindow.tsx frontend/components/desktop/Desktop.tsx
git commit -m "feat(challenge): wire banner + loader + accept dialog into the desktop"
```

---

## Self-Review

**Spec coverage:**
- Build/parse/validate deep link → Tasks 1, 2. ✓
- Challenge store + transitions → Task 3. ✓
- Met detection (pure) → Task 4; banner one-shot fire → Task 5. ✓
- Accept prompt → Task 6; URL read + strip → Task 7. ✓
- Generate entry point (copy link) → Task 8. ✓
- Banner host + loader/dialog mount + celebration (toast + `playSuccess`) → Task 9. ✓
- Security (validated `by`, `shortAddress`-only render, score clamp, URL strip) → Tasks 2, 5, 6, 7. ✓
- Testing per the project `createRoot`/`renderToStaticMarkup` pattern → Tasks 5–8. ✓
- YAGNI exclusions (no on-chain, no history, no X-intent for challenge, no username) → honored. ✓

Note: the spec described the banner inline in `GameShellWindow`; the plan extracts it into a presentational `ChallengeBanner` (Task 5) so the met-detection effect is testable without mounting the network-heavy shell. This is a structure refinement consistent with the spec's "banner reuses GameShellWindow as host" intent — `GameShellWindow` is still the host (Task 9).

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step is complete. ✓

**Type consistency:** `Challenge` (Task 1), `ChallengeStatus` (Task 3), `shouldMarkMet` signature (Task 4) are used unchanged in Tasks 5, 9. `buildChallengeUrl`/`parseChallengeParams` signatures match their call sites (Tasks 7, 8). `ChallengeBanner`/`ChallengeDialog` prop shapes match their Task-9 mounts. CTA uses `open(\`game-${gameId}\`)` consistently. ✓
