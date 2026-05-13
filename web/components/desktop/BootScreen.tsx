"use client";
import { useEffect, useState } from "react";

export function BootScreen({ children }: { children: React.ReactNode }) {
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 1400);
    return () => clearTimeout(t);
  }, []);

  if (booted) return <>{children}</>;

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center">
      <div className="text-3xl mb-1 font-bold tracking-wide">XP Snake</div>
      <div className="text-xs text-gray-400 mb-6">on Stacks</div>
      <div className="w-64 h-3 bg-gray-900 overflow-hidden border border-gray-700">
        <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 animate-pulse" />
      </div>
      <div className="text-[10px] text-gray-500 mt-4">Starting Windows…</div>
    </div>
  );
}
