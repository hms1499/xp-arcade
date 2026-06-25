"use client";
import type { ReactNode } from "react";

export function EmptyState({
  emoji,
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  emoji?: string;
  icon?: ReactNode;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "20px 12px",
        border: "1px solid #d0d0c8",
        background: "#f5f5f0",
        display: "grid",
        gap: 6,
        justifyItems: "center",
      }}
    >
      {icon ? (
        <span aria-hidden="true" style={{ lineHeight: 1 }}>
          {icon}
        </span>
      ) : emoji ? (
        <span aria-hidden="true" style={{ fontSize: 40, lineHeight: 1 }}>
          {emoji}
        </span>
      ) : null}
      <p style={{ margin: 0, fontWeight: "bold", fontSize: 13 }}>{title}</p>
      <p style={{ margin: 0, fontSize: 11, color: "#555", maxWidth: 280 }}>{body}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          className="default"
          onClick={onAction}
          style={{ marginTop: 4, fontWeight: "bold" }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
