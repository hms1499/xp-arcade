"use client";
import { useState, useEffect } from "react";

export function DesktopIcon({
  label,
  emoji,
  onOpen,
}: {
  label: string;
  emoji: string;
  onOpen: () => void;
}) {
  const [selected, setSelected] = useState(false);

  // Deselect when clicking anywhere outside
  useEffect(() => {
    if (!selected) return;
    const handler = (e: MouseEvent) => {
      const el = document.getElementById(`icon-${label}`);
      if (el && !el.contains(e.target as Node)) setSelected(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [selected, label]);

  return (
    <button
      id={`icon-${label}`}
      onMouseDown={() => setSelected(true)}
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
        fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
        fontSize: 11,
      }}
    >
      <span
        style={{
          fontSize: 36,
          lineHeight: "1",
          outline: selected ? "1px dotted #ffffff" : "none",
          padding: 2,
        }}
      >
        {emoji}
      </span>
      <span
        style={{
          marginTop: 4,
          padding: "1px 2px",
          textAlign: "center",
          textShadow: selected ? "none" : "1px 1px 0 #000000",
          background: selected ? "#000080" : "transparent",
          wordBreak: "break-word",
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
    </button>
  );
}
