# Win95 Boot Chime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play a synthesized Windows-95-style startup chime once per session on the user's first desktop interaction, for a strong nostalgia first impression.

**Architecture:** Extend the existing Web-Audio oscillator module `lib/sounds.ts` with a defensive `getCtx()`, a `playBoot()` chord, and a once-per-session `playBootChimeOnce()` guard; wire it into the desktop's existing first-gesture handler in `Desktop.tsx`. No audio file, no new dependency, no contract change.

**Tech Stack:** TypeScript, React 19, Web Audio API (oscillators), Vitest (jsdom).

---

## File Structure

- `frontend/lib/sounds.ts` — **modify**. Harden `getCtx()`; add `playBoot()` and `playBootChimeOnce()`.
- `frontend/lib/sounds.test.ts` — **create**. Tests for getCtx safety + the once-per-session guard.
- `frontend/components/desktop/Desktop.tsx` — **modify**. First-gesture handler resumes audio then fires the chime once.

Reference (do not modify): the existing private `tone()` helper and `playStart()` /
`playSuccess()` in `lib/sounds.ts` are the style/shape reference for `playBoot()`.
`Desktop.tsx` currently wires `onMouseDown={unlockAudio}` / `onTouchStart={unlockAudio}`
(lines ~97-98) with `import { unlockAudio } from "@/lib/sounds";` (line ~8).

**Note on jsdom:** the test environment has no `AudioContext`, so `new AudioContext()`
currently throws when any sound is invoked in a test. Task 1 makes `getCtx()` swallow
that into a `null` return, which is both a real robustness fix and what lets the later
sound functions be called as safe no-ops in tests.

---

## Task 1: Make `getCtx()` defensive

**Files:**
- Modify: `frontend/lib/sounds.ts`
- Test: `frontend/lib/sounds.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/sounds.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { playEat } from "@/lib/sounds";

describe("sounds — AudioContext safety", () => {
  it("invoking a sound never throws when AudioContext is unavailable", () => {
    // jsdom has no AudioContext; getCtx() must swallow construction failure.
    expect(() => playEat()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npx vitest run lib/sounds.test.ts`
Expected: FAIL — `playEat()` throws because `new AudioContext()` is undefined in jsdom.

- [ ] **Step 3: Write minimal implementation**

In `frontend/lib/sounds.ts`, find the current `getCtx`:

```ts
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = new AudioContext();
  return ctx;
}
```

Replace it with a try/catch version:

```ts
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npx vitest run lib/sounds.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/sounds.ts frontend/lib/sounds.test.ts
git commit -m "fix(sounds): guard AudioContext construction"
```

---

## Task 2: Add `playBoot()` + `playBootChimeOnce()`

**Files:**
- Modify: `frontend/lib/sounds.ts`
- Test: `frontend/lib/sounds.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `frontend/lib/sounds.test.ts` (add `playBootChimeOnce` to the import at the
top of the file, then add the new `describe` block at the bottom):

```ts
import { playEat, playBootChimeOnce } from "@/lib/sounds";

describe("playBootChimeOnce — once per session", () => {
  it("plays on the first call and no-ops afterward", () => {
    expect(playBootChimeOnce()).toBe(true);
    expect(playBootChimeOnce()).toBe(false);
    expect(playBootChimeOnce()).toBe(false);
  });
});
```

(Merge the import with the existing `import { playEat } from "@/lib/sounds";` line so
there is a single import: `import { playEat, playBootChimeOnce } from "@/lib/sounds";`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npx vitest run lib/sounds.test.ts`
Expected: FAIL — `playBootChimeOnce` is not exported / not a function.

- [ ] **Step 3: Write minimal implementation**

In `frontend/lib/sounds.ts`, add a module-level flag near the top (next to the existing
`let ctx: AudioContext | null = null;`):

```ts
let bootChimePlayed = false;
```

Then add these two exported functions (place them after `playSuccess`, before
`unlockAudio`):

```ts
/** Windows-95-style startup chord swell (synthesized, no sample). */
export function playBoot() {
  // Rising, overlapping notes that bloom into a sustained major chord.
  tone(523, 0.5, "triangle", 0.10, 0.0);  // C5
  tone(659, 0.5, "triangle", 0.10, 0.08); // E5
  tone(784, 0.5, "sine", 0.10, 0.16);     // G5
  tone(1046, 0.7, "sine", 0.12, 0.24);    // C6 — sustained top note
}

/**
 * Play the boot chime at most once per page session. Returns true if it played
 * on this call, false if it was already played. Safe to call on every interaction.
 */
export function playBootChimeOnce(): boolean {
  if (bootChimePlayed) return false;
  bootChimePlayed = true;
  playBoot();
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npx vitest run lib/sounds.test.ts`
Expected: PASS (2 tests total — AudioContext safety + once-per-session).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/lib/sounds.ts frontend/lib/sounds.test.ts
git commit -m "feat(sounds): synthesized win95 boot chime"
```

---

## Task 3: Wire the chime into the first desktop interaction

**Files:**
- Modify: `frontend/components/desktop/Desktop.tsx`

- [ ] **Step 1: Update the import**

In `frontend/components/desktop/Desktop.tsx`, find:

```tsx
import { unlockAudio } from "@/lib/sounds";
```

Replace it with:

```tsx
import { unlockAudio, playBootChimeOnce } from "@/lib/sounds";
```

- [ ] **Step 2: Add the first-interaction handler**

Inside the `Desktop` component body, near the other top-level declarations (e.g. just
after `const open = useWindows((s) => s.open);`), add:

```tsx
  const handleFirstInteraction = () => {
    unlockAudio();        // resume the AudioContext (no-op once running)
    playBootChimeOnce();  // play the chime at most once this session
  };
```

- [ ] **Step 3: Swap the handlers on the desktop root**

Find (lines ~97-98):

```tsx
      onMouseDown={unlockAudio}
      onTouchStart={unlockAudio}
```

Replace with:

```tsx
      onMouseDown={handleFirstInteraction}
      onTouchStart={handleFirstInteraction}
```

- [ ] **Step 4: Verify typecheck passes**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npx tsc --noEmit`
Expected: clean (exit 0, no output).

- [ ] **Step 5: Commit**

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add frontend/components/desktop/Desktop.tsx
git commit -m "feat(desktop): play boot chime on first interaction"
```

---

## Task 4: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npx tsc --noEmit`
Expected: clean, exit 0.

- [ ] **Step 2: Full test suite**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npm test`
Expected: all tests pass. Confirm the new `lib/sounds.test.ts` appears and passes.

- [ ] **Step 3: Lint**

Run: `cd /Users/vanhuy/Desktop/xp-snake/frontend && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit (only if Steps 1-3 produced fixes)**

If any step required a fix, commit it:

```bash
cd /Users/vanhuy/Desktop/xp-snake
git add -A
git commit -m "chore(chime): typecheck + lint + full test pass"
```

If nothing changed, skip the commit. Do not claim done until all three commands are
green — paste their real output.

---

## Self-Review notes (for the implementer)

- **Spec coverage:** Task 1 = `getCtx()` defensiveness (spec §3.1, §4 jsdom safety).
  Task 2 = `playBoot()` chord + `playBootChimeOnce()` guard (§3.2, §3.3, §4). Task 3 =
  Desktop first-gesture wiring (§2 trigger, §3.4). Task 4 = verification (§4).
- **Type consistency:** `getCtx()` returns `AudioContext | null`; `playBoot(): void`;
  `playBootChimeOnce(): boolean`; module flag `bootChimePlayed`. The `tone()` signature
  used in `playBoot()` (`frequency, duration, type, gain, startDelay`) matches the
  existing helper. Desktop imports `{ unlockAudio, playBootChimeOnce }`.
- **Once-per-session:** `bootChimePlayed` is module-level, so it resets on full page
  reload (new session) and persists across re-renders — exactly the intended behavior.
- **No on-chain change:** nothing here touches `contract/` or any `.clar` file; no new
  asset, no new dependency, no global mute toggle (explicitly out of scope per spec §2).
