# Environment Quirks

Hard-won gotchas. Violating these breaks the build or tests.

- **Path must not contain spaces.** Vitest's worker pool fails on URL-encoded
  paths (`%20`). The project lives at `Desktop/xp-snake/` — do not rename to
  anything with a space.

- **Vitest 4 is incompatible with `vitest-environment-clarinet` 3.** The
  contract workspace pins `vitest@^3`. If `clarinet new` regenerates and bumps
  vitest, downgrade.

- **Clarity rejects non-ASCII.** No em-dash, smart quotes, etc. in `.clar`
  files — ASCII hyphens only.

- **Path-with-space artifact.** `npm test` in `frontend/` sometimes prints
  `Shell cwd was reset to /Users/vanhuy/Desktop/untitled folder` afterward —
  harmless leftover from the pre-rename directory. Tests still run.

- **Clarity version is pinned to 3** for `xp-arcade-v4` (`as-contract` breaks
  under Clarity 4 in Clarinet 3.14.1). Don't bump.

## Required Vercel env vars

```
NEXT_PUBLIC_CONTRACT_ADDRESS=SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.xp-arcade-v4
NEXT_PUBLIC_NETWORK=mainnet
NEXT_PUBLIC_APP_URL=<vercel-domain>
NEXT_PUBLIC_SEASON_END_ISO=<ISO 8601 UTC>
```

See `frontend/.env.example`.

## Deferred / out of scope

- **Sound effects** (XP `ding`/`error`/`balloon`) are intentionally deferred —
  they need MP3 assets we can't generate. Wire-up snippet is in the plan's
  Phase 8 task 8.2.

## Economic-alerts workflow (phase 2 observability)

- `.github/workflows/economic-alerts.yml` runs `npm run alerts:economic` daily.
- Requires GitHub repo secret **`ALERT_WEBHOOK_URL`** (a Discord Incoming
  Webhook URL). Without it the run prints alerts to the workflow log and exits 0.
- Optional overrides: `STACKS_API_URL`, `SEASON_END_WARN_BLOCKS` (default 1000),
  `CLAIM_WARN_BURN_BLOCKS` (default 432).
- The runner is `frontend/scripts/economic-alerts.ts`, executed via
  `node --experimental-strip-types` (Node 22) — no `tsx` dependency.
