"use client";
import { useWindows } from "@/state/window-manager";
import { Window } from "./Window";

export function GameWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "game"));
  if (!w) return null;
  return (
    <Window id={w.id} title="Snake — Untitled">
      <div className="p-4 text-sm">Game canvas goes here</div>
    </Window>
  );
}
