"use client";
import { useState, useEffect } from "react";
import { useWindows } from "@/state/window-manager";
import { SystemTray } from "./SystemTray";
import { StartMenu } from "./StartMenu";

const TYPE_LABEL: Record<string, string> = {
  game: "🐍 Snake",
  leaderboard: "🏆 High Scores",
  "my-nfts": "💾 My NFTs",
};

export function Taskbar() {
  const [open, setOpen] = useState(false);
  const windows = useWindows((s) => s.windows);
  const focus = useWindows((s) => s.focus);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-b from-[#3a78d8] to-[#245edb] flex items-center z-40">
      <button
        className="h-8 px-4 bg-gradient-to-b from-[#5ea63b] to-[#3c8126] text-white font-bold rounded-r-2xl italic"
        onClick={() => setOpen((o) => !o)}
      >
        start
      </button>
      <StartMenu open={open} onClose={() => setOpen(false)} />
      <div className="flex gap-1 px-2 flex-1 overflow-hidden">
        {windows.map((w) => (
          <button
            key={w.id}
            onClick={() => focus(w.id)}
            className="px-3 h-6 bg-blue-600 hover:bg-blue-500 text-white text-xs truncate max-w-[150px]"
          >
            {TYPE_LABEL[w.type] ?? w.type}
          </button>
        ))}
      </div>
      <SystemTray />
      <div className="text-white text-xs px-3 border-l border-blue-400">
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );
}
