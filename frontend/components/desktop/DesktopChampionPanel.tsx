"use client";
import { shortPlayer } from "@/lib/leaderboard-showcase";
import type { ChampionEntry } from "@/lib/arcade-champion";

const panelStyle: React.CSSProperties = {
  width: 300,
  background: "#c0c0c0",
  border: "2px solid",
  borderColor: "#ffffff #808080 #808080 #ffffff",
  boxShadow: "2px 2px 0 #000000",
  fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
  fontSize: 11,
};

export function DesktopChampionPanel({
  entries,
  isNew,
  onOpen,
}: {
  entries: ChampionEntry[];
  isNew: boolean;
  onOpen: () => void;
}) {
  const champ = entries[0] ?? null;
  return (
    <section style={panelStyle}>
      <div
        style={{
          background: "linear-gradient(90deg, #000080, #1084d0)",
          color: "#ffffff",
          fontWeight: "bold",
          padding: "3px 6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>👑 Arcade Champion{isNew ? <span className="champion-you" style={{ marginLeft: 6, color: "#ffe169" }}>NEW!</span> : null}</span>
        <button onMouseDown={(e) => e.stopPropagation()} onClick={onOpen} style={{ fontSize: 10, height: 18, padding: "0 6px" }}>
          Open
        </button>
      </div>
      <div style={{ padding: 8 }}>
        {champ ? (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onOpen}
            style={{ width: "100%", display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 8, alignItems: "center", textAlign: "left" }}
            title="Open Arcade Champion"
          >
            <span style={{ fontSize: 22 }}>👑</span>
            <span style={{ fontFamily: "monospace" }}>{shortPlayer(champ.player)}</span>
            <span style={{ fontWeight: "bold", color: "#000080" }}>{champ.points} pts</span>
          </button>
        ) : (
          <div style={{ color: "#555", textAlign: "center", padding: "6px 0" }}>Awaiting ranked scores…</div>
        )}
      </div>
    </section>
  );
}
