# Unify the Connect-Wallet Treatment

**Date:** 2026-06-25
**Status:** Design approved, pending spec review → plan

## 1. Context

A product-design pass over every "connect wallet" touchpoint found the flow is
functional (no dead-ends, after the earlier UX polish) but **inconsistent as a
system**, and carries one brand-correctness bug.

The six surfaces today:

| Surface | Icon | Label | "Why"? |
|---------|------|-------|--------|
| SystemTray (main entry) | `▣` | "Connect Wallet" | no |
| Start Menu | (menu icon) | "Connect Wallet" | no |
| WalletBalloon (auto-pops 3s) | `🦊` | "Connect Now" | yes |
| Mint dialog (game over) | — | "Connect to Mint" | yes (reassuring voice) |
| My NFTs | `💼` + `🔌` | "Connect Wallet" | yes |
| High Scores | `🔌` | "Connect wallet to check prizes" | partial |

Problems:
1. **Brand bug (highest priority):** `🦊` is the MetaMask fox = Ethereum. This
   is a **Stacks/Bitcoin** app (`@stacks/connect` → Leather/Xverse/Asigna). The
   fox misleads users about chain and supported wallets.
2. **Icon zoo:** five different icons for one action (`▣`, `🦊`, `💼`, `🔌`,
   none). The earlier UX polish added `💼`/`🔌`, contributing to this.
3. **Bare main entry:** the most-seen surfaces (tray, Start Menu, High Scores
   button) give no reason to connect, while less-seen ones do.
4. **Copy/voice drift:** casing ("Connect wallet" vs "Connect Wallet") and
   labels ("Connect Now"/"Connect to Mint"/"Connect Wallet") vary; the mint
   dialog's reassuring low-pressure voice is not reused.

## 2. Goal

One consistent Connect-Wallet treatment across all six surfaces: a single
brand-correct icon (Stacks logo, wallet-agnostic), unified casing/voice, and a
short "why" where there is room — without touching `connect()` /
`@stacks/connect`, balloon timing/dismiss, or wallet state.

## 3. Decisions

- **Icon = the Stacks chain logo**, not a specific wallet logo. Rationale:
  `@stacks/connect` opens a multi-wallet picker, so a Leather-specific mark
  would mislead the same way the fox does. The Stacks logo is brand-correct and
  wallet-agnostic.
- **Contextual label suffixes are allowed** ("Connect to Mint", "Connect to
  check prizes") because a context label beats a rigid one — provided the icon,
  the base verb "Connect", title-casing, and the low-pressure voice are
  consistent.

## 4. Components

1. `frontend/components/shared/StacksLogo.tsx` — inline SVG of the **official
   Stacks logo mark**, props `{ size?: number; title?: string }`, `aria-hidden`
   by default. Single-color via `fill="currentColor"` so each call site sets the
   color (Stacks purple `#5546FF` on light/silver surfaces; may use a lighter
   value on the dark wallpaper if contrast needs it). Scales cleanly 12px→40px.
   The exact SVG path is sourced from the official Stacks brand asset during
   implementation (see §6), not hand-drawn, to guarantee an accurate mark.
2. `frontend/lib/wallet-connect-copy.ts` — the single copy source:
   `export const WALLET_CONNECT = { label: "Connect Wallet", tagline: "Save scores & claim prizes" } as const;`
   Surfaces import `label` / `tagline` rather than hard-coding strings.

## 5. Per-surface changes

Each surface: replace its current icon with `<StacksLogo>`, fix casing, reuse
the shared copy. No behavioral change.

- **SystemTray** (`components/desktop/SystemTray.tsx`): `▣` → `<StacksLogo>`;
  keep "Connect Wallet"; set the button `title`/`aria-label` to include the
  tagline ("Connect Wallet — Save scores & claim prizes").
- **Start Menu** (`components/desktop/StartMenu.tsx`): use `<StacksLogo>` as the
  item icon; label "Connect Wallet".
- **WalletBalloon** (`components/desktop/WalletBalloon.tsx`): `🦊` →
  `<StacksLogo>`; title "Connect Wallet" (was "Connect your wallet"); CTA
  "Connect Wallet" (was "Connect Now"); body unchanged. (TrayBalloon's `icon`
  prop currently takes a string emoji — extend it to accept a `ReactNode` so the
  logo component can be passed; preserve existing emoji callers.)
- **Mint dialog** (`components/shared/SharedMintDialog.tsx`): keep the reassuring
  "Connect a wallet only when you are ready to mint this score." line and the
  contextual "Connect to Mint" button; prepend `<StacksLogo>` to the button.
- **My NFTs** (`components/windows/MyNftsWindow.tsx`): EmptyState `💼` →
  `<StacksLogo>`; title "Connect Wallet" (was "Connect your wallet"); button
  drops `🔌`, uses `<StacksLogo>` + "Connect Wallet"; body unchanged.
  (EmptyState's `emoji` prop is a string; either pass the logo through a new
  optional `icon?: ReactNode` prop or render the logo in the `actionLabel`.
  Prefer extending EmptyState minimally with an optional `icon` that overrides
  `emoji` when present — keep all existing emoji callers working.)
- **High Scores** (`components/windows/HighScoreWindow.tsx`): button `🔌` →
  `<StacksLogo>`; label "Connect to check prizes" (title-cased, was
  "Connect wallet to check prizes").

## 6. Sourcing the Stacks logo

During implementation, fetch the official Stacks logo SVG (e.g. from the Stacks
/ Hiro brand assets) and inline its path(s) into `StacksLogo.tsx` with a
`fill="currentColor"` and a square `viewBox`. Verify the rendered mark visually
in the Playwright spot-check. Do not approximate the logo by hand.

## 7. Testing / verification

- `StacksLogo` and the copy constant are presentational/trivial; add a light
  `renderToStaticMarkup` test asserting `StacksLogo` emits an `<svg>` and that
  surfaces no longer render the fox (e.g. WalletBalloon test asserts no `🦊`).
- Keep existing tests green (TrayBalloon, MyNfts, etc.), `tsc` clean, prod build
  OK.
- Playwright spot-check: tray button, the auto-popping balloon, and a
  wallet-gated empty state all show the Stacks mark, correct labels, no fox.

## 8. Non-goals (YAGNI)

- No change to `connect()` / `@stacks/connect` / wallet selection.
- No change to balloon timing, dismissal, or session-gating.
- No new connect prompts; no removal of existing surfaces.
- No post-connect ("connected as …") redesign.

## 9. Build approach

Small, smallest-possible green commits: (1) `StacksLogo` + copy constant
(+ source the SVG); (2) extend `TrayBalloon`/`EmptyState` icon props minimally;
(3) apply to the six surfaces (can be one commit or split tray/menu/balloon vs
window CTAs); (4) verify (gate + Playwright). Each step leaves tests/tsc/build
green.
