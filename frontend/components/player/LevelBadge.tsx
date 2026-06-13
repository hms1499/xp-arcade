"use client";

import type { LevelInfo } from "@/lib/level";

export function LevelBadge({ info }: { info: LevelInfo }) {
  const pct = Math.max(0, Math.min(1, info.progress)) * 100;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
      <span
        className="text-[10px] font-bold"
        style={{
          border: "2px solid #000080",
          background: "#eef3ff",
          padding: "1px 5px",
          whiteSpace: "nowrap",
        }}
      >
        Lv {info.level}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="text-[10px] font-bold"
          style={{ display: "flex", justifyContent: "space-between", gap: 6 }}
        >
          <span>{info.title}</span>
          <span className="text-gray-600" style={{ fontWeight: "normal" }}>
            {info.xpIntoLevel.toLocaleString()} /{" "}
            {info.xpForNextLevel.toLocaleString()} XP
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`Level ${info.level} progress`}
          aria-valuenow={info.xpIntoLevel}
          aria-valuemin={0}
          aria-valuemax={info.xpForNextLevel}
          style={{ height: 4, background: "#c0c0c0", marginTop: 2 }}
        >
          <div
            aria-hidden
            style={{ height: "100%", width: `${pct}%`, background: "#000080" }}
          />
        </div>
      </div>
    </div>
  );
}
