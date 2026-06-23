# Challenge a Friend — Design Spec

**Date:** 2026-06-23
**Status:** Approved design, pending implementation plan
**Scope:** Frontend only. No contract change. No backend. No new dependency.

This is sub-project **#2 of 3** in the retention/social/economic roadmap
([retention nudge](2026-06-23-retention-nudge-design.md) was #1, already merged).
Economic (#3) is a separate later cycle and touches the mainnet contract.

## 1. Problem & Goal

XP Arcade already shares a player's score as an Open-Graph preview
(`ShareActions` → `/share/score/<tokenId>`), but that link lands on a static
social-preview page, not in the playable app, and carries no competitive call to
action. There is **no deep link into the app** today — the root (`app/page.tsx` /
`Desktop.tsx`) ignores all query params.

**Goal:** a "Challenge a friend" share action that produces a **beat-my-score
deep link**. When a friend opens it, the app greets them with an Accept & Play
prompt, launches the challenged game, and shows a live "beat `<score>`" target
until they crush it. Pure client-side; advisory only (no on-chain effect, score
stays client-trusted like the rest of the app).

**Non-goal (YAGNI):** on-chain challenges, challenge history/persistence, an
X-intent variant for the challenge link (copy-link only), and any username
system. Identity is the challenger's truncated wallet address.

## 2. Architecture Overview

Six units, all under `frontend/`:

| Unit | Type | Responsibility |
|------|------|----------------|
| `lib/challenge-link.ts` | pure | build the deep-link URL; parse + validate incoming params into a `Challenge` |
| `state/challenge.ts` | zustand (in-memory) | hold the active challenge + status; transitions |
| `components/desktop/ChallengeLoader.tsx` | React | on app load, read the URL, set the pending challenge, strip the param |
| `components/dialogs/ChallengeDialog.tsx` | React | the Win95 "Accept & Play / Maybe later" prompt |
| `components/shared/GameShellWindow.tsx` | React (modify) | render the live challenge banner + detect "met" |
| `components/shared/ShareActions.tsx` | React (modify) | add the "Challenge a friend" copy-link action |

### Why these boundaries

- All decision logic (URL build, param validation, banner/label text) is a pure
  function of explicit inputs in `challenge-link.ts`, so every validation edge
  (bad game, out-of-range score, malformed address, missing params) is unit
  testable without a DOM. The React units only do I/O: read the URL, render,
  open windows, copy to clipboard.
- The active challenge is the one piece of cross-component state (loader sets it,
  dialog and banner read it), so it lives in one small store mirroring the
  existing focused-store pattern (`state/*.ts`).
- The banner reuses `GameShellWindow` — the single shell shared by all six game
  windows, which already receives `gameId` + live `score` and renders a goal row.
  No per-game wiring.

## 3. Challenge Link — `lib/challenge-link.ts`

```ts
import { GAME_IDS, type GameId } from "./game-registry";
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

/** Parse + validate incoming params. Returns null unless game + score are both
 *  valid; a missing/malformed `by` is dropped (challenge still stands). */
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

Validation rules (authoritative):
- `challenge` must be an exact member of `GAME_IDS`.
- `score` must match `^\d+$` and resolve to an integer in `[1, MAX_CHALLENGE_SCORE]`.
- `by`, when present, must pass `isStacksAddress`; otherwise it is dropped (the
  challenge is still valid, just anonymous). `by` is **only ever rendered through
  `shortAddress`** — never raw — so no script can ride in via the URL.

## 4. Challenge Store — `state/challenge.ts`

```ts
export type ChallengeStatus = "pending" | "accepted" | "met";

type ChallengeState = {
  active: Challenge | null;
  status: ChallengeStatus | null;
  setPending: (c: Challenge) => void;  // active = c, status = "pending"
  accept: () => void;                   // status = "accepted"
  decline: () => void;                  // active = null, status = null
  markMet: () => void;                  // status = "met" (no-op unless accepted)
  clear: () => void;                    // active = null, status = null
};
```

In-memory only — the challenge originates from a URL, so it must not persist
across reloads (the loader strips the param, so a reload simply has no challenge).
`markMet` only transitions from `"accepted"` so a met flash cannot fire before
the friend accepts.

## 5. Deep-Link Reader — `ChallengeLoader.tsx`

Mounted once inside `Desktop`. On mount:

1. Read `new URLSearchParams(window.location.search)`.
2. `const c = parseChallengeParams(sp)`.
3. If `c`, `useChallenge.getState().setPending(c)`.
4. Strip the challenge params from the URL with
   `window.history.replaceState({}, "", url.pathname + remainingSearch)` so a
   refresh or a re-share of the current URL does not re-trigger the prompt and
   the challenge params don't leak onward.

Renders nothing. SSR-guarded (`typeof window` check) — only runs client-side.

## 6. Accept Prompt — `ChallengeDialog.tsx`

When `status === "pending"`, render a Win95 dialog (follow the existing
`components/dialogs/*` pattern):

- Title: `🎯 You've been challenged`
- Body: ``${by ? shortAddress(by) : "A friend"} challenges you to beat ${target} in ${GAMES[gameId].label}.`` (score shown via `formatScoreValue(gameId, target)`)
- `[Accept & Play]` → `accept()` then `open(\`game-${gameId}\`)`.
- `[Maybe later]` → `decline()`.

Rendered from `Desktop` (alongside the other desktop-level dialogs), so it is
independent of whether any game window is open.

## 7. Challenge Banner — `GameShellWindow.tsx` (modify)

Read `active` + `status` from `useChallenge`. When `active?.gameId === gameId`
and `status` is `"accepted"` or `"met"`, render one banner row beneath the goal
row:

- Not yet met: `🎯 Beat ${by ? shortAddress(by) : "a friend"}'s ${target} — your run ${score} · session best ${sessionStats.bestScore}` (both via `formatScoreValue`).
- Met: `✅ Challenge crushed! You beat ${target} in ${game.label}.`

Met detection (in an effect): when `status === "accepted"` and
(`score >= target` **or** `sessionStats.bestScore >= target`), call `markMet()`
once and celebrate — push a success toast via `useToasts` and play the existing
achievement sound (`lib/sounds.ts`). The effect guards on `status` so it fires
exactly once.

The banner reuses the existing goal-row styling idiom (same font/padding/border
language) so it reads as native chrome, not a bolt-on.

## 8. Generate Entry Point — `ShareActions.tsx` (modify)

Add a third button, **"Challenge a friend"**, beside "Share on X" / "Copy link":

```tsx
async function handleChallenge() {
  const url = buildChallengeUrl({ gameId, score, by: address ?? undefined });
  try {
    await navigator.clipboard.writeText(url);
    setChallengeCopied(true);
    // reset label after 2s, mirroring the existing copied-timer pattern
  } catch { /* clipboard unavailable — leave label */ }
}
```

`address` comes from `useWallet`. When disconnected, `by` is omitted and the link
reads as an anonymous "beat `<score>`" challenge. Button label toggles
`Challenge a friend` → `Challenge copied!` for 2s, reusing the component's
existing copied-timer cleanup.

## 9. Data Flow

```
SHARER (game over / mint):
  ShareActions "Challenge a friend"
    → buildChallengeUrl({ gameId, score, by: address })
    → clipboard

FRIEND opens link:
  app load → ChallengeLoader
    → parseChallengeParams(location.search)
        null  → nothing
        valid → setPending(c) + strip URL params
  status "pending" → ChallengeDialog
    Accept & Play → accept() + open(`game-<id>`)
    Maybe later   → decline()
  game window → GameShellWindow banner (status accepted)
    run score / session best ≥ target → markMet() + toast + sound → "crushed" banner
```

## 10. Testing

**`lib/challenge-link.test.ts`** (pure, exhaustive):
- `buildChallengeUrl`: includes game + score; includes `by` when a valid address;
  omits `by` when absent or malformed.
- `parseChallengeParams`: valid → `Challenge`; unknown game → null; non-numeric /
  zero / negative / `> MAX_CHALLENGE_SCORE` score → null; missing game or score →
  null; malformed `by` → challenge with `by` undefined; valid `by` → preserved.

**`state/challenge.test.ts`:** `setPending`→pending; `accept`→accepted;
`markMet` only from accepted (no-op from pending); `decline`/`clear` reset.

**`components/dialogs/ChallengeDialog.test.tsx`** (project `createRoot`+`act`
pattern, NOT `@testing-library/react`): renders only when pending; Accept calls
`accept` + `open("game-<id>")`; Maybe later calls `decline`.

**`components/shared/GameShellWindow`** banner behavior: with an accepted
challenge for this game, a `score` ≥ target triggers `markMet` + a success toast
once; a non-matching `gameId` renders no banner. (Mount via the project pattern;
mock the stores.)

`ShareActions` copy: clicking "Challenge a friend" writes `buildChallengeUrl(...)`
to a mocked clipboard.

All gates green before done: `npx tsc --noEmit`, `npm test`, `npm run lint`.

## 11. Files Touched

New:
- `frontend/lib/challenge-link.ts` + `.test.ts`
- `frontend/state/challenge.ts` + `.test.ts`
- `frontend/components/desktop/ChallengeLoader.tsx`
- `frontend/components/dialogs/ChallengeDialog.tsx` + `.test.tsx`

Modified:
- `frontend/components/shared/GameShellWindow.tsx` (banner + met detection)
- `frontend/components/shared/ShareActions.tsx` (Challenge-a-friend button)
- `frontend/components/desktop/Desktop.tsx` (mount `ChallengeLoader` + `ChallengeDialog`)

No contract files. No API routes. No new dependencies.

## 12. Open Risks / Notes

- **Met detection source:** `score` (live run) and `sessionStats.bestScore` are
  both already available in `GameShellWindow`. A challenge accepted but for which
  the player already had a session best ≥ target would fire "met" immediately on
  open — acceptable (they did beat it). The plan resolves whether to compare on
  mount or only on subsequent score changes; mount-time compare is the simpler
  default and is fine.
- **Sound:** confirm the exact achievement sound export in `lib/sounds.ts` during
  planning; fall back to a success toast only if none fits.
- **Clipboard:** insecure-context / permission failures are swallowed (label
  stays), matching the existing `ShareActions` copy behavior.
