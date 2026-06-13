"use client";

import type { PlayerStats } from "@/lib/player-stats";
import { evaluateAchievements, earnedCount } from "@/lib/achievements";

export function AchievementsPanel({ stats }: { stats: PlayerStats }) {
  const list = evaluateAchievements(stats);
  const earned = earnedCount(list);

  return (
    <section className="mb-3">
      <div className="text-[10px] uppercase text-gray-500 mb-1">
        Achievements ({earned}/{list.length})
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {list.map((a) => (
          <div
            key={a.id}
            data-earned={a.earned}
            title={
              a.earned
                ? a.description
                : `${a.description} — Progress: ${a.current}/${a.target}`
            }
            className="text-center text-[10px] p-1"
            style={{
              border: a.earned ? "2px solid #000080" : "1px solid #c0c0c0",
              background: a.earned ? "#eef3ff" : "#f5f5f0",
            }}
          >
            <div
              style={{
                fontSize: 20,
                lineHeight: "24px",
                filter: a.earned ? "none" : "grayscale(1)",
                opacity: a.earned ? 1 : 0.5,
              }}
            >
              {a.icon}
            </div>
            <div
              className="truncate"
              style={{ fontWeight: a.earned ? "bold" : "normal" }}
            >
              {a.label}
            </div>
            {a.earned ? (
              <div style={{ color: "#007700" }}>✓</div>
            ) : (
              <>
                <div style={{ color: "#777" }}>
                  {a.current}/{a.target}
                </div>
                <div
                  role="progressbar"
                  aria-label={`${a.label} progress`}
                  aria-valuenow={a.current}
                  aria-valuemin={0}
                  aria-valuemax={a.target}
                  style={{ height: 3, background: "#c0c0c0", marginTop: 2 }}
                >
                  <div
                    aria-hidden
                    style={{
                      height: "100%",
                      width: `${(a.current / a.target) * 100}%`,
                      background: "#000080",
                    }}
                  />
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
