"use client";
import { useEffect, useState } from "react";

const TOTAL_BLOCKS = 16;
const BLOCK_MS = 120;
const DONE_DELAY = TOTAL_BLOCKS * BLOCK_MS + 400;

export function BootScreen({ children }: { children: React.ReactNode }) {
  const [booted, setBooted] = useState(false);
  const [filled, setFilled] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFilled((n) => (n < TOTAL_BLOCKS ? n + 1 : n));
    }, BLOCK_MS);
    const timeout = setTimeout(() => setBooted(true), DONE_DELAY);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  if (booted) return <>{children}</>;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* 4-color Windows flag */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 4,
          marginBottom: 14,
        }}
      >
        <div style={{ width: 44, height: 44, background: "#FF0000" }} />
        <div style={{ width: 44, height: 44, background: "#00AA00" }} />
        <div style={{ width: 44, height: 44, background: "#0000AA" }} />
        <div style={{ width: 44, height: 44, background: "#FFAA00" }} />
      </div>

      {/* "Windows 95" text */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 32,
          color: "#ffffff",
        }}
      >
        <span
          style={{
            fontFamily: "Times New Roman, serif",
            fontSize: 26,
            fontWeight: 400,
            letterSpacing: 1,
          }}
        >
          Windows
        </span>
        <span
          style={{
            fontFamily: "Times New Roman, serif",
            fontSize: 26,
            fontWeight: 700,
          }}
        >
          95
        </span>
      </div>

      {/* Chunky progress bar */}
      <div
        style={{
          border: "1px solid #404040",
          padding: 3,
          background: "#000000",
        }}
      >
        <div style={{ display: "flex", gap: 2 }}>
          {Array.from({ length: TOTAL_BLOCKS }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                background: i < filled ? "#ffffff" : "#000000",
              }}
            />
          ))}
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          fontSize: 11,
          color: "#808080",
          fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
        }}
      >
        Starting Windows 95...
      </div>
    </div>
  );
}
