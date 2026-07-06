"use client";
import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";
import {
  useWindows,
  isResizableType,
  resizeGeometry,
  type ResizeEdges,
} from "@/state/window-manager";

const EDGE = 6;
const CORNER = 12;

const RESIZE_HANDLES: {
  dir: string;
  edges: ResizeEdges;
  style: CSSProperties;
}[] = [
  { dir: "n", edges: { top: true }, style: { top: 0, left: CORNER, right: CORNER, height: EDGE } },
  { dir: "s", edges: { bottom: true }, style: { bottom: 0, left: CORNER, right: CORNER, height: EDGE } },
  { dir: "e", edges: { right: true }, style: { top: CORNER, bottom: CORNER, right: 0, width: EDGE } },
  { dir: "w", edges: { left: true }, style: { top: CORNER, bottom: CORNER, left: 0, width: EDGE } },
  { dir: "nw", edges: { top: true, left: true }, style: { top: 0, left: 0, width: CORNER, height: CORNER } },
  { dir: "ne", edges: { top: true, right: true }, style: { top: 0, right: 0, width: CORNER, height: CORNER } },
  { dir: "sw", edges: { bottom: true, left: true }, style: { bottom: 0, left: 0, width: CORNER, height: CORNER } },
  { dir: "se", edges: { bottom: true, right: true }, style: { bottom: 0, right: 0, width: CORNER, height: CORNER } },
];

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
  const toggleMaximize = useWindows((s) => s.toggleMaximize);
  const resize = useWindows((s) => s.resize);
  const maxZ = useWindows((s) =>
    Math.max(...s.windows.filter((w) => !w.minimized).map((w) => w.z), 0)
  );
  const dragRef = useRef<{ ox: number; oy: number } | null>(null);
  const flashingRef = useRef(false);
  const titlebarRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const [compactViewport, setCompactViewport] = useState(false);

  // Safety net: close after animation duration even if animationend doesn't fire
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => close(id), 150);
    return () => clearTimeout(t);
  }, [closing, close, id]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px), (max-height: 620px)");
    const update = () => setCompactViewport(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  if (!win || win.minimized) return null;

  const isActive = win.z === maxZ;

  const effectiveWidth = win.w ?? width;
  const resizable =
    isResizableType(win.type) && !win.maximized && !compactViewport;

  const startResize =
    (edges: ResizeEdges) => (e: React.MouseEvent) => {
      e.preventDefault();
      const start = {
        x: win.x,
        y: win.y,
        w: effectiveWidth,
        // First-ever resize: measure the current auto height.
        h: win.h ?? rootRef.current?.offsetHeight ?? 200,
      };
      const sx = e.clientX;
      const sy = e.clientY;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const onMove = (ev: MouseEvent) => {
        resize(id, resizeGeometry(start, edges, ev.clientX - sx, ev.clientY - sy, viewport));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-labelledby={`${id}-title`}
      className={`window window-opening${closing ? " window-closing" : ""}`}
      style={
        win.maximized || compactViewport
          ? {
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: compactViewport ? 32 : 28,
              zIndex: win.z,
              display: "flex",
              flexDirection: "column",
            }
          : {
              position: "absolute",
              left: win.x,
              top: win.y,
              zIndex: win.z,
              width: effectiveWidth,
              maxWidth: "calc(100vw - 8px)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              ...(win.h
                ? { height: win.h }
                : { maxHeight: "calc(100vh - 36px)" }),
            }
      }
      onMouseDown={() => focus(id)}
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) close(id);
      }}
    >
      <div
        ref={titlebarRef}
        className={`title-bar${isActive ? "" : " inactive"}`}
        onDoubleClick={() => {
          if (!compactViewport) toggleMaximize(id);
        }}
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
          // No window dragging while maximized (focus/flash above still run).
          if (win.maximized || compactViewport) return;
          dragRef.current = { ox: e.clientX - win.x, oy: e.clientY - win.y };
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const onMove = (ev: MouseEvent) => {
            if (!dragRef.current) return;
            const rawX = ev.clientX - dragRef.current.ox;
            const rawY = ev.clientY - dragRef.current.oy;
            const clampedX = Math.max(-effectiveWidth + 60, Math.min(rawX, vw - 60));
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
        <div id={`${id}-title`} className="title-bar-text">{title}</div>
        <div className="title-bar-controls">
          <button aria-label="Minimize" onClick={() => minimize(id)} />
          {!compactViewport && (
            <button
              aria-label={win.maximized ? "Restore" : "Maximize"}
              onClick={() => toggleMaximize(id)}
            />
          )}
          <button aria-label="Close" onClick={() => setClosing(true)} />
        </div>
      </div>
      <div
        className="window-body"
        style={
          win.maximized || compactViewport || win.h
            ? { flex: 1, overflow: "auto", minHeight: 0 }
            : { minHeight: 0, overflow: "auto" }
        }
      >
        {children}
      </div>
      {resizable &&
        RESIZE_HANDLES.map((h) => (
          <div
            key={h.dir}
            data-resize={h.dir}
            onMouseDown={startResize(h.edges)}
            style={{ position: "absolute", zIndex: 3, ...h.style }}
          />
        ))}
    </div>
  );
}
