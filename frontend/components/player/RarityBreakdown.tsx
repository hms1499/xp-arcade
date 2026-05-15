"use client";

import { rarityColor } from "@/lib/metadata-svg";

export function RarityBreakdown({
  counts,
}: {
  counts: Record<string, number>;
}) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mb-3">
      {entries.map(([rarity, n]) => (
        <span
          key={rarity}
          className="text-[10px] px-1.5 py-0.5 border border-gray-400 bg-white"
        >
          <span
            className="font-bold"
            style={{ color: rarityColor(rarity) }}
          >
            {rarity}
          </span>{" "}
          × {n}
        </span>
      ))}
    </div>
  );
}
