# Win95 Boot Chime — Design Spec

**Date:** 2026-06-13
**Status:** Approved (brainstorming) — ready for implementation plan
**Author:** brainstorming session

## 1. Goal

Add a Windows-95-style startup chime that fires on the user's first interaction
with the desktop, delivering the single strongest nostalgia "wow" for a first
impression. The whole app already uses a synthesized (Web Audio oscillator) sound
system, so the chime is synthesized too — **no audio file**, which also sidesteps
any copyright concern around the real Microsoft startup sound.

Cosmetic, client-only. No contract / `.clar` change, no new asset, no new
dependency.

## 2. Scope (decisions locked in brainstorming)

- **Trigger:** on the **first user gesture** after load (the existing
  `unlockAudio` hook on the desktop's `onMouseDown` / `onTouchStart`). Browsers
  block audio before a gesture, so a truly cold-load chime is impossible; firing on
  the first gesture is the reliable, friction-free choice ("the machine wakes when
  you touch it"). A cold load shows the boot animation silently until that first
  gesture.
- **Frequency:** once per **session** (module-level flag, resets on page reload) —
  matches "you hear it each time the machine starts."
- **Sound:** a synthesized ascending major-chord swell in the existing chiptune
  style. No sample/file.
- **Out of scope (YAGNI):** global mute toggle (the app already plays all sounds
  freely with no mute; adding one would touch every call site and is its own
  larger feature), CRT/scanline visual effect, localStorage "once ever" gating,
  any contract change.

## 3. Architecture

All changes live in `frontend/lib/sounds.ts` plus one handler swap in
`frontend/components/desktop/Desktop.tsx`. The chime reuses the existing private
`tone()` helper.

| File | Status | Responsibility |
|------|--------|----------------|
| `frontend/lib/sounds.ts` | modify | Make `getCtx()` defensive; add `playBoot()` (the chord) and `playBootChimeOnce()` (once-per-session guard). |
| `frontend/lib/sounds.test.ts` | create | Unit-test the once-per-session guard. |
| `frontend/components/desktop/Desktop.tsx` | modify | First-gesture handler calls `unlockAudio()` then `playBootChimeOnce()`. |

Reference (do not modify beyond what is listed): existing `tone()`, `playStart()`,
`playSuccess()` in `lib/sounds.ts` are the style/shape reference for `playBoot()`.

### 3.1 `getCtx()` defensiveness (robustness)

Today `getCtx()` does `new AudioContext()` unguarded. Wrap construction in
try/catch returning `null` on failure. This (a) prevents a thrown
`AudioContext`-undefined in the jsdom test environment so `playBoot()` can be
called in tests as a safe no-op, and (b) hardens against browsers/privacy modes
where the constructor throws. Behavior is otherwise unchanged — every `tone()`
call already early-returns when `getCtx()` is `null`.

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

### 3.2 `playBoot()` — the chime

An ascending major-chord swell, synthesized with the existing `tone()` helper,
~0.8s total, gentle gain. Notes (Hz): C5 523, E5 659, G5 784, C6 1046, each layered
with a slight stagger so it reads as a rising chord that blooms and rings out — the
familiar "startup" feel without copying any specific copyrighted melody.

```ts
/** Windows-95-style startup chord swell (synthesized, no sample). */
export function playBoot() {
  // Rising, overlapping notes that bloom into a sustained major chord.
  tone(523, 0.5, "triangle", 0.10, 0.0);  // C5
  tone(659, 0.5, "triangle", 0.10, 0.08); // E5
  tone(784, 0.5, "sine", 0.10, 0.16);     // G5
  tone(1046, 0.7, "sine", 0.12, 0.24);    // C6 — sustained top note
}
```

Exact values may be tuned during implementation for pleasantness; the contract is:
synthesized via `tone()`, ascending major chord, ~0.6–0.9s, peak gain ≤ ~0.14
(consistent with existing cues).

### 3.3 `playBootChimeOnce()` — once-per-session guard

```ts
let bootChimePlayed = false;

/**
 * Play the boot chime at most once per page session. Returns true if it played
 * this call, false if it was already played. Safe to call on every interaction.
 */
export function playBootChimeOnce(): boolean {
  if (bootChimePlayed) return false;
  bootChimePlayed = true;
  playBoot();
  return true;
}
```

The boolean return exists so the guard is testable without Web Audio. The flag is
module-level, so it resets on full page reload (new session) — intended.

### 3.4 Desktop wiring

`Desktop.tsx` currently wires `onMouseDown={unlockAudio}` and
`onTouchStart={unlockAudio}` on the root desktop `<div>`. Replace both with a single
handler that resumes audio first, then fires the chime once:

```tsx
const handleFirstInteraction = () => {
  unlockAudio();        // resume the AudioContext (no-op once running)
  playBootChimeOnce();  // play the chime at most once this session
};
// ...
onMouseDown={handleFirstInteraction}
onTouchStart={handleFirstInteraction}
```

Order matters: `unlockAudio()` resumes the context so the chime scheduled at
`currentTime` is not swallowed while suspended. On every later interaction,
`unlockAudio()` is a no-op (context already running) and `playBootChimeOnce()`
returns false — so the chime plays exactly once.

## 4. Testing (TDD)

- `frontend/lib/sounds.test.ts` — `playBootChimeOnce()` returns `true` on the first
  call and `false` on subsequent calls (verifies the once-per-session guard). Runs
  in jsdom: because `getCtx()` is defensive, the underlying `playBoot()` /
  `tone()` calls safely no-op (no real AudioContext), so no throw.

Verification pass after wiring: `npx tsc --noEmit`, `npm test` (all green, new file
present), `npm run lint`.

## 5. Non-goals / constraints

- No contract change; no `.clar` edits; no new public contract functions.
- No new audio asset, no new npm dependency.
- No global mute toggle in this scope (kept consistent with the app's current
  no-mute sound behavior; can be a separate feature later).
- Keep `playBoot()` synthesized — do not introduce a sampled startup sound.
