# Win95 Shell Authenticity + Screensaver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three authentic Win95 OS-shell touches — a desktop right-click context menu, a "Shut Down" sequence with a Win95 message box, and an idle "Flying Windows" screensaver — to make the first 60 seconds feel crafted for new users.

**Architecture:** Pure frontend. Each unit is a small pure core (testable with `renderToStaticMarkup` / fake timers, per repo convention) plus a thin React shell wired into `components/desktop/Desktop.tsx`. No new dependencies, no contract changes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zustand 5, `98.css`, Vitest 3 (jsdom). Sounds via `lib/sounds.ts`.

## Global Constraints

- **No contract changes. No new npm dependencies.**
- **Path must not contain spaces** (Vitest breaks on `%20`).
- **Tests use `renderToStaticMarkup` from `react-dom/server` + `expect(html).toContain(...)`** for components; pure logic gets direct unit tests; timers use `vi.useFakeTimers()`. **No `@testing-library`** (not installed).
- **Co-locate tests** next to source as `<name>.test.ts(x)`.
- **All sounds route through `lib/sounds.ts`** so the settings mute toggle covers them (check `isSoundMuted()` is respected — `tone()` already early-returns when muted).
- **Inline-style Win95 chrome** matches existing components: bevel border `borderColor: "#ffffff #808080 #808080 #ffffff"`, surface `#c0c0c0`, title gradient `linear-gradient(90deg, #000080, #1084d0)`, font `'"Pixelated MS Sans Serif", Arial, sans-serif'`.
- **Gate before claiming done:** `npx tsc --noEmit`, `npm run lint`, `npm test` — read output before asserting.
- **Git:** conventional prefixes, small green commits, stage explicit files, **no `Co-Authored-By`**.

## Scope Note (read first)

During planning we inspected the live code. **The original spec's Unit 2 (Start
menu sidebar + game list) is ALREADY built** — `StartMenu.tsx` lines 106-130
render the vertical "Windows 95" navy sidebar, and lines 138-145 already list
every game. Adding a cascading submenu would be cosmetic and *less* usable than
the current flat list, so **Unit 2 is dropped**. This plan implements the three
genuinely-missing units:

1. Desktop right-click context menu (Task 1)
2. Shut Down sequence + Win95 system dialog (Task 2)
3. Idle "Flying Windows" screensaver (Task 3)

`StartMenu.tsx`'s "Shut Down" currently just calls `location.reload()`
(line 280); Task 2 replaces that.

## File Structure

- `frontend/lib/menu-position.ts` (new) — pure `clampMenuPosition` helper.
- `frontend/lib/menu-position.test.ts` (new).
- `frontend/components/desktop/DesktopContextMenu.tsx` (new) — presentational menu.
- `frontend/components/desktop/DesktopContextMenu.test.tsx` (new).
- `frontend/components/dialogs/SystemDialog.tsx` (new) — reusable Win95 message box.
- `frontend/components/dialogs/SystemDialog.test.tsx` (new).
- `frontend/components/desktop/ShutdownScreen.tsx` (new) — "safe to turn off" screen.
- `frontend/components/desktop/ShutdownScreen.test.tsx` (new).
- `frontend/lib/screensaver.ts` (new) — pure `shouldShowScreensaver` gate.
- `frontend/lib/screensaver.test.ts` (new).
- `frontend/hooks/useIdle.ts` (new) — idle-timer hook.
- `frontend/hooks/useIdle.test.ts` (new).
- `frontend/components/desktop/Screensaver.tsx` (new) — Flying Windows canvas overlay.
- `frontend/components/desktop/Screensaver.test.tsx` (new).
- `frontend/lib/sounds.ts` (modify) — add `playMenuOpen()`.
- `frontend/components/desktop/StartMenu.tsx` (modify) — Shut Down opens dialog instead of reload.
- `frontend/components/desktop/Desktop.tsx` (modify) — wire background layer + context menu + shutdown + screensaver.

All paths below are relative to `frontend/`. Run all commands from `frontend/`.

---

### Task 1: Desktop right-click context menu

**Files:**
- Create: `lib/menu-position.ts`
- Test: `lib/menu-position.test.ts`
- Create: `components/desktop/DesktopContextMenu.tsx`
- Test: `components/desktop/DesktopContextMenu.test.tsx`
- Modify: `lib/sounds.ts` (add `playMenuOpen`)
- Modify: `components/desktop/Desktop.tsx` (add a z0 background layer that opens the menu)

**Interfaces:**
- Produces:
  - `clampMenuPosition(x: number, y: number, menuW: number, menuH: number, viewportW: number, viewportH: number): { x: number; y: number }`
  - `DesktopContextMenu(props: { x: number; y: number; onClose: () => void; onRefresh: () => void; onArrangeIcons: () => void; onProperties: () => void }): JSX.Element`
  - `playMenuOpen(): void` (in `lib/sounds.ts`)

- [ ] **Step 1: Write the failing test for `clampMenuPosition`**

Create `lib/menu-position.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clampMenuPosition } from "./menu-position";

describe("clampMenuPosition", () => {
  it("returns the cursor point when the menu fits", () => {
    expect(clampMenuPosition(100, 100, 160, 200, 1024, 768)).toEqual({ x: 100, y: 100 });
  });

  it("shifts left when the menu would overflow the right edge", () => {
    // 900 + 160 = 1060 > 1024 -> x = 1024 - 160 = 864
    expect(clampMenuPosition(900, 100, 160, 200, 1024, 768)).toEqual({ x: 864, y: 100 });
  });

  it("shifts up when the menu would overflow the bottom edge", () => {
    // 700 + 200 = 900 > 768 -> y = 768 - 200 = 568
    expect(clampMenuPosition(100, 700, 160, 200, 1024, 768)).toEqual({ x: 100, y: 568 });
  });

  it("never returns negative coordinates", () => {
    expect(clampMenuPosition(5, 5, 160, 200, 100, 100)).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/menu-position.test.ts`
Expected: FAIL — `clampMenuPosition` not exported / module missing.

- [ ] **Step 3: Implement `clampMenuPosition`**

Create `lib/menu-position.ts`:

```ts
/**
 * Position a popup menu at the cursor, nudged so it stays fully on-screen.
 * Pure so it can be unit-tested without a DOM.
 */
export function clampMenuPosition(
  x: number,
  y: number,
  menuW: number,
  menuH: number,
  viewportW: number,
  viewportH: number,
): { x: number; y: number } {
  const cx = Math.max(0, Math.min(x, viewportW - menuW));
  const cy = Math.max(0, Math.min(y, viewportH - menuH));
  return { x: cx, y: cy };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/menu-position.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add `playMenuOpen` to sounds**

In `lib/sounds.ts`, add after `playBalloon` (around line 74):

```ts
/** Soft tick when a context menu opens. */
export function playMenuOpen() {
  tone(660, 0.03, "square", 0.06);
}
```

- [ ] **Step 6: Write the failing test for `DesktopContextMenu`**

Create `components/desktop/DesktopContextMenu.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DesktopContextMenu } from "./DesktopContextMenu";

function noop() {}

describe("DesktopContextMenu", () => {
  it("renders the Refresh and Properties items", () => {
    const html = renderToStaticMarkup(
      <DesktopContextMenu
        x={10}
        y={10}
        onClose={noop}
        onRefresh={noop}
        onArrangeIcons={noop}
        onProperties={noop}
      />,
    );
    expect(html).toContain("Refresh");
    expect(html).toContain("Properties");
    expect(html).toContain("Arrange Icons");
  });

  it("positions itself at the given coordinates", () => {
    const html = renderToStaticMarkup(
      <DesktopContextMenu
        x={42}
        y={64}
        onClose={noop}
        onRefresh={noop}
        onArrangeIcons={noop}
        onProperties={noop}
      />,
    );
    expect(html).toContain("left:42px");
    expect(html).toContain("top:64px");
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npx vitest run components/desktop/DesktopContextMenu.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 8: Implement `DesktopContextMenu`**

Create `components/desktop/DesktopContextMenu.tsx`:

```tsx
"use client";
import { useEffect } from "react";
import { clampMenuPosition } from "@/lib/menu-position";

const MENU_W = 168;
const MENU_H = 116;

const itemStyle: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "4px 24px 4px 24px",
  fontSize: 11,
  fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
  border: "none",
  background: "transparent",
  cursor: "default",
};

function Item({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <li role="none">
      <button
        role="menuitem"
        style={itemStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#000080";
          e.currentTarget.style.color = "#ffffff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "#000000";
        }}
        onClick={onClick}
      >
        {label}
      </button>
    </li>
  );
}

export function DesktopContextMenu({
  x,
  y,
  onClose,
  onRefresh,
  onArrangeIcons,
  onProperties,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onRefresh: () => void;
  onArrangeIcons: () => void;
  onProperties: () => void;
}) {
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const pos = clampMenuPosition(x, y, MENU_W, MENU_H, vw, vh);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = () => onClose();
    window.addEventListener("keydown", onKey);
    // Close on the NEXT pointer/contextmenu anywhere (after this open frame).
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("contextmenu", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("contextmenu", onDown);
    };
  }, [onClose]);

  return (
    <ul
      role="menu"
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 60,
        listStyle: "none",
        margin: 0,
        padding: "2px",
        width: MENU_W,
        background: "#c0c0c0",
        border: "2px solid",
        borderColor: "#ffffff #808080 #808080 #ffffff",
        boxShadow: "2px 2px 0 #000000",
      }}
    >
      <Item label="Arrange Icons" onClick={() => { onArrangeIcons(); onClose(); }} />
      <Item label="Refresh" onClick={() => { onRefresh(); onClose(); }} />
      <li
        style={{
          borderTop: "1px solid #808080",
          borderBottom: "1px solid #ffffff",
          margin: "3px 1px",
        }}
      />
      <Item label="Properties" onClick={() => { onProperties(); onClose(); }} />
    </ul>
  );
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run components/desktop/DesktopContextMenu.test.tsx`
Expected: PASS (2 tests).

Note: `renderToStaticMarkup` renders `left:42px` / `top:64px` from the numeric
style values. The `useEffect` does not run during static render, so no window
guard issue in the test.

- [ ] **Step 10: Wire the context menu into `Desktop.tsx`**

In `components/desktop/Desktop.tsx`:

1. Add imports near the top (after line 27):

```tsx
import { DesktopContextMenu } from "@/components/desktop/DesktopContextMenu";
import { playMenuOpen } from "@/lib/sounds";
```

2. Inside the `Desktop` component body, add state (near the other `useState` calls, after line 68):

```tsx
const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
const [iconKey, setIconKey] = useState(0);
```

3. Add a full-screen background layer as the FIRST child of the outer `div` (immediately after `<DesktopWallpaper />` on line 134), so it sits behind icons (z1) and windows. Right-clicks on windows/icons never reach this layer because it is their sibling, not their ancestor:

```tsx
<div
  className="desktop-bg-layer"
  onContextMenu={(e) => {
    e.preventDefault();
    playMenuOpen();
    setMenuPos({ x: e.clientX, y: e.clientY });
  }}
  style={{ position: "absolute", inset: 0, zIndex: 0 }}
/>
```

4. Change the desktop icon grid wrapper (line 137-140) to remount on refresh by adding `key={iconKey}`:

```tsx
<div
  key={iconKey}
  className="desktop-icon-grid absolute top-4 left-4"
  style={{ zIndex: 1 }}
>
```

5. Render the menu just before `<Taskbar ... />` (line 231):

```tsx
{menuPos && (
  <DesktopContextMenu
    x={menuPos.x}
    y={menuPos.y}
    onClose={() => setMenuPos(null)}
    onRefresh={() => setIconKey((k) => k + 1)}
    onArrangeIcons={() => setIconKey((k) => k + 1)}
    onProperties={() => open("control-panel")}
  />
)}
```

- [ ] **Step 11: Type-check, lint, and verify Minesweeper right-click is untouched**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

Manual smoke (note in commit message that it was checked):
- Right-click empty desktop → menu appears at cursor, "Refresh" flickers icons, "Properties" opens Control Panel, Escape/left-click closes it.
- Open Minesweeper, right-click a tile → it still flags (no desktop menu appears, because the right-click target is the board, not the z0 background layer).

- [ ] **Step 12: Run the full test suite**

Run: `npm test`
Expected: PASS (all existing tests plus the new ones).

- [ ] **Step 13: Commit**

```bash
git add lib/menu-position.ts lib/menu-position.test.ts \
  components/desktop/DesktopContextMenu.tsx components/desktop/DesktopContextMenu.test.tsx \
  lib/sounds.ts components/desktop/Desktop.tsx
git commit -m "feat(desktop): Win95 right-click context menu on desktop background"
```

---

### Task 2: Shut Down sequence + Win95 system dialog

**Files:**
- Create: `components/dialogs/SystemDialog.tsx`
- Test: `components/dialogs/SystemDialog.test.tsx`
- Create: `components/desktop/ShutdownScreen.tsx`
- Test: `components/desktop/ShutdownScreen.test.tsx`
- Modify: `components/desktop/StartMenu.tsx` (Shut Down opens the dialog)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `SystemDialog(props: { kind: "info" | "warning" | "error"; title: string; message: string; okLabel?: string; cancelLabel?: string; onOk: () => void; onCancel: () => void }): JSX.Element`
  - `ShutdownScreen(props: { onWake: () => void }): JSX.Element`

- [ ] **Step 1: Write the failing test for `SystemDialog`**

Create `components/dialogs/SystemDialog.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SystemDialog } from "./SystemDialog";

function noop() {}

describe("SystemDialog", () => {
  it("renders the title and message", () => {
    const html = renderToStaticMarkup(
      <SystemDialog
        kind="warning"
        title="Shut Down"
        message="Are you sure you want to shut down XP Arcade?"
        onOk={noop}
        onCancel={noop}
      />,
    );
    expect(html).toContain("Shut Down");
    expect(html).toContain("Are you sure you want to shut down XP Arcade?");
  });

  it("renders default OK and Cancel labels", () => {
    const html = renderToStaticMarkup(
      <SystemDialog kind="info" title="T" message="M" onOk={noop} onCancel={noop} />,
    );
    expect(html).toContain("OK");
    expect(html).toContain("Cancel");
  });

  it("honors custom button labels", () => {
    const html = renderToStaticMarkup(
      <SystemDialog
        kind="info"
        title="T"
        message="M"
        okLabel="Yes"
        cancelLabel="No"
        onOk={noop}
        onCancel={noop}
      />,
    );
    expect(html).toContain("Yes");
    expect(html).toContain("No");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/dialogs/SystemDialog.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `SystemDialog`**

Create `components/dialogs/SystemDialog.tsx`:

```tsx
"use client";
import { useEffect } from "react";
import { playBalloon } from "@/lib/sounds";

const ICONS: Record<"info" | "warning" | "error", string> = {
  info: "ℹ️",
  warning: "⚠️",
  error: "❌",
};

export function SystemDialog({
  kind,
  title,
  message,
  okLabel = "OK",
  cancelLabel = "Cancel",
  onOk,
  onCancel,
}: {
  kind: "info" | "warning" | "error";
  title: string;
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  onOk: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    playBalloon(); // the "ding"; no-op when muted
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onOk();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOk, onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.25)",
      }}
    >
      <div
        style={{
          minWidth: 320,
          background: "#c0c0c0",
          border: "2px solid",
          borderColor: "#ffffff #808080 #808080 #ffffff",
          boxShadow: "2px 2px 0 #000000",
          fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
        }}
      >
        <div
          style={{
            background: "linear-gradient(90deg, #000080, #1084d0)",
            color: "#ffffff",
            fontWeight: "bold",
            padding: "3px 6px",
            fontSize: 12,
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", gap: 12, padding: 16, alignItems: "center" }}>
          <span style={{ fontSize: 32, lineHeight: 1 }}>{ICONS[kind]}</span>
          <span style={{ fontSize: 12 }}>{message}</span>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", padding: "0 16px 16px" }}>
          <button type="button" className="default" onClick={onOk} style={{ minWidth: 75 }}>
            {okLabel}
          </button>
          <button type="button" onClick={onCancel} style={{ minWidth: 75 }}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/dialogs/SystemDialog.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing test for `ShutdownScreen`**

Create `components/desktop/ShutdownScreen.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ShutdownScreen } from "./ShutdownScreen";

describe("ShutdownScreen", () => {
  it("renders the classic safe-to-turn-off message", () => {
    const html = renderToStaticMarkup(<ShutdownScreen onWake={() => {}} />);
    expect(html).toContain("It&#x27;s now safe to turn off your computer.");
  });
});
```

Note: `renderToStaticMarkup` HTML-escapes the apostrophe to `&#x27;`. Write the
literal text `It's now safe to turn off your computer.` in the component.

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run components/desktop/ShutdownScreen.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 7: Implement `ShutdownScreen`**

Create `components/desktop/ShutdownScreen.tsx`:

```tsx
"use client";

export function ShutdownScreen({ onWake }: { onWake: () => void }) {
  return (
    <div
      onClick={onWake}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "#000000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        animation: "desktop-fade-in 600ms ease-out both",
      }}
    >
      <span
        style={{
          color: "#FFA600",
          fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
          fontSize: 20,
          textShadow: "0 0 8px rgba(255,166,0,0.5)",
        }}
      >
        It&apos;s now safe to turn off your computer.
      </span>
    </div>
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run components/desktop/ShutdownScreen.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 9: Wire Shut Down through the dialog in `Desktop.tsx`**

The shutdown UI lives at the desktop level (StartMenu unmounts when it closes, so
it cannot own the post-confirm screen). In `components/desktop/Desktop.tsx`:

1. Add imports (after the Task 1 imports):

```tsx
import { SystemDialog } from "@/components/dialogs/SystemDialog";
import { ShutdownScreen } from "@/components/desktop/ShutdownScreen";
```

2. Add state (near the Task 1 state):

```tsx
const [shutdownStage, setShutdownStage] = useState<"idle" | "confirm" | "off">("idle");
```

3. Listen for a shutdown-request event (the Start menu dispatches it). Add this `useEffect` inside the component:

```tsx
useEffect(() => {
  const onReq = () => setShutdownStage("confirm");
  window.addEventListener("xp-arcade:shutdown", onReq);
  return () => window.removeEventListener("xp-arcade:shutdown", onReq);
}, []);
```

4. Render the dialog + screen just before `<Taskbar ... />`:

```tsx
{shutdownStage === "confirm" && (
  <SystemDialog
    kind="warning"
    title="Shut Down Windows"
    message="Are you sure you want to shut down XP Arcade?"
    okLabel="Yes"
    cancelLabel="No"
    onOk={() => setShutdownStage("off")}
    onCancel={() => setShutdownStage("idle")}
  />
)}
{shutdownStage === "off" && (
  <ShutdownScreen onWake={() => setShutdownStage("idle")} />
)}
```

- [ ] **Step 10: Point StartMenu's Shut Down at the event**

In `components/desktop/StartMenu.tsx`, replace the Shut Down item (lines 277-281):

```tsx
<MenuItem
  icon="⏻"
  label="Shut Down"
  onClick={() => {
    window.dispatchEvent(new Event("xp-arcade:shutdown"));
    onClose();
  }}
/>
```

- [ ] **Step 11: Type-check, lint, smoke**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

Manual smoke: Start → Shut Down → "Shut Down Windows" dialog with ding → "Yes"
fades to the amber "It's now safe to turn off your computer." screen → click
returns to the desktop. "No"/Escape dismisses.

- [ ] **Step 12: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add components/dialogs/SystemDialog.tsx components/dialogs/SystemDialog.test.tsx \
  components/desktop/ShutdownScreen.tsx components/desktop/ShutdownScreen.test.tsx \
  components/desktop/StartMenu.tsx components/desktop/Desktop.tsx
git commit -m "feat(desktop): Win95 Shut Down dialog + safe-to-turn-off screen"
```

---

### Task 3: Idle "Flying Windows" screensaver

**Files:**
- Create: `lib/screensaver.ts`
- Test: `lib/screensaver.test.ts`
- Create: `hooks/useIdle.ts`
- Test: `hooks/useIdle.test.ts`
- Create: `components/desktop/Screensaver.tsx`
- Test: `components/desktop/Screensaver.test.tsx`
- Modify: `components/desktop/Desktop.tsx` (mount the screensaver, gated)

**Interfaces:**
- Consumes: `useWindows` from `@/state/window-manager` (to detect an open game).
- Produces:
  - `shouldShowScreensaver(opts: { idle: boolean; gameOpen: boolean; reducedMotion: boolean }): boolean`
  - `useIdle(ms: number): boolean`
  - `Screensaver(props: { onWake: () => void }): JSX.Element`

- [ ] **Step 1: Write the failing test for the pure gate**

Create `lib/screensaver.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldShowScreensaver } from "./screensaver";

describe("shouldShowScreensaver", () => {
  it("shows when idle, no game open, and motion allowed", () => {
    expect(shouldShowScreensaver({ idle: true, gameOpen: false, reducedMotion: false })).toBe(true);
  });
  it("never shows when not idle", () => {
    expect(shouldShowScreensaver({ idle: false, gameOpen: false, reducedMotion: false })).toBe(false);
  });
  it("never shows over an open game", () => {
    expect(shouldShowScreensaver({ idle: true, gameOpen: true, reducedMotion: false })).toBe(false);
  });
  it("never shows when the user prefers reduced motion", () => {
    expect(shouldShowScreensaver({ idle: true, gameOpen: false, reducedMotion: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/screensaver.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the pure gate**

Create `lib/screensaver.ts`:

```ts
/**
 * Whether the idle screensaver should be visible. Pure so it can be unit-tested.
 * Suppressed over an open game (don't interrupt play) and under reduced-motion.
 */
export function shouldShowScreensaver(opts: {
  idle: boolean;
  gameOpen: boolean;
  reducedMotion: boolean;
}): boolean {
  return opts.idle && !opts.gameOpen && !opts.reducedMotion;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/screensaver.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing test for the idle timer core**

This repo has no `@testing-library/react`, so the React hook is not unit-tested
directly. Instead the timer logic is extracted into the pure `createIdleWatcher`
(implemented in Step 7) and tested with fake timers. Create `hooks/useIdle.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createIdleWatcher } from "./useIdle";

describe("createIdleWatcher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires onIdle after the threshold with no activity", () => {
    const onIdle = vi.fn();
    const watcher = createIdleWatcher(1000, onIdle);
    watcher.start();
    vi.advanceTimersByTime(999);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it("resets the timer on activity", () => {
    const onIdle = vi.fn();
    const watcher = createIdleWatcher(1000, onIdle);
    watcher.start();
    vi.advanceTimersByTime(900);
    watcher.notifyActivity();
    vi.advanceTimersByTime(900);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onIdle).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it("does not fire after stop", () => {
    const onIdle = vi.fn();
    const watcher = createIdleWatcher(1000, onIdle);
    watcher.start();
    watcher.stop();
    vi.advanceTimersByTime(5000);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run hooks/useIdle.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 7: Implement `createIdleWatcher` + `useIdle`**

Create `hooks/useIdle.ts`:

```ts
"use client";
import { useEffect, useState } from "react";

/**
 * Pure-ish timer core: calls `onIdle` after `ms` without `notifyActivity()`.
 * Extracted from the hook so it can be unit-tested with fake timers.
 */
export function createIdleWatcher(ms: number, onIdle: () => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!stopped) onIdle();
    }, ms);
  };
  return {
    start() {
      stopped = false;
      arm();
    },
    notifyActivity() {
      if (!stopped) arm();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

const ACTIVITY_EVENTS = ["mousemove", "keydown", "pointerdown", "touchstart"] as const;

/** Returns true after `ms` of no user input; resets on activity or tab-hide. */
export function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    const watcher = createIdleWatcher(ms, () => setIdle(true));
    const onActivity = () => {
      setIdle(false);
      watcher.notifyActivity();
    };
    const onVisibility = () => {
      if (document.hidden) {
        setIdle(false);
        watcher.stop();
      } else {
        watcher.start();
      }
    };
    watcher.start();
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      watcher.stop();
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms]);

  return idle;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run hooks/useIdle.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Write the failing test for `Screensaver`**

Create `components/desktop/Screensaver.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Screensaver } from "./Screensaver";

describe("Screensaver", () => {
  it("renders a full-screen canvas overlay", () => {
    const html = renderToStaticMarkup(<Screensaver onWake={() => {}} />);
    expect(html).toContain("<canvas");
    expect(html).toContain("position:fixed");
  });
});
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `npx vitest run components/desktop/Screensaver.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 11: Implement `Screensaver` (Flying Windows)**

Create `components/desktop/Screensaver.tsx`:

```tsx
"use client";
import { useEffect, useRef } from "react";

type Logo = { x: number; y: number; z: number };

export function Screensaver({ onWake }: { onWake: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const logos: Logo[] = [];
    const COUNT = 28;
    const reset = (l: Logo) => {
      l.x = (Math.random() - 0.5) * 2;
      l.y = (Math.random() - 0.5) * 2;
      l.z = Math.random();
    };
    for (let i = 0; i < COUNT; i++) {
      const l = { x: 0, y: 0, z: 0 };
      reset(l);
      logos.push(l);
    }

    const fit = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    fit();
    window.addEventListener("resize", fit);

    const COLORS = ["#FF0000", "#00AA00", "#0000AA", "#FFAA00"];
    const drawFlag = (cx: number, cy: number, s: number) => {
      const g = s / 2;
      ctx.fillStyle = COLORS[0]; ctx.fillRect(cx - g, cy - g, g, g);
      ctx.fillStyle = COLORS[1]; ctx.fillRect(cx, cy - g, g, g);
      ctx.fillStyle = COLORS[2]; ctx.fillRect(cx - g, cy, g, g);
      ctx.fillStyle = COLORS[3]; ctx.fillRect(cx, cy, g, g);
    };

    const tick = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);
      for (const l of logos) {
        l.z -= 0.006;
        if (l.z <= 0.02) reset(l);
        const scale = 1 / l.z;
        const px = w / 2 + (l.x * scale * w) / 2;
        const py = h / 2 + (l.y * scale * h) / 2;
        const size = Math.min(64, 6 * scale);
        if (px > -size && px < w + size && py > -size && py < h + size) {
          drawFlag(px, py, size);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onClick={onWake}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "#000000",
        cursor: "none",
      }}
    />
  );
}
```

Note: in jsdom `getContext` returns null, so the effect bails safely; the static
render test only checks the markup.

- [ ] **Step 12: Run the test to verify it passes**

Run: `npx vitest run components/desktop/Screensaver.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 13: Mount the screensaver in `Desktop.tsx`, gated**

In `components/desktop/Desktop.tsx`:

1. Add imports:

```tsx
import { Screensaver } from "@/components/desktop/Screensaver";
import { useIdle } from "@/hooks/useIdle";
import { shouldShowScreensaver } from "@/lib/screensaver";
```

2. Inside the component body, derive the gate. `useWindows` is already imported;
add a selector for an open, non-minimized game window, plus the idle + motion
inputs:

```tsx
const gameOpen = useWindows((s) =>
  s.windows.some((w) => w.type.startsWith("game-") && !w.minimized),
);
const idle = useIdle(60000);
const reducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const screensaverOn = shouldShowScreensaver({
  idle,
  gameOpen,
  reducedMotion: !!reducedMotion,
});
```

3. Render it just before `<Taskbar ... />`:

```tsx
{screensaverOn && <Screensaver onWake={() => { /* idle resets on the click via useIdle's pointerdown listener */ }} />}
```

Note: `useIdle` already listens for `pointerdown`, so the click that wakes the
screensaver flips `idle` back to false and unmounts it; `onWake` can stay a
no-op. Keep it as a prop for testability and future use.

- [ ] **Step 14: Type-check, lint, smoke**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

Manual smoke: leave the desktop untouched ~60s (temporarily lower `useIdle(60000)`
to `useIdle(3000)` while testing, then restore) → Flying Windows appears →
any mouse move / click dismisses it. Open a game → confirm the screensaver does
not appear over it. Toggle OS "reduce motion" → confirm it stays off.

- [ ] **Step 15: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 16: Commit**

```bash
git add lib/screensaver.ts lib/screensaver.test.ts \
  hooks/useIdle.ts hooks/useIdle.test.ts \
  components/desktop/Screensaver.tsx components/desktop/Screensaver.test.tsx \
  components/desktop/Desktop.tsx
git commit -m "feat(desktop): idle Flying Windows screensaver"
```

---

## Final Verification (after all tasks)

- [ ] Run the full gate from `frontend/`:

```bash
npx tsc --noEmit && npm run lint && npm test
```

Expected: type-check clean, lint clean, all tests pass. Read the output before
claiming done.

- [ ] Manual end-to-end smoke in `npm run dev`:
  - Right-click desktop → context menu (Refresh flickers icons, Properties opens Control Panel).
  - Minesweeper right-click still flags (no desktop menu).
  - Start → Shut Down → dialog (ding) → Yes → amber safe-to-turn-off screen → click restores.
  - Idle ~60s → Flying Windows → input dismisses; never appears over an open game; off under reduced-motion.
  - Toggle sound off in Control Panel → dialog ding and menu tick are silent.

## Out of Scope (deferred, per spec)

CRT scanlines/flicker, BSOD easter egg, additional screensaver styles
(Starfield/Maze), keyboard navigation for menus, Start-menu cascading submenus
(the flat list + sidebar already exist), any contract/on-chain change.
