"use client";

export function ShutdownScreen({ onWake }: { onWake: () => void }) {
  return (
    <div
      onClick={onWake}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "#000000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        animation: "desktop-fade-in 600ms ease-out both",
      }}
    >
      <span
        style={{
          color: "#FFA600",
          fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
          fontSize: 20,
          textShadow: "0 0 8px rgba(255,166,0,0.5)",
        }}
      >
        It&apos;s now safe to turn off your computer.
      </span>
    </div>
  );
}
