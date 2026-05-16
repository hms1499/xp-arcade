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
  const [closing, setClosing] = useState(false);

  if (!win || win.minimized) return null;

  const isActive = win.z === maxZ;

  return (
    <div
      className={`window window-opening${closing ? " window-closing" : ""}`}
      style={{ position: "absolute", left: win.x, top: win.y, zIndex: win.z, width }}
      onMouseDown={() => focus(id)}
      onAnimationEnd={() => {
        if (closing) close(id);
      }}
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
          <button aria-label="Close" onClick={() => setClosing(true)} />
        </div>
      </div>
      <div className="window-body">{children}</div>
    </div>
  );
}
