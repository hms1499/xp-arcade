"use client";

export function TrayBalloon({
  icon, title, body, ctaLabel, onCta, onDismiss, ariaLabel,
}: {
  icon: string;
  title: string;
  body: string;
  ctaLabel: string;
  onCta: () => void;
  onDismiss: () => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="tray-balloon"
      style={{
        position: "fixed", bottom: 36, right: 8, width: 220,
        background: "#ffffe1", border: "1px solid #000000", padding: "8px 10px",
        fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif', fontSize: 11,
        zIndex: 60, boxShadow: "2px 2px 6px rgba(0,0,0,0.3)",
      }}
    >
      <button
        type="button" aria-label={ariaLabel} onClick={onDismiss}
        style={{
          position: "absolute", top: 4, right: 6, background: "none",
          border: "none", cursor: "pointer", fontSize: 10, color: "#666", padding: 0,
        }}
      >
        ✕
      </button>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div>
          <div style={{ fontWeight: "bold", marginBottom: 2 }}>{title}</div>
          <div style={{ color: "#444", marginBottom: 6, lineHeight: 1.4 }}>{body}</div>
          <button type="button" onClick={onCta} style={{ fontSize: 10, padding: "2px 10px" }}>
            {ctaLabel}
          </button>
        </div>
      </div>
      <div style={{
        position: "absolute", bottom: -8, right: 18, width: 0, height: 0,
        borderLeft: "7px solid transparent", borderRight: "7px solid transparent",
        borderTop: "8px solid #000000",
      }} />
      <div style={{
        position: "absolute", bottom: -7, right: 19, width: 0, height: 0,
        borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
        borderTop: "7px solid #ffffe1",
      }} />
    </div>
  );
}
