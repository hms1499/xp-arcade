"use client";

import { NightCityWallpaper } from "./NightCityWallpaper";
import { useDesktopTheme } from "@/state/desktop-theme";

export function DesktopWallpaper() {
  const theme = useDesktopTheme((s) => s.theme);

  if (theme === "classic-teal") return <ClassicTealWallpaper />;
  if (theme === "arcade-grid") return <ArcadeGridWallpaper />;
  return <NightCityWallpaper />;
}

function wallpaperBase(style: React.CSSProperties) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 0,
        ...style,
      }}
    />
  );
}

function ClassicTealWallpaper() {
  return wallpaperBase({
    background:
      "linear-gradient(135deg, #007070 0%, #008080 45%, #0b918f 100%)",
  });
}

function ArcadeGridWallpaper() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 0,
        background:
          "radial-gradient(circle at 50% 18%, rgba(0, 255, 170, 0.16), transparent 32%), linear-gradient(180deg, #05050d 0%, #101020 58%, #020208 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(70, 255, 190, 0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(70, 255, 190, 0.14) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          transform: "perspective(520px) rotateX(64deg) translateY(130px) scale(1.4)",
          transformOrigin: "center bottom",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(180deg, rgba(255,255,255,0.04) 0, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 4px)",
          opacity: 0.55,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "12%",
          right: "12%",
          top: "48%",
          height: 2,
          background: "linear-gradient(90deg, transparent, #22e5ff, #ff4fd8, transparent)",
          boxShadow: "0 0 16px rgba(34,229,255,0.6)",
        }}
      />
    </div>
  );
}
