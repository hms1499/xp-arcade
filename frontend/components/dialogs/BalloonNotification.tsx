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
            fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
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
