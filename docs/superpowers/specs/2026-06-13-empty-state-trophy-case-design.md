# Aspirational Empty State — "Trophy Case" — Design Spec

**Date:** 2026-06-13
**Status:** Approved (brainstorming) — ready for implementation plan
**Author:** brainstorming session

## 1. Goal

Turn the bland "No NFTs yet. Play a game and mint a score!" one-liner shown in the
**My NFTs** window (connected wallet, zero NFTs) into an aspirational, on-brand Win95
empty state with a clear call to action — the "your trophy case is empty, go fill it"
moment. This nudges a connected-but-not-yet-minted visitor straight into a game.

Cosmetic, client-only. No contract / `.clar` change, no new dependency.

## 2. Scope (decisions locked in brainstorming)

- **One surface only:** the My NFTs window branch where the wallet is connected and
  the fetched NFT list is empty (`nfts?.length === 0`).
- **Reusable component:** a presentational `EmptyState` (emoji + title + body +
  optional action button), built so the other empty states (not-connected,
  leaderboard, profile) can adopt it later, but **only wired into My NFTs now**
  (YAGNI on the others).
- **CTA:** "▶ Play a game" opens the most recently played game (`lastGame ?? "snake"`,
  read from the existing `localStorage["xp-arcade:last-game"]` key) via
  `useWindows().open(\`game-${id}\`)`. It does not auto-close the My NFTs window.
- **Out of scope:** the not-connected / leaderboard-empty / profile-empty states (not
  selected), any contract change, any wallet-connect changes, the filtered-empty
  state in My NFTs (already has its own styled "Clear filters" box — leave as is).

## 3. Architecture

A small presentational component + a one-branch swap in the existing window.

| File | Status | Responsibility |
|------|--------|----------------|
| `frontend/components/shared/EmptyState.tsx` | create | Presentational empty-state box. Props `{ emoji, title, body, actionLabel?, onAction? }`. Renders the action button only when both `actionLabel` and `onAction` are provided. |
| `frontend/components/shared/EmptyState.test.tsx` | create | Render tests. |
| `frontend/components/windows/MyNftsWindow.tsx` | modify | Replace the `nfts?.length === 0` one-liner with `<EmptyState>` (trophy-case copy + "Play a game" CTA). |

Reference (do not modify): `frontend/components/dialogs/WelcomeDialog.tsx` /
`frontend/components/player/LevelBadge.tsx` (presentational + `renderToStaticMarkup`
test pattern); `frontend/components/desktop/Desktop.tsx` (the `lastGame` /
`localStorage["xp-arcade:last-game"]` read pattern and `open(\`game-${id}\`)`).
`frontend/components/shared/` already exists.

### 3.1 `EmptyState` component

```tsx
"use client";

export function EmptyState({
  emoji,
  title,
  body,
  actionLabel,
  onAction,
}: {
  emoji: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "20px 12px",
        border: "1px solid #d0d0c8",
        background: "#f5f5f0",
        display: "grid",
        gap: 6,
        justifyItems: "center",
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 40, lineHeight: 1 }}>
        {emoji}
      </span>
      <p style={{ margin: 0, fontWeight: "bold", fontSize: 13 }}>{title}</p>
      <p style={{ margin: 0, fontSize: 11, color: "#555", maxWidth: 280 }}>{body}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          className="default"
          onClick={onAction}
          style={{ marginTop: 4, fontWeight: "bold" }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
```

The emoji is decorative → `aria-hidden`. The action renders only when both
`actionLabel` and `onAction` are present (so the component is usable as a pure
message too).

### 3.2 Wiring in `MyNftsWindow`

The window already has a `useWindows` open action available and renders this branch:

```tsx
{nfts?.length === 0 && (
  <p className="text-sm text-gray-500">
    No NFTs yet. Play a game and mint a score!
  </p>
)}
```

Replace it with an `EmptyState`:

```tsx
{nfts?.length === 0 && (
  <EmptyState
    emoji="🏆"
    title="Your trophy case is empty"
    body="Mint your first score to start your Score NFT collection."
    actionLabel="▶ Play a game"
    onAction={() => open(`game-${lastPlayedGame()}`)}
  />
)}
```

where `lastPlayedGame()` resolves the last-played game id from
`localStorage["xp-arcade:last-game"]`, falling back to `"snake"`, validated against
`GAMES` (same logic the desktop already uses). Implementation detail: a small local
helper inside `MyNftsWindow` (or an inline read) — do not add a new shared module for
this; mirror the desktop's existing guard (`stored && stored in GAMES ? stored : null`),
defaulting to `"snake"`. `open` is the window-manager open action already in scope in
this component (it imports `useWindows`); if it is not yet destructured, add
`const open = useWindows((s) => s.open);`.

## 4. UI / Layout

```
+------------------------------------------+
|                  🏆                       |
|        Your trophy case is empty          |
|   Mint your first score to start your     |
|        Score NFT collection.              |
|             [ ▶ Play a game ]             |
+------------------------------------------+
```

Win95 inset-ish bordered panel matching the existing filtered-empty box styling in
the same window (`border: 1px solid #d0d0c8; background: #f5f5f0`).

## 5. Testing (TDD)

- `frontend/components/shared/EmptyState.test.tsx` — `renderToStaticMarkup`:
  - renders emoji, title, and body text;
  - renders the action button (with its label) when `actionLabel` + `onAction` are
    given;
  - does **not** render a `<button` when no action is provided.
- No dedicated MyNftsWindow test (the wiring is a one-line branch swap; the repo's
  windows are not click-tested — consistent with existing convention). The full suite
  + `tsc` + `lint` cover the integration.

Verification pass after wiring: `npx tsc --noEmit`, `npm test` (all green, new file
present), `npm run lint`.

## 6. Non-goals / constraints

- No contract change; no `.clar` edits; no new public contract functions.
- No new npm dependency, no new asset.
- Do not touch the not-connected / leaderboard-empty / profile-empty states or the
  filtered-empty box in this scope.
- Keep `EmptyState` presentational (no hooks/fetching) so it is render-testable like
  `WelcomeDialog` / `LevelBadge` / `PrizePoolHero`.
- Do not add a new shared module just to read `lastGame`; reuse the desktop's existing
  localStorage read pattern locally.
