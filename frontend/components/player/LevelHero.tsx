"use client";

import type { LevelInfo, XpBreakdown } from "@/lib/level";
import { nextTitleUnlock } from "@/lib/level";

export function LevelHero({
  info,
  breakdown,
}: {
  info: LevelInfo;
  breakdown?: XpBreakdown | null;
}) {
  const pct = Math.max(0, Math.min(1, info.progress)) * 100;
  const next = nextTitleUnlock(info.level);

  return (
    <div
      style={{
        border: "2px solid #000080",
        background: "#eef3ff",
        padding: 8,
        margin: "4px 0",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 22, fontWeight: "bold", color: "#000080" }}>
          Lv {info.level}
        </span>
        <span style={{ fontSize: 13, fontWeight: "bold" }}>{info.title}</span>
      </div>

      <div
        role="progressbar"
        aria-label={`Level ${info.level} progress`}
        aria-valuenow={info.xpIntoLevel}
        aria-valuemin={0}
        aria-valuemax={info.xpForNextLevel}
        style={{ height: 8, background: "#c0c0c0", marginTop: 4 }}
      >
        <div
          aria-hidden
          style={{ height: "100%", width: `${pct}%`, background: "#000080" }}
        />
      </div>

      <div
        className="text-[10px]"
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 6,
          marginTop: 2,
        }}
      >
        <span>
          {info.xpIntoLevel.toLocaleString()} /{" "}
          {info.xpForNextLevel.toLocaleString()} XP
        </span>
        {next ? (
          <span>
            Next: {next.title} @ Lv {next.atLevel}
          </span>
        ) : (
          <span>Max title reached 👑</span>
        )}
      </div>

      {breakdown && (
        <div
          className="text-[10px] text-gray-600"
          style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <span>On-chain {breakdown.base.toLocaleString()}</span>
          <span>Play {breakdown.play.toLocaleString()}</span>
          <span>Streak {breakdown.streak.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
