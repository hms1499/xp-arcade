"use client";
import { DesktopIcon } from "./DesktopIcon";
import { Taskbar } from "./Taskbar";
import { useWindows } from "@/state/window-manager";
import { unlockAudio } from "@/lib/sounds";

export function Desktop({ children }: { children: React.ReactNode }) {
  const open = useWindows((s) => s.open);

  return (
    <div
      className="fixed inset-0"
      onMouseDown={unlockAudio}
      onTouchStart={unlockAudio}
      style={{
        background:
          "linear-gradient(180deg, #4a90e2 0%, #7bb3e5 40%, #8fc859 60%, #4a8a3a 100%)",
      }}
    >
      <div className="absolute top-4 left-4 grid grid-cols-1 gap-4">
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
