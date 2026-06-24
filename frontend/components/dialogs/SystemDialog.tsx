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
