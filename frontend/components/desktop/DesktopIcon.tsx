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
        fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
        fontSize: 11,
      }}
    >
      <span style={{ fontSize: 36, lineHeight: "1" }}>{emoji}</span>
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
