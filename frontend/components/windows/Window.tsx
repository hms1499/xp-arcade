"use client";
import { ReactNode, useRef, useState } from "react";
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
  const flashingRef = useRef(false);
  const titlebarRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);

  if (!win || win.minimized) return null;

  const isActive = win.z === maxZ;

  return (
    <div
      className={`window window-opening${closing ? " window-closing" : ""}`}
      style={{ position: "absolute", left: win.x, top: win.y, zIndex: win.z, width }}
      onMouseDown={() => focus(id)}
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) close(id);
      }}
    >
      <div
        ref={titlebarRef}
        className={`title-bar${isActive ? "" : " inactive"}`}
        onMouseDown={(e) => {
          // Flash only when window becomes active (was not active before)
          if (!isActive && titlebarRef.current && !flashingRef.current) {
            flashingRef.current = true;
            titlebarRef.current.style.filter = "brightness(1.4)";
            setTimeout(() => {
              if (titlebarRef.current) titlebarRef.current.style.filter = "";
              flashingRef.current = false;
            }, 80);
          }
          dragRef.current = { ox: e.clientX - win.x, oy: e.clientY - win.y };
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const onMove = (ev: MouseEvent) => {
            if (!dragRef.current) return;
            const rawX = ev.clientX - dragRef.current.ox;
            const rawY = ev.clientY - dragRef.current.oy;
            const clampedX = Math.max(-width + 60, Math.min(rawX, vw - 60));
            const clampedY = Math.max(0, Math.min(rawY, vh - 28));
            move(id, clampedX, clampedY);
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
          <button
            aria-label="Close"
            onClick={() => {
              if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                close(id);
              } else {
                setClosing(true);
              }
            }}
          />
        </div>
      </div>
      <div className="window-body">{children}</div>
    </div>
  );
}
