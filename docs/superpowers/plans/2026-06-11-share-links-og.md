# Share Links + OG Score Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every minted Score NFT gets a public share link (`/share/score/[id]`) that unfurls with a server-rendered OG card on X/Discord/Telegram, plus Share-on-X / Copy-link buttons in the mint dialog and My NFTs.

**Architecture:** Extract the on-chain token lookup out of `lib/metadata-route.ts` into `lib/score-lookup.ts` (one source of truth). A server page + `opengraph-image.tsx` (Next 16 file convention, `ImageResponse` from `next/og`) consume it. A small pure `lib/share.ts` builds share URLs/text and resolves the minted token id from Hiro tx events; a reusable `ShareActions` client component renders the two buttons.

**Tech Stack:** Next.js 16.2.6 App Router, `next/og` ImageResponse, Vitest, Hiro extended API (`/extended/v1/tx/{txid}`), no contract changes.

**Spec:** `docs/superpowers/specs/2026-06-11-share-links-og-design.md`

**Conventions:** All paths below are relative to `frontend/` unless prefixed with repo root. Run commands from `frontend/`. Conventional commits, stage explicit files, never push. If `npx tsc --noEmit` fails on `.next` ghosts, `rm -rf .next` first (known gotcha).

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `lib/score-lookup.ts` | Create | On-chain `get-score-data` → typed `ScoreLookup \| null` |
| `lib/score-lookup.test.ts` | Create | Unit tests for the lookup mapping |
| `lib/metadata-route.ts` | Modify | Re-use `fetchScoreLookup`, keep rate-limit/400/404/500 behavior |
| `lib/share.ts` | Create | `scoreShareUrl`, `xIntentUrl`, `shareTitle`, `shareDescription`, `resolveMintedTokenId` |
| `lib/share.test.ts` | Create | Unit tests for all of the above |
| `app/share/score/[id]/page.tsx` | Create | Public share page + `generateMetadata` |
| `app/share/score/[id]/opengraph-image.tsx` | Create | 1200×630 PNG via `ImageResponse` |
| `lib/score-card.ts` | Modify | `export` the existing `GAME_BG` map |
| `components/shared/ShareActions.tsx` | Create | "Share on X" + "Copy link" buttons (client) |
| `components/shared/ShareScoreCard.tsx` | Modify | Accept `tokenId`, render `ShareActions` |
| `components/shared/SharedMintDialog.tsx` | Modify | Resolve minted token id after confirmation, pass down |
| `components/windows/MyNftsWindow.tsx` | Modify | `ShareActions` inside `NftDetailDialog` |
| repo root `HANDOFF.md` | Modify | Record the feature |

---

### Task 1: Extract `lib/score-lookup.ts`

**Files:**
- Create: `frontend/lib/score-lookup.ts`
- Create: `frontend/lib/score-lookup.test.ts`
- Modify: `frontend/lib/metadata-route.ts`

- [ ] **Step 1: Write the failing test**

`frontend/lib/score-lookup.test.ts` (mock pattern copied from `lib/metadata-route.test.ts`):

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchCallReadOnlyFunction } from "@stacks/transactions";
import { fetchScoreLookup } from "./score-lookup";

vi.mock("@stacks/transactions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stacks/transactions")>();
  return {
    ...actual,
    fetchCallReadOnlyFunction: vi.fn(),
    cvToValue: vi.fn((value) => value),
  };
});

const fetchReadOnly = vi.mocked(fetchCallReadOnlyFunction);
type ReadOnlyResult = Awaited<ReturnType<typeof fetchCallReadOnlyFunction>>;

function readOnlyResult(value: unknown): ReadOnlyResult {
  return value as ReadOnlyResult;
}

describe("fetchScoreLookup", () => {
  beforeEach(() => {
    fetchReadOnly.mockReset();
  });

  it("maps on-chain score data to a typed lookup", async () => {
    fetchReadOnly.mockResolvedValueOnce(readOnlyResult({
      score: "500",
      "player-name": "Satoshi",
      rarity: "Epic",
      season: "3",
      "game-id": "2",
    }));

    const data = await fetchScoreLookup(5);

    expect(data).toEqual({
      tokenId: 5,
      gameId: "tetris",
      gameName: "Tetris",
      score: 500,
      playerName: "Satoshi",
      rarity: "Epic",
      season: 3,
    });
  });

  it("returns null when the token does not exist", async () => {
    fetchReadOnly.mockResolvedValueOnce(readOnlyResult(null));
    expect(await fetchScoreLookup(7)).toBeNull();
  });

  it("returns null when the game-id is not registered", async () => {
    fetchReadOnly.mockResolvedValueOnce(readOnlyResult({
      score: "10",
      "player-name": "x",
      rarity: "Common",
      season: "1",
      "game-id": "99",
    }));
    expect(await fetchScoreLookup(7)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd frontend && npx vitest run lib/score-lookup.test.ts`
Expected: FAIL — `Cannot find module './score-lookup'` (or equivalent).

- [ ] **Step 3: Implement `lib/score-lookup.ts`**

```ts
import { fetchCallReadOnlyFunction, cvToValue, uintCV } from "@stacks/transactions";
import { stacks } from "@/lib/stacks";
import { unwrap } from "@/lib/cv-unwrap";
import { GAMES, gameIdFromOnchainOrNull, type GameId } from "@/lib/game-registry";

type RawScoreData = {
  score: string;
  "player-name": string;
  rarity: string;
  season: string;
  "game-id": string;
};

export type ScoreLookup = {
  tokenId: number;
  gameId: GameId;
  gameName: string;
  score: number;
  playerName: string;
  rarity: string;
  season: number;
};

// Returns null for unknown tokens / unregistered games; throws on network errors
// so callers can distinguish 404 from 500.
export async function fetchScoreLookup(tokenId: number): Promise<ScoreLookup | null> {
  const res = await fetchCallReadOnlyFunction({
    network: stacks.network,
    contractAddress: stacks.contractAddress,
    contractName: stacks.contractName,
    functionName: "get-score-data",
    functionArgs: [uintCV(tokenId)],
    senderAddress: stacks.contractAddress,
  });
  const v = unwrap<null | RawScoreData>(cvToValue(res));
  if (!v) return null;
  const gameId = gameIdFromOnchainOrNull(Number(v["game-id"]));
  if (!gameId) return null;
  return {
    tokenId,
    gameId,
    gameName: GAMES[gameId].label,
    score: Number(v.score),
    playerName: String(v["player-name"]),
    rarity: String(v.rarity ?? "Common"),
    season: Number(v.season ?? 1),
  };
}
```

- [ ] **Step 4: Run the new test — expect PASS**

Run: `npx vitest run lib/score-lookup.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Rewire `lib/metadata-route.ts` to use the lookup**

Replace the body of the `try` block (currently lines 48–99) — delete the local
`fetchCallReadOnlyFunction` call, `unwrap`, `gameIdFromOnchainOrNull` block, and
the `ScoreData` type at the top, and use:

```ts
  try {
    const data = await fetchScoreLookup(tokenId);
    if (!data) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "public, max-age=60" } },
      );
    }

    const svg = scoreSvg({
      tokenId,
      score: data.score,
      playerName: data.playerName,
      rarity: data.rarity,
      gameName: data.gameName,
    });
    return NextResponse.json(
      {
        name: `${data.gameName} Score #${tokenId}`,
        description: `On-chain proof of a ${data.gameName} game score: ${data.score}.`,
        image: "data:image/svg+xml;utf8," + encodeURIComponent(svg),
        attributes: [
          { trait_type: "Rarity", value: data.rarity },
          { trait_type: "Season", value: String(data.season) },
          { trait_type: "Score", value: String(data.score) },
          { trait_type: "Game", value: data.gameName },
        ],
      },
      {
        headers: {
          "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
        },
      },
    );
  } catch (e) {
    // ... keep the existing catch block unchanged ...
```

Imports: add `import { fetchScoreLookup } from "@/lib/score-lookup";` and remove
now-unused imports (`fetchCallReadOnlyFunction`, `cvToValue`, `uintCV`,
`unwrap`, `GAMES`, `gameIdFromOnchainOrNull` — keep `stacks` only if still used;
it is not, remove it too). Keep `scoreSvg`, `rateLimit`, `redactSensitiveText`,
`NextResponse`.

- [ ] **Step 6: Run the full frontend suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all tests pass (existing `lib/metadata-route.test.ts` exercises the
mocked `fetchCallReadOnlyFunction` through the new module — it stays green
because `score-lookup` calls the same mocked function), tsc clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/score-lookup.ts frontend/lib/score-lookup.test.ts frontend/lib/metadata-route.ts
git commit -m "refactor(metadata): extract on-chain score lookup"
```

---

### Task 2: `lib/share.ts` helpers

**Files:**
- Create: `frontend/lib/share.ts`
- Create: `frontend/lib/share.test.ts`

- [ ] **Step 1: Write the failing tests**

`frontend/lib/share.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchJson } from "./http";
import {
  scoreShareUrl,
  xIntentUrl,
  shareTitle,
  shareDescription,
  resolveMintedTokenId,
} from "./share";

vi.mock("./http", () => ({ fetchJson: vi.fn() }));
const mockFetchJson = vi.mocked(fetchJson);

describe("scoreShareUrl", () => {
  it("links to the share page when a token id exists", () => {
    expect(scoreShareUrl(42)).toBe("http://localhost:3000/share/score/42");
  });
  it("falls back to the app root without a token id", () => {
    expect(scoreShareUrl(null)).toBe("http://localhost:3000");
  });
});

describe("xIntentUrl", () => {
  it("builds an X intent with encoded text and link", () => {
    const u = new URL(xIntentUrl("snake", 1234, 42));
    expect(u.origin + u.pathname).toBe("https://x.com/intent/post");
    expect(u.searchParams.get("text")).toBe(
      "I scored 1234 in Snake on XP Arcade 🕹️",
    );
    expect(u.searchParams.get("url")).toBe(
      "http://localhost:3000/share/score/42",
    );
  });
});

describe("share copy", () => {
  const lookup = {
    tokenId: 42, gameId: "tetris" as const, gameName: "Tetris",
    score: 500, playerName: "Satoshi", rarity: "Epic", season: 3,
  };
  it("builds the OG title", () => {
    expect(shareTitle(lookup)).toBe("Tetris — 500 points · XP Arcade");
  });
  it("builds the OG description", () => {
    expect(shareDescription(lookup)).toBe(
      "Epic score NFT minted on Stacks · Season 3 · Play and climb the on-chain leaderboard.",
    );
  });
});

describe("resolveMintedTokenId", () => {
  beforeEach(() => mockFetchJson.mockReset());

  it("extracts the token id from the xp-score mint event", async () => {
    mockFetchJson.mockResolvedValueOnce({
      events: [
        { event_type: "stx_asset", asset: { asset_event_type: "transfer" } },
        {
          event_type: "non_fungible_token_asset",
          asset: {
            asset_event_type: "mint",
            asset_id:
              "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4::xp-score",
            value: { repr: "u42" },
          },
        },
      ],
    });
    expect(await resolveMintedTokenId("0xabc", "snake")).toBe(42);
  });

  it("returns null when there is no mint event", async () => {
    mockFetchJson.mockResolvedValueOnce({ events: [] });
    expect(await resolveMintedTokenId("0xabc", "snake")).toBeNull();
  });

  it("returns null when the API call fails", async () => {
    mockFetchJson.mockRejectedValueOnce(new Error("boom"));
    expect(await resolveMintedTokenId("0xabc", "snake")).toBeNull();
  });
});
```

> Note: `scoreShareUrl` uses `stacks.appUrl`, which defaults to
> `http://localhost:3000` in tests (no `NEXT_PUBLIC_APP_URL` set). If the suite
> environment does define it, assert against `stacks.appUrl` instead of the
> literal.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/share.test.ts`
Expected: FAIL — module `./share` not found.

- [ ] **Step 3: Implement `lib/share.ts`**

```ts
import { stacks } from "@/lib/stacks";
import { GAMES, type GameId } from "@/lib/game-registry";
import { fetchJson } from "@/lib/http";

export function scoreShareUrl(tokenId: number | null): string {
  return tokenId && tokenId > 0
    ? `${stacks.appUrl}/share/score/${tokenId}`
    : stacks.appUrl;
}

export function xIntentUrl(
  gameId: GameId,
  score: number,
  tokenId: number | null,
): string {
  const u = new URL("https://x.com/intent/post");
  u.searchParams.set(
    "text",
    `I scored ${score} in ${GAMES[gameId].label} on XP Arcade 🕹️`,
  );
  u.searchParams.set("url", scoreShareUrl(tokenId));
  return u.toString();
}

export function shareTitle(d: { gameName: string; score: number }): string {
  return `${d.gameName} — ${d.score} points · XP Arcade`;
}

export function shareDescription(d: { rarity: string; season: number }): string {
  return `${d.rarity} score NFT minted on Stacks · Season ${d.season} · Play and climb the on-chain leaderboard.`;
}

type TxEventsResponse = {
  events?: Array<{
    event_type?: string;
    asset?: {
      asset_event_type?: string;
      asset_id?: string;
      value?: { repr?: string };
    };
  }>;
};

// Resolves the freshly minted token id from the confirmed tx's NFT mint event.
export async function resolveMintedTokenId(
  txId: string,
  gameId: GameId,
): Promise<number | null> {
  const game = GAMES[gameId];
  const base = stacks.network.client?.baseUrl ?? "https://api.hiro.so";
  const data = await fetchJson<TxEventsResponse>(
    `${base}/extended/v1/tx/${txId}?event_limit=50`,
  ).catch(() => null);
  const assetId = `${game.contractAddress}.${game.contractName}::${game.nftAssetName}`;
  const mint = data?.events?.find(
    (e) =>
      e.event_type === "non_fungible_token_asset" &&
      e.asset?.asset_event_type === "mint" &&
      e.asset?.asset_id === assetId,
  );
  const repr = mint?.asset?.value?.repr;
  if (!repr || !/^u\d+$/.test(repr)) return null;
  return Number(repr.slice(1));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/share.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/share.ts frontend/lib/share.test.ts
git commit -m "feat(share): share-url, intent and minted-token-id helpers"
```

---

### Task 3: Public share page `/share/score/[id]`

**Files:**
- Create: `frontend/app/share/score/[id]/page.tsx`

- [ ] **Step 1: Implement the page**

(No new unit test: the data mapping and copy builders are already covered in
Tasks 1–2; the page itself is thin glue verified by build + manual check.)

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchScoreLookup, type ScoreLookup } from "@/lib/score-lookup";
import { shareTitle, shareDescription } from "@/lib/share";
import { rarityColor } from "@/lib/metadata-svg";
import { GAMES } from "@/lib/game-registry";

// Minted score data is immutable; cache aggressively. If the build rejects
// this export (e.g. cacheComponents mode), drop it — correctness is unaffected.
export const revalidate = 86400;

function parseTokenId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function lookupOrNull(id: string): Promise<ScoreLookup | null> {
  const tokenId = parseTokenId(id);
  if (!tokenId) return null;
  return fetchScoreLookup(tokenId).catch(() => null);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await lookupOrNull(id);
  if (!data) return { title: "XP Arcade" };
  return {
    title: shareTitle(data),
    description: shareDescription(data),
    openGraph: {
      title: shareTitle(data),
      description: shareDescription(data),
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function ScoreSharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await lookupOrNull(id);
  if (!data) notFound();
  const game = GAMES[data.gameId];

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "#008080",
      }}
    >
      <div className="window" style={{ width: "min(420px, 100%)" }}>
        <div className="title-bar">
          <div className="title-bar-text">
            {game.emoji} {data.gameName} Score Card
          </div>
        </div>
        <div className="window-body" style={{ display: "grid", gap: 8 }}>
          <div
            style={{
              border: "2px inset #dfdfdf",
              background: "#fff",
              padding: "18px 12px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 12, color: "#555" }}>Score</div>
            <div style={{ fontSize: 48, fontWeight: "bold", color: "#000080" }}>
              {data.score}
            </div>
            <div style={{ fontWeight: "bold", color: rarityColor(data.rarity) }}>
              {data.rarity}
            </div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>
              {data.playerName} · Season {data.season} · Token #{data.tokenId}
            </div>
          </div>
          <a
            href="/"
            style={{
              textAlign: "center",
              padding: "6px 10px",
              fontWeight: "bold",
              background: "#c0c0c0",
              border: "2px outset #dfdfdf",
              color: "#000",
              textDecoration: "none",
            }}
          >
            🕹️ Play XP Arcade
          </a>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify with build + suite**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: tests green, tsc clean, build succeeds listing the `/share/score/[id]` route.

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/share/score/[id]/page.tsx"
git commit -m "feat(share): public share page for score NFTs"
```

---

### Task 4: OG image `opengraph-image.tsx`

**Files:**
- Modify: `frontend/lib/score-card.ts` (line 8: `const GAME_BG` → `export const GAME_BG`)
- Create: `frontend/app/share/score/[id]/opengraph-image.tsx`

Before writing, skim
`frontend/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/opengraph-image.md`
and `.../04-functions/image-response.md` (AGENTS.md: this Next version may
differ from training data). Verified for 16.2.6: dynamic `opengraph-image.tsx`
receives `{ params }` as a Promise, exports `alt`/`size`/`contentType`,
`ImageResponse` comes from `next/og`.

- [ ] **Step 1: Export `GAME_BG` from `lib/score-card.ts`**

```ts
export const GAME_BG: Record<GameId, string> = {
```

- [ ] **Step 2: Implement `opengraph-image.tsx`**

Satori (ImageResponse) only supports flexbox JSX — no canvas reuse. Mirror the
card's visual language: game gradient, Win95 gray panel, navy title bar, big
score, rarity accent.

```tsx
import { ImageResponse } from "next/og";
import { fetchScoreLookup } from "@/lib/score-lookup";
import { GAME_BG } from "@/lib/score-card";
import { rarityColor } from "@/lib/metadata-svg";
import { GAMES } from "@/lib/game-registry";

export const alt = "XP Arcade score card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tokenId = Number(id);
  const data =
    Number.isInteger(tokenId) && tokenId > 0
      ? await fetchScoreLookup(tokenId).catch(() => null)
      : null;

  const bg = data ? GAME_BG[data.gameId] : "#1a1a2e";
  const accent = data ? rarityColor(data.rarity) : "#ffffff";
  const heading = data
    ? `${GAMES[data.gameId].emoji} ${data.gameName} Score Card`
    : "XP Arcade";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: `linear-gradient(135deg, ${bg}, #101010)`,
          padding: 54,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            background: "#c0c0c0",
            border: "3px solid #ffffff",
            borderRightColor: "#404040",
            borderBottomColor: "#404040",
            padding: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#000080",
              color: "#ffffff",
              padding: "10px 20px",
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            <span>{heading}</span>
            <span style={{ fontSize: 20, fontWeight: 400 }}>
              XP Arcade on Stacks
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexGrow: 1,
              alignItems: "center",
              justifyContent: "space-between",
              background: "#efefef",
              border: "2px solid #808080",
              margin: "16px 8px 8px",
              padding: "12px 40px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 170, fontWeight: 700, color: "#111111" }}>
                {data ? data.score : "?"}
              </span>
              <span style={{ fontSize: 42, fontWeight: 700, color: accent }}>
                {data ? data.rarity : "Play. Mint. Climb."}
              </span>
              <span style={{ fontSize: 28, color: "#333333", marginTop: 10 }}>
                {data
                  ? `${data.playerName} · Season ${data.season}`
                  : "On-chain arcade scores"}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 190,
                height: 190,
                background: accent,
                fontSize: 112,
              }}
            >
              {data ? GAMES[data.gameId].emoji : "🕹️"}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "6px 12px",
              fontSize: 20,
              color: "#111111",
            }}
          >
            <span>Play. Mint. Climb the leaderboard.</span>
            <span>xp-snake.vercel.app</span>
          </div>
        </div>
      </div>
    ),
    { ...size, emoji: "twemoji" },
  );
}
```

- [ ] **Step 3: Verify with build, then render locally**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; build lists `/share/score/[id]/opengraph-image`.

Then a live render against mainnet data (token 1 exists):

```bash
npm run dev &  sleep 8
curl -s -o /tmp/og.png -w "%{http_code} %{content_type}\n" http://localhost:3000/share/score/1/opengraph-image
kill %1
```

Expected: `200 image/png`. Open `/tmp/og.png` (Read tool) and confirm the card
renders with score + rarity (not the fallback).

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/score-card.ts "frontend/app/share/score/[id]/opengraph-image.tsx"
git commit -m "feat(share): server-rendered OG score card image"
```

---

### Task 5: `ShareActions` + mint dialog integration

**Files:**
- Create: `frontend/components/shared/ShareActions.tsx`
- Modify: `frontend/components/shared/ShareScoreCard.tsx`
- Modify: `frontend/components/shared/SharedMintDialog.tsx`

- [ ] **Step 1: Create `ShareActions.tsx`**

```tsx
"use client";
import { useState } from "react";
import { type GameId } from "@/lib/game-registry";
import { scoreShareUrl, xIntentUrl } from "@/lib/share";

export function ShareActions({
  gameId,
  score,
  tokenId,
}: {
  gameId: GameId;
  score: number;
  tokenId?: number | null;
}) {
  const [copied, setCopied] = useState(false);

  function handleShareOnX() {
    window.open(xIntentUrl(gameId, score, tokenId ?? null), "_blank", "noopener");
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(scoreShareUrl(tokenId ?? null));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable (permissions / insecure context) — leave label as-is
    }
  }

  return (
    <>
      <button type="button" onClick={handleShareOnX}>
        Share on X
      </button>
      <button type="button" onClick={handleCopy}>
        {copied ? "Copied!" : "Copy link"}
      </button>
    </>
  );
}
```

- [ ] **Step 2: Wire into `ShareScoreCard.tsx`**

Add prop `tokenId?: number | null` to the component signature and render the
actions next to Download (inside the existing buttons row, `ShareScoreCard.tsx:76-80`):

```tsx
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <ShareActions gameId={gameId} score={score} tokenId={tokenId} />
            <button onClick={handleDownload}>
              Download PNG
            </button>
          </div>
```

with `import { ShareActions } from "@/components/shared/ShareActions";`.

- [ ] **Step 3: Resolve the minted token id in `SharedMintDialog.tsx`**

The dialog already has `gameId`, `mintStatus` (`useMintTx`), and a `txId`
variable in scope (used at `SharedMintDialog.tsx:341`). Add:

```tsx
import { resolveMintedTokenId } from "@/lib/share";

  const [mintedTokenId, setMintedTokenId] = useState<number | null>(null);

  useEffect(() => {
    if (mintStatus !== "success" || !txId) return;
    let cancelled = false;
    resolveMintedTokenId(txId, gameId).then((id) => {
      if (!cancelled && id) setMintedTokenId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [mintStatus, txId, gameId]);
```

and pass it down (`SharedMintDialog.tsx:390`):

```tsx
        <ShareScoreCard
          gameId={gameId}
          score={score}
          player={address}
          rankHint={goal?.secondary}
          txId={txId}
          tokenId={mintedTokenId}
        />
```

Behavior per spec: before confirmation `tokenId` is null → share/copy use the
app root link; after confirmation the link upgrades to `/share/score/<id>`;
if resolution fails, the root link silently remains.

- [ ] **Step 4: Verify**

Run: `npm test && npx tsc --noEmit`
Expected: green/clean (existing SharedMintDialog/ShareScoreCard tests, if any,
still pass; no new unit test — the new logic lives in `lib/share.ts`, already
tested in Task 2).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/shared/ShareActions.tsx frontend/components/shared/ShareScoreCard.tsx frontend/components/shared/SharedMintDialog.tsx
git commit -m "feat(share): X intent + copy-link in mint dialog score card"
```

---

### Task 6: Share from My NFTs

**Files:**
- Modify: `frontend/components/windows/MyNftsWindow.tsx`

- [ ] **Step 1: Add `ShareActions` to `NftDetailDialog`**

In the actions row (`MyNftsWindow.tsx:519-539`), before the Close button, add
(only when the score is known — the share text needs it):

```tsx
              {typeof nft.score === "number" && (
                <ShareActions
                  gameId={nft.gameId}
                  score={nft.score}
                  tokenId={nft.id}
                />
              )}
              <button type="button" onClick={onClose}>
                Close
              </button>
```

with `import { ShareActions } from "@/components/shared/ShareActions";` at the top.

- [ ] **Step 2: Verify**

Run: `npm test && npx tsc --noEmit`
Expected: green/clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/windows/MyNftsWindow.tsx
git commit -m "feat(share): share actions in My NFTs detail dialog"
```

---

### Task 7: Docs + final verification

**Files:**
- Modify: repo root `HANDOFF.md`

- [ ] **Step 1: Full verification**

Run from `frontend/`: `npm test && npx tsc --noEmit && npm run build && npm run lint`
Expected: everything green. (If tsc trips on `.next` ghost files, `rm -rf .next` and re-run.)

- [ ] **Step 2: Update `HANDOFF.md`**

In the "What changed" area (or a new row), record: share links + OG cards —
`/share/score/[id]` page, `opengraph-image` PNG, ShareActions in mint dialog +
My NFTs, token-id resolution from tx events. Add a manual post-deploy check to
the smoke-test section:

```markdown
- [ ] Paste `https://xp-snake.vercel.app/share/score/1` into an X draft /
  Discord message → rich preview card renders (game, score, rarity).
```

- [ ] **Step 3: Commit**

```bash
git add HANDOFF.md
git commit -m "docs(handoff): record share-links + OG card feature"
```

---

## Out of scope (per spec)

Leaderboard OG images, Web Share API, contract changes, anti-cheat.
`HallOfFameWindow` stays as-is (already covers the season archive).
