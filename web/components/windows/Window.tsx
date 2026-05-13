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
  const dragRef = useRef<{ ox: number; oy: number } | null>(null);

  if (!win || win.minimized) return null;

  return (
    <div
      className="window absolute"
      style={{ left: win.x, top: win.y, zIndex: win.z, width }}
      onMouseDown={() => focus(id)}
    >
      <div
        className="title-bar"
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
