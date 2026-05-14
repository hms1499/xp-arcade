"use client";
import { DesktopIcon } from "./DesktopIcon";
import { Taskbar } from "./Taskbar";
import { NightCityWallpaper } from "./NightCityWallpaper";
import { useWindows } from "@/state/window-manager";
import { unlockAudio } from "@/lib/sounds";

export function Desktop({ children }: { children: React.ReactNode }) {
  const open = useWindows((s) => s.open);

  return (
    <div
      className="fixed inset-0"
      onMouseDown={unlockAudio}
      onTouchStart={unlockAudio}
      style={{ background: "#00030c" }}
    >
      <NightCityWallpaper />
      <div className="absolute top-4 left-4 grid grid-cols-1 gap-4" style={{ zIndex: 1 }}>
        <DesktopIcon label="Snake.exe" emoji="🐍" onOpen={() => open("game")} />
        <DesktopIcon
          label="High Scores"
          emoji="🏆"
          onOpen={() => open("leaderboard")}
        />
        <DesktopIcon label="My NFTs" emoji="💾" onOpen={() => open("my-nfts")} />
      </div>
      {children}
      <Taskbar />
    </div>
  );
}
