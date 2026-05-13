# Win95 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Windows XP aesthetic with an accurate Windows 95 look — silver chrome, navy title bars, beveled borders, Win95 boot screen — without touching game logic, contract, or state.

**Architecture:** Swap `xp.css` for `98.css` (same class names for core window components, so `Window.tsx` needs minimal changes). All other visual changes are inline style rewrites in individual components. No new files — every task modifies an existing file.

**Tech Stack:** `98.css` npm package, React inline styles, MS Sans Serif woff fonts (already in `frontend/app/`).

---

## File Map

| File | Change |
|---|---|
| `frontend/package.json` | remove `xp.css`, add `98.css` |
| `frontend/app/globals.css` | swap import, add `@font-face` |
| `frontend/app/xp-patched.css` | delete |
| `frontend/components/windows/Window.tsx` | add `inactive` class on unfocused title bar |
| `frontend/components/desktop/Taskbar.tsx` | full rewrite to Win95 silver style |
| `frontend/components/desktop/StartMenu.tsx` | full rewrite with navy sidebar |
| `frontend/components/desktop/SystemTray.tsx` | inset border, absorb clock from Taskbar |
| `frontend/components/desktop/DesktopIcon.tsx` | minor label style tweak |
| `frontend/components/desktop/BootScreen.tsx` | full rewrite: Win95 logo + chunky bar |
| `frontend/components/dialogs/BalloonNotification.tsx` | rewrite as flat yellow tooltip |

---

## Task 1: Swap CSS library

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/app/globals.css`
- Delete: `frontend/app/xp-patched.css`

- [ ] **Step 1: Install 98.css and remove xp.css**

```bash
cd frontend
npm uninstall xp.css
npm install 98.css
```

Expected output: `added 1 package`, `removed 1 package`

- [ ] **Step 2: Delete the patched CSS file**

```bash
rm frontend/app/xp-patched.css
```

- [ ] **Step 3: Rewrite globals.css**

Replace the entire content of `frontend/app/globals.css`:

```css
@import "tailwindcss";
@import "98.css";

@font-face {
  font-family: "MS Sans Serif";
  src: url("./ms_sans_serif.woff2") format("woff2"),
       url("./ms_sans_serif.woff") format("woff");
  font-weight: 400;
}
@font-face {
  font-family: "MS Sans Serif";
  src: url("./ms_sans_serif_bold.woff2") format("woff2"),
       url("./ms_sans_serif_bold.woff") format("woff");
  font-weight: 700;
}

html,
body {
  height: 100%;
  margin: 0;
  font-family: "MS Sans Serif", Arial, sans-serif;
  font-size: 11px;
}

body {
  overflow: hidden;
  background: #008080;
}
```

- [ ] **Step 4: Verify dev server starts without CSS errors**

```bash
cd frontend
npm run dev
```

Expected: `✓ Ready in ...ms` with no CSS parse errors in the terminal. Open http://localhost:3000 — page loads (may look broken visually; that's fine for now).

- [ ] **Step 5: Run tests to confirm nothing broke**

```bash
cd frontend
npm test
```

Expected: `7 passed`

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/app/globals.css
git rm frontend/app/xp-patched.css
git commit -m "feat(win95): swap xp.css for 98.css"
```

---

## Task 2: Window — inactive title bar state

**Files:**
- Modify: `frontend/components/windows/Window.tsx`

`98.css` turns the title bar gray when the class `inactive` is present on `.title-bar`. The focused window is the one with the highest `z` value among all non-minimized windows.

- [ ] **Step 1: Update Window.tsx**

Replace the entire file:

```tsx
"use client";
import { ReactNode, useRef } from "react";
import { useWindows } from "@/state/window-manager";

export function Window({
  id,
  title,
  children,
  width = 520,
}: {
  id: string;
  title: string;
  children: ReactNode;
  width?: number;
}) {
  const win = useWindows((s) => s.windows.find((w) => w.id === id));
  const focus = useWindows((s) => s.focus);
  const close = useWindows((s) => s.close);
  const minimize = useWindows((s) => s.minimize);
  const move = useWindows((s) => s.move);
  const maxZ = useWindows((s) =>
    Math.max(...s.windows.filter((w) => !w.minimized).map((w) => w.z), 0)
  );
  const dragRef = useRef<{ ox: number; oy: number } | null>(null);

  if (!win || win.minimized) return null;

  const isActive = win.z === maxZ;

  return (
    <div
      className="window"
      style={{ position: "absolute", left: win.x, top: win.y, zIndex: win.z, width }}
      onMouseDown={() => focus(id)}
    >
      <div
        className={`title-bar${isActive ? "" : " inactive"}`}
        onMouseDown={(e) => {
          dragRef.current = { ox: e.clientX - win.x, oy: e.clientY - win.y };
          const onMove = (ev: MouseEvent) => {
            if (!dragRef.current) return;
            move(id, ev.clientX - dragRef.current.ox, ev.clientY - dragRef.current.oy);
          };
          const onUp = () => {
            dragRef.current = null;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
      >
        <div className="title-bar-text">{title}</div>
        <div className="title-bar-controls">
          <button aria-label="Minimize" onClick={() => minimize(id)} />
          <button aria-label="Maximize" />
          <button aria-label="Close" onClick={() => close(id)} />
        </div>
      </div>
      <div className="window-body">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Open two windows (e.g., Snake + Leaderboard). Click between them — the unfocused window title bar should be gray, focused should be navy.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/windows/Window.tsx
git commit -m "feat(win95): inactive title bar state"
```

---

## Task 3: Taskbar — Win95 silver style

**Files:**
- Modify: `frontend/components/desktop/Taskbar.tsx`

The XP blue gradient is replaced with silver `#c0c0c0`. The Start button gets a 4-color Windows flag SVG. Window buttons are plain beveled buttons (98.css `.button` style via `<button>`). The clock moves into SystemTray (Task 4) — Taskbar just renders `<SystemTray />`.

- [ ] **Step 1: Rewrite Taskbar.tsx**

Replace the entire file:

```tsx
"use client";
import { useState } from "react";
import { useWindows } from "@/state/window-manager";
import { SystemTray } from "./SystemTray";
import { StartMenu } from "./StartMenu";

const TYPE_LABEL: Record<string, string> = {
  game: "Snake",
  leaderboard: "High Scores",
  "my-nfts": "My NFTs",
};

function Win95Flag() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      style={{ marginRight: 4, flexShrink: 0 }}
      aria-hidden="true"
    >
      <rect x="0" y="0" width="7" height="7" fill="#FF0000" />
      <rect x="9" y="0" width="7" height="7" fill="#00AA00" />
      <rect x="0" y="9" width="7" height="7" fill="#0000AA" />
      <rect x="9" y="9" width="7" height="7" fill="#FFAA00" />
    </svg>
  );
}

export function Taskbar() {
  const [open, setOpen] = useState(false);
  const windows = useWindows((s) => s.windows);
  const focus = useWindows((s) => s.focus);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 28,
        background: "#c0c0c0",
        borderTop: "2px solid #ffffff",
        display: "flex",
        alignItems: "center",
        zIndex: 40,
        padding: "0 2px",
        gap: 2,
      }}
    >
      <button
        style={{
          display: "flex",
          alignItems: "center",
          fontWeight: "bold",
          height: 22,
          padding: "0 8px",
          fontFamily: '"MS Sans Serif", Arial, sans-serif',
          fontSize: 11,
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <Win95Flag />
        Start
      </button>

      <StartMenu open={open} onClose={() => setOpen(false)} />

      <div
        style={{
          width: 1,
          height: 20,
          borderLeft: "1px solid #808080",
          borderRight: "1px solid #ffffff",
          margin: "0 2px",
        }}
      />

      <div style={{ display: "flex", gap: 2, flex: 1, overflow: "hidden" }}>
        {windows.map((w) => (
          <button
            key={w.id}
            onClick={() => focus(w.id)}
            style={{
              height: 22,
              padding: "0 8px",
              maxWidth: 150,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 11,
              fontFamily: '"MS Sans Serif", Arial, sans-serif',
            }}
          >
            {TYPE_LABEL[w.type] ?? w.type}
          </button>
        ))}
      </div>

      <SystemTray />
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Bottom bar should be silver with a beveled top edge. Start button shows the 4-color flag + "Start" text.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/desktop/Taskbar.tsx
git commit -m "feat(win95): taskbar silver style + Win95 start button"
```

---

## Task 4: SystemTray — inset border + absorb clock

**Files:**
- Modify: `frontend/components/desktop/SystemTray.tsx`

Move the clock from Taskbar into SystemTray. Both the wallet indicator and clock get inset (sunken) 98.css-style borders.

- [ ] **Step 1: Rewrite SystemTray.tsx**

Replace the entire file:

```tsx
"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { useWallet } from "@/state/wallet";

const sunken: CSSProperties = {
  border: "1px solid",
  borderColor: "#808080 #ffffff #ffffff #808080",
  padding: "0 6px",
  height: 20,
  display: "flex",
  alignItems: "center",
  fontSize: 11,
  fontFamily: '"MS Sans Serif", Arial, sans-serif',
  gap: 4,
  background: "#c0c0c0",
};

export function SystemTray() {
  const address = useWallet((s) => s.address);
  const connect = useWallet((s) => s.connect);
  const disconnect = useWallet((s) => s.disconnect);
  const hydrate = useWallet((s) => s.hydrate);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, paddingRight: 4 }}>
      <div style={sunken}>
        {address ? (
          <button
            onClick={disconnect}
            title={address}
            style={{ background: "none", border: "none", cursor: "default", fontSize: 11, display: "flex", gap: 4, alignItems: "center", fontFamily: "inherit" }}
          >
            <span style={{ color: "#00aa00" }}>●</span>
            {address.slice(0, 5)}…{address.slice(-4)}
          </button>
        ) : (
          <button
            onClick={connect}
            style={{ background: "none", border: "none", cursor: "default", fontSize: 11, fontFamily: "inherit" }}
          >
            Connect Wallet
          </button>
        )}
      </div>
      <div style={sunken}>
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

System tray should show sunken wallet indicator + clock on the right side of the taskbar.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/desktop/SystemTray.tsx
git commit -m "feat(win95): system tray inset style + clock"
```

---

## Task 5: StartMenu — Win95 navy sidebar

**Files:**
- Modify: `frontend/components/desktop/StartMenu.tsx`

Win95 Start Menu: white popup with a vertical navy gradient sidebar showing "Windows 95", menu items with navy hover highlight.

- [ ] **Step 1: Rewrite StartMenu.tsx**

Replace the entire file:

```tsx
"use client";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";

const menuItemStyle: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "4px 16px 4px 8px",
  display: "flex",
  gap: 8,
  alignItems: "center",
  fontSize: 11,
  fontFamily: '"MS Sans Serif", Arial, sans-serif',
  background: "transparent",
  border: "none",
  cursor: "default",
  color: "#000000",
};

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <li role="none">
      <button
        role="menuitem"
        style={menuItemStyle}
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
        <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
        <span>{label}</span>
      </button>
    </li>
  );
}

export function StartMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const openWin = useWindows((s) => s.open);
  const disconnect = useWallet((s) => s.disconnect);

  if (!open) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 28,
        left: 0,
        display: "flex",
        border: "2px solid",
        borderColor: "#ffffff #808080 #808080 #ffffff",
        boxShadow: "2px 2px 0 #000000",
        zIndex: 50,
        background: "#c0c0c0",
      }}
    >
      {/* Navy sidebar */}
      <div
        style={{
          width: 28,
          background: "linear-gradient(to top, #000080, #1084d0)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          paddingBottom: 8,
        }}
      >
        <span
          style={{
            color: "#ffffff",
            fontSize: 13,
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            letterSpacing: 2,
            userSelect: "none",
            fontFamily: '"MS Sans Serif", Arial, sans-serif',
          }}
        >
          <strong>Windows</strong> 95
        </span>
      </div>

      {/* Menu items */}
      <div style={{ minWidth: 200, background: "#c0c0c0" }}>
        <ul
          role="menu"
          style={{ listStyle: "none", margin: 0, padding: "4px 0" }}
        >
          <MenuItem
            icon="🐍"
            label="Play Snake"
            onClick={() => { openWin("game"); onClose(); }}
          />
          <MenuItem
            icon="🏆"
            label="Leaderboard"
            onClick={() => { openWin("leaderboard"); onClose(); }}
          />
          <MenuItem
            icon="💾"
            label="My Snake NFTs"
            onClick={() => { openWin("my-nfts"); onClose(); }}
          />

          <li
            style={{
              borderTop: "1px solid #808080",
              borderBottom: "1px solid #ffffff",
              margin: "4px 0",
            }}
          />

          <MenuItem
            icon="🔌"
            label="Disconnect Wallet"
            onClick={() => { disconnect(); onClose(); }}
          />
          <MenuItem
            icon="⏻"
            label="Shut Down"
            onClick={() => location.reload()}
          />
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Click Start → menu appears with navy sidebar "Windows 95" rotated. Hover over items highlights navy. Click items opens correct windows.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/desktop/StartMenu.tsx
git commit -m "feat(win95): start menu with navy sidebar"
```

---

## Task 6: DesktopIcon — Win95 label style

**Files:**
- Modify: `frontend/components/desktop/DesktopIcon.tsx`

Win95 desktop icons: white text with black text-shadow on the label. No change to the icon itself (emoji stays).

- [ ] **Step 1: Rewrite DesktopIcon.tsx**

Replace the entire file:

```tsx
"use client";
export function DesktopIcon({
  label,
  emoji,
  onOpen,
}: {
  label: string;
  emoji: string;
  onOpen: () => void;
}) {
  return (
    <button
      onDoubleClick={onOpen}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: 80,
        background: "transparent",
        border: "none",
        cursor: "default",
        padding: 4,
        color: "#ffffff",
        fontFamily: '"MS Sans Serif", Arial, sans-serif',
        fontSize: 11,
      }}
    >
      <span style={{ fontSize: 36, lineHeight: 1 }}>{emoji}</span>
      <span
        style={{
          marginTop: 4,
          padding: "1px 2px",
          textAlign: "center",
          textShadow: "1px 1px 0 #000000",
          wordBreak: "break-word",
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Verify in browser**

Desktop icons show emoji + label with black text shadow on teal background.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/desktop/DesktopIcon.tsx
git commit -m "feat(win95): desktop icon label style"
```

---

## Task 7: BootScreen — Win95 startup sequence

**Files:**
- Modify: `frontend/components/desktop/BootScreen.tsx`

Black screen with 4-color Windows flag, "Windows 95" text (Times New Roman), chunky 16-block progress bar animating at 120ms/block, then fires `onDone` after all blocks fill + 300ms pause.

- [ ] **Step 1: Rewrite BootScreen.tsx**

Replace the entire file:

```tsx
"use client";
import { useEffect, useState } from "react";

const TOTAL_BLOCKS = 16;
const BLOCK_MS = 120;
const DONE_DELAY = TOTAL_BLOCKS * BLOCK_MS + 400;

export function BootScreen({ children }: { children: React.ReactNode }) {
  const [booted, setBooted] = useState(false);
  const [filled, setFilled] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFilled((n) => (n < TOTAL_BLOCKS ? n + 1 : n));
    }, BLOCK_MS);
    const timeout = setTimeout(() => setBooted(true), DONE_DELAY);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  if (booted) return <>{children}</>;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* 4-color Windows flag */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 4,
          marginBottom: 14,
        }}
      >
        <div style={{ width: 44, height: 44, background: "#FF0000" }} />
        <div style={{ width: 44, height: 44, background: "#00AA00" }} />
        <div style={{ width: 44, height: 44, background: "#0000AA" }} />
        <div style={{ width: 44, height: 44, background: "#FFAA00" }} />
      </div>

      {/* "Windows 95" text */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 32,
          color: "#ffffff",
        }}
      >
        <span
          style={{
            fontFamily: "Times New Roman, serif",
            fontSize: 26,
            fontWeight: 400,
            letterSpacing: 1,
          }}
        >
          Windows
        </span>
        <span
          style={{
            fontFamily: "Times New Roman, serif",
            fontSize: 26,
            fontWeight: 700,
          }}
        >
          95
        </span>
      </div>

      {/* Chunky progress bar */}
      <div
        style={{
          border: "1px solid #404040",
          padding: 3,
          background: "#000000",
        }}
      >
        <div style={{ display: "flex", gap: 2 }}>
          {Array.from({ length: TOTAL_BLOCKS }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                background: i < filled ? "#ffffff" : "#000000",
              }}
            />
          ))}
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          fontSize: 11,
          color: "#808080",
          fontFamily: '"MS Sans Serif", Arial, sans-serif',
        }}
      >
        Starting Windows 95...
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Hard-refresh http://localhost:3000. Should see:
- Black screen with 4-color flag + "Windows 95" text
- 16 white blocks filling left-to-right (~2s)
- Then desktop appears

- [ ] **Step 3: Commit**

```bash
git add frontend/components/desktop/BootScreen.tsx
git commit -m "feat(win95): boot screen with logo + chunky progress bar"
```

---

## Task 8: BalloonNotification — flat yellow tooltip

**Files:**
- Modify: `frontend/components/dialogs/BalloonNotification.tsx`

Replace the window-chrome balloon with a flat Win95 system tooltip: yellow background, 1px black border, title bold, body text below.

- [ ] **Step 1: Rewrite BalloonNotification.tsx**

Replace the entire file:

```tsx
"use client";
import { useToasts } from "@/state/toasts";

export function Balloons() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 36,
        right: 4,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        zIndex: 50,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          style={{
            width: 240,
            background: "#ffffe1",
            border: "1px solid #000000",
            padding: "4px 8px",
            cursor: "default",
            fontFamily: '"MS Sans Serif", Arial, sans-serif',
            fontSize: 11,
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: 2 }}>{t.title}</div>
          <div style={{ color: "#000000" }}>{t.body}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Trigger a toast (mint a score NFT or trigger a test toast). Should see flat yellow rectangle with title + body, no window chrome.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/dialogs/BalloonNotification.tsx
git commit -m "feat(win95): balloon notification as flat yellow tooltip"
```

---

## Task 9: Smoke test + type-check

- [ ] **Step 1: Run type-check**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Run tests**

```bash
cd frontend
npm test
```

Expected: `7 passed`

- [ ] **Step 3: Visual smoke test**

Walk through the HANDOFF.md checklist:
- [ ] Boot screen: black bg, Win95 flag, "Windows 95" text, 16-block bar fills → desktop
- [ ] Desktop: teal `#008080` bg, silver taskbar at bottom, Win95 flag Start button
- [ ] Click Start → menu opens with navy sidebar "Windows 95"
- [ ] System tray: sunken wallet button + clock (right side of taskbar)
- [ ] Double-click desktop icon → window opens with navy title bar, silver chrome, beveled borders
- [ ] Open two windows, click between → active = navy, inactive = gray title bar
- [ ] Balloon notification: flat yellow tooltip (trigger via mint)
- [ ] Game plays, Leaderboard loads, My NFTs loads

- [ ] **Step 4: Final commit**

```bash
git add -p  # stage any stray changes
git commit -m "feat(win95): full Win95 redesign complete"
```
