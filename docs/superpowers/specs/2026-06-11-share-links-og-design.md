# Share Links + OG Score Cards — Design

**Date:** 2026-06-11 · **Status:** Approved (user, 2026-06-11)

## Goal

Turn every minted Score NFT into a shareable link that unfurls with a rich
preview on X / Discord / Telegram, so each mint doubles as acquisition
marketing. No contract changes; frontend + API routes only.

## Context — what already exists (commit `dd74c51`, 2026-05-27)

- `components/shared/ShareScoreCard.tsx` — client canvas card in the mint
  dialog, **Download PNG only** (no share link, no X intent).
- `lib/score-card.ts` — canvas drawing for the 1200×630 card (Win95 chrome,
  game bg color, score, rarity, player, txid footer).
- `components/windows/HallOfFameWindow.tsx` — Start-menu window archiving up
  to 5 closed seasons + live season per game via `get-season-prize`.
- `lib/metadata-route.ts` — `scoreMetadataResponseV3`: on-chain token lookup
  (token-id → game, score, player, season, rarity) + SIP-016 JSON + inline SVG.

**Decision:** keep `HallOfFameWindow` as the season archive. Do NOT build a
season selector into `HighScoreWindow` — it would duplicate the window.

## What we build

### 1. Public share page — `app/share/score/[id]/page.tsx`

- Server component. Resolves the token on-chain by reusing the lookup inside
  `lib/metadata-route.ts` (extract the lookup from the response builder if
  needed — keep one source of truth).
- Renders: game name + emoji, score, rarity badge, short player address,
  season, and a "Play XP Arcade" CTA linking to `/`.
- Unknown/unminted token id → 404 (mirror the metadata route's behavior).
- Page `generateMetadata`: `og:title` ("<Game> — <score> points · XP Arcade"),
  `og:description`, `og:image` → the OG image below, plus
  `twitter:card=summary_large_image`.

### 2. OG image — server-rendered PNG 1200×630

- Next `ImageResponse` via the `opengraph-image.tsx` file convention under
  `app/share/score/[id]/` (fallback: an explicit route handler if the dynamic
  convention misbehaves in this Next version).
- Visual: mirror `lib/score-card.ts` design language (game bg gradient, Win95
  panel, big score, rarity color via `rarityColor`, footer
  "xp-snake.vercel.app"). JSX/flexbox re-implementation — canvas code is not
  reusable in satori; keep the two visually aligned but independent.
- **Constraint:** `frontend/AGENTS.md` warns this Next.js differs from
  training data. Read `node_modules/next/dist/docs/` (metadata / OG image
  conventions) before writing this file.

### 3. Share buttons in `ShareScoreCard`

Add next to Download PNG:

- **Share on X** — `https://x.com/intent/post?text=<msg>&url=<link>`; message:
  "I scored <score> in <game> on XP Arcade 🕹️" .
- **Copy link** — clipboard write + brief "Copied!" state.

Token-id timing (mint dialog): immediately after broadcast the token id is
unknown. Behavior:

- Before confirmation: share text + `NEXT_PUBLIC_APP_URL` root link.
- Once the existing tx watcher reports confirmed and a token id is resolvable,
  upgrade the link to `/share/score/<id>`.
- If the id never resolves, the root link remains — share still works.

### 4. Share from My NFTs

Each `ScoreNft` already carries `id`, `gameId`, `score`. Add per-NFT
"Share on X" + "Copy link" actions in `MyNftsWindow` pointing at
`/share/score/<id>` (no canvas needed there — link only).

## Out of scope

- Leaderboard/High-Scores OG images (deferred).
- Any contract change; any anti-cheat; Web Share API.

## Testing

- Unit (Vitest): share-URL builder (intent URL encoding, link upgrade
  before/after token id), share-page data mapper, OG route returns `image/png`
  + 200 for a known-shape token and 404 for unknown.
- Existing suites must stay green: frontend 185 ✓, `tsc` clean, build ✓.
- Manual: paste a share link into an X post draft / Discord to verify unfurl
  (post-deploy).

## Task / commit breakdown (small green commits)

1. `feat(share): public share page for score NFTs` — page + extracted lookup + tests
2. `feat(share): server-rendered OG score card image` — opengraph-image + tests
3. `feat(share): X intent + copy-link in mint dialog score card`
4. `feat(share): share actions in My NFTs`
5. `docs(handoff): record share-links feature`
