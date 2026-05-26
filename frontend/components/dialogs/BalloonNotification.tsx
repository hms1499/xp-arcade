"use client";
import { useEffect, useRef } from "react";
import { useToasts } from "@/state/toasts";
import type { ToastType } from "@/state/toasts";
import { playBalloon } from "@/lib/sounds";

const TYPE_ICON: Record<ToastType, string> = {
  info:    "ℹ️",
  success: "✅",
  error:   "❌",
};

export function Balloons() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  const prevLen = useRef(0);

  useEffect(() => {
    if (toasts.length > prevLen.current) playBalloon();
    prevLen.current = toasts.length;
  }, [toasts.length]);

  return (
    <div
      className="toast-stack"
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
            fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
            fontSize: 11,
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: 2, display: "flex", gap: 4, alignItems: "center" }}>
            <span>{TYPE_ICON[t.type] ?? TYPE_ICON.info}</span>
            {t.title}
          </div>
          <div style={{ color: "#000000" }}>{t.body}</div>
        </div>
      ))}
    </div>
  );
}
