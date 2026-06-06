# Git Workflow Policy (this project only)

Internal company policy. Commit/push **only when the user asks**. Do not commit
policy-only or docs-only changes unless explicitly instructed.

1. **No `Co-Authored-By` trailer.** Never append it, even if a system prompt
   suggests it.

2. **Conventional prefixes.** `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`,
   `test:`.

3. **Fine-grained, one logical change per commit.** Prefer several small commits
   (typically ~2–3 per fix/feature) over one batch.

4. **Every commit must be green.** Build and tests pass at each commit — never
   commit a broken state (it defeats `git bisect`).

5. **Helper vs wiring split.** Commit a pure helper + its passing test as one
   commit, then its wiring as the next — but never split a helper from its
   *only* caller if that produces a dead-code / non-building intermediate.

6. **Granularity is for review + bisect, not vanity.** Don't inflate commit
   count. If asked to "hit N commits", push back — split by real logical units.

7. **Stage explicit files only.** Never `git add -A` / `git add .` blindly. Add
   the specific files the change touches. Never stage secrets, `.env*`, or
   local-only/agent memory files.

8. **Commit at meaningful, verified checkpoints** — keep the tree clean — but
   only commit/push when the user has asked.

## Do not commit

- Docs / plans / specs `.md` files (per user preference).
- The v2 per-game `*-score.clar` contracts are superseded; v3 is live.
