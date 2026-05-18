"use client";
import { useEffect, useState } from "react";

const STATUS_MESSAGES = [
  "Loading fonts...",
  "Connecting to Stacks mainnet...",
  "Preparing game engine...",
  "Almost ready...",
];

const FAST_BOOT_MS = 800;
const FULL_BOOT_MS = 3200;

export function BootScreen({ children }: { children: React.ReactNode }) {
  const [statusIdx, setStatusIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const fast = typeof sessionStorage !== "undefined" && sessionStorage.getItem("xp-booted") === "1";
    const duration = fast ? FAST_BOOT_MS : FULL_BOOT_MS;

    const msgInterval = setInterval(() => {
      setStatusIdx((i) => (i + 1) % STATUS_MESSAGES.length);
    }, 800);

    let innerTimeout: ReturnType<typeof setTimeout> | undefined;
    const fadeTimeout = setTimeout(() => {
      clearInterval(msgInterval);
      setFading(true);
      innerTimeout = setTimeout(() => {
        if (typeof sessionStorage !== "undefined") sessionStorage.setItem("xp-booted", "1");
        setBooted(true);
      }, 400);
    }, duration);

    return () => {
      clearInterval(msgInterval);
      clearTimeout(fadeTimeout);
      if (innerTimeout) clearTimeout(innerTimeout);
    };
  }, []);

  if (booted) {
    return (
      <div className="desktop-fade-in" style={{ animation: "desktop-fade-in 300ms ease-out both" }}>
        {children}
      </div>
    );
  }

  return (
    <div
      className={fading ? "boot-fade-out" : undefined}
      style={{
        position: "fixed",
        inset: 0,
        background: "#000080",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        animation: fading ? "boot-fade-out 400ms ease-in both" : undefined,
      }}
    >
      {/* Logo */}
      <div style={{ fontSize: 32, letterSpacing: -2, fontFamily: "Arial, sans-serif", fontWeight: 700 }}>
        <span style={{ color: "#ffff00" }}>xp</span>
        <span style={{ color: "#ffffff", fontWeight: 300 }}>snake</span>
      </div>

      {/* Status text */}
      <div style={{ color: "#aaaaaa", fontSize: 11, fontFamily: "Arial, sans-serif", letterSpacing: "0.05em", minHeight: 16 }}>
        {STATUS_MESSAGES[statusIdx]}
      </div>

      {/* XP progress bar */}
      <div style={{
        width: 120, height: 12,
        background: "#000058",
        border: "1px solid #4444aa",
        borderRadius: 2,
        overflow: "hidden",
      }}>
        <div
          className="xp-bar-slider"
          style={{
            width: "25%",
            height: "100%",
            background: "linear-gradient(to right, #1e3a8a, #60a5fa, #1e3a8a)",
            animation: "xp-bar-slide 1.2s linear infinite",
          }}
        />
      </div>

      {/* Footnote */}
      <div style={{ color: "#4444aa", fontSize: 9, fontFamily: "Arial, sans-serif" }}>
        Stacks mainnet
      </div>
    </div>
  );
}
