"use client";
import { GAME_IDS, GAMES, type GameId } from "@/lib/game-registry";
import { shortPlayer } from "@/lib/leaderboard-showcase";
import type { ChampionEntry } from "@/lib/arcade-champion";

const PODIUM_ORDER = [1, 0, 2]; // silver, gold, bronze (gold center)
const PODIUM_HEIGHT: Record<number, number> = { 0: 64, 1: 48, 2: 40 };
const PODIUM_COLOR: Record<number, string> = { 0: "#ffd700", 1: "#c0c0c0", 2: "#cd7f32" };
const CONFETTI_COLORS = ["#ffd700", "#19d1ff", "#ff4fd8", "#7CFC00", "#ffffff"];

function Confetti() {
  return (
    <div className="champion-confetti" aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {Array.from({ length: 18 }).map((_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 53) % 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(i % 6) * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

function MedalStrip({ ranks }: { ranks: Record<GameId, number | null> }) {
  return (
    <span style={{ display: "inline-flex", gap: 4, fontSize: 10, fontFamily: "monospace" }}>
      {GAME_IDS.map((id) => {
        const rank = ranks[id];
        const lit = rank != null;
        return (
          <span key={id} title={`${GAMES[id].label}${lit ? ` #${rank}` : ""}`} style={{ opacity: lit ? 1 : 0.25 }}>
            {GAMES[id].emoji}
            {lit ? rank : "·"}
          </span>
        );
      })}
    </span>
  );
}

export function ChampionBoard({
  champions,
  season,
  address,
  newChampion,
  lastUpdated,
}: {
  champions: ChampionEntry[];
  season: number | null;
  address: string | null;
  newChampion: { player: string; dethroned: string | null } | null;
  lastUpdated: Date | null;
}) {
  const podium = PODIUM_ORDER.map((i) => champions[i]).filter(Boolean) as ChampionEntry[];

  return (
    <div className="champion-screen" style={{ padding: 10, minHeight: 320, fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif' }}>
      <Confetti />

      {newChampion && (
        <div
          className="champion-banner"
          style={{
            background: "linear-gradient(90deg,#fff4b0,#ffd86b,#fff4b0)",
            color: "#7a5c00",
            fontWeight: "bold",
            textAlign: "center",
            padding: "3px 6px",
            marginBottom: 8,
            fontSize: 11,
          }}
        >
          🎉 NEW CHAMPION 🎉 {shortPlayer(newChampion.player)}
          {newChampion.dethroned ? ` dethroned ${shortPlayer(newChampion.dethroned)}` : ""}
        </div>
      )}

      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <div className="champion-marquee" style={{ fontSize: 18, fontWeight: "bold", letterSpacing: 3 }}>
          ★ ARCADE CHAMPION ★
        </div>
        <div style={{ fontSize: 10, color: "#9fb0e6" }}>
          {season != null ? `Season ${season} · ` : ""}live
        </div>
      </div>

      {champions.length === 0 ? (
        <div style={{ textAlign: "center", color: "#9fb0e6", padding: "24px 0", fontSize: 12 }}>
          No ranked players yet. Mint a top-10 score in any game to enter the race.
        </div>
      ) : (
        <>
          {/* Podium */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 10, marginBottom: 12 }}>
            {podium.map((c) => {
              const place = champions.indexOf(c);
              return (
                <div key={c.player} className="champion-pop" style={{ textAlign: "center", width: 84 }}>
                  {place === 0 && <div className="champion-crown" style={{ fontSize: 18 }}>👑</div>}
                  <div style={{ fontSize: 10, fontFamily: "monospace" }}>{shortPlayer(c.player)}</div>
                  <div style={{ fontWeight: "bold", color: "#ffe169" }}>{c.points} pts</div>
                  <div
                    style={{
                      height: PODIUM_HEIGHT[place],
                      background: PODIUM_COLOR[place],
                      color: "#1a1a1a",
                      fontWeight: "bold",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "3px 3px 0 0",
                    }}
                  >
                    #{place + 1}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Full ranking */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {champions.map((c, i) => {
              const isMe = c.player === address;
              return (
                <div
                  key={c.player}
                  className={isMe ? "champion-you" : undefined}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "26px 88px 1fr auto",
                    alignItems: "center",
                    gap: 6,
                    padding: "2px 6px",
                    fontSize: 11,
                    background: isMe ? "rgba(255,207,51,0.12)" : "rgba(255,255,255,0.03)",
                    borderRadius: 3,
                  }}
                >
                  <span style={{ fontWeight: "bold", color: "#ffe169" }}>#{i + 1}</span>
                  <span style={{ fontFamily: "monospace", color: "#cfe" }}>
                    {isMe ? "YOU" : shortPlayer(c.player)}
                  </span>
                  <MedalStrip ranks={c.ranks} />
                  <span style={{ fontWeight: "bold", fontFamily: "monospace" }}>{c.points} pts</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ marginTop: 8, fontSize: 9, color: "#7e8cc0", textAlign: "center" }}>
        {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Loading"}
        {" · cross-game rank points · resets each season"}
      </div>
    </div>
  );
}
