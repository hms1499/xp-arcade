"use client";

import { type PlayerStats, ustxToStx } from "@/lib/player-stats";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-gray-300 bg-white p-2">
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className="text-base font-bold">{value}</div>
    </div>
  );
}

export function PlayerStatsPanel({ stats }: { stats: PlayerStats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
      <Stat label="Best score" value={stats.bestScore} />
      <Stat label="Mints" value={stats.totalMints} />
      <Stat label="Seasons" value={stats.seasonsPlayed} />
      <Stat label="Fees paid" value={`${ustxToStx(stats.mintFeesUstx)} STX`} />
    </div>
  );
}
