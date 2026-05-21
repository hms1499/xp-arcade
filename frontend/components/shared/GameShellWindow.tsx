"use client";
import { type GameId, GAMES } from "@/lib/game-registry";
import { useWindows } from "@/state/window-manager";
import { Window } from "@/components/windows/Window";

export function GameShellWindow({
  gameId,
  score,
  children,
}: {
  gameId: GameId;
  score: number;
  children: React.ReactNode;
}) {
  const game = GAMES[gameId];
  const w = useWindows((s) =>
    s.windows.find((win) => win.type === `game-${gameId}`)
  );
  const openWindow = useWindows((s) => s.open);

  if (!w) return null;

  return (
    <Window id={w.id} title={`${game.emoji} ${game.label}`}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "2px 6px",
            borderBottom: "1px solid #ccc",
            fontSize: 11,
            fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
          }}
        >
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                openWindow("highscore", { initialTab: gameId });
              }}
            >
              🏆 High Scores
            </button>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                openWindow("mynfts");
              }}
            >
              💾 My NFTs
            </button>
          </div>
          <span>
            Score: <b>{score}</b>
          </span>
        </div>
        <div className="p-2">{children}</div>
      </div>
    </Window>
  );
}
