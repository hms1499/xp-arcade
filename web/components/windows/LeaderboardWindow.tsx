"use client";
import { useWindows } from "@/state/window-manager";
import { Window } from "./Window";

export function LeaderboardWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "leaderboard"));
  if (!w) return null;
  return (
    <Window id={w.id} title="High Scores">
      <div className="p-4 text-sm">Leaderboard goes here</div>
    </Window>
  );
}
