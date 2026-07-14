"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { GameShellWindow } from "@/components/shared/GameShellWindow";
import { SharedMintDialog } from "@/components/shared/SharedMintDialog";
import { useGameSession } from "@/hooks/useGameSession";
import {
  type Difficulty,
  createMinesweeperState,
  chord,
  minesLeft,
  reveal,
  toggleFlag,
} from "./MinesweeperEngine";
import { MinesweeperBoard } from "./MinesweeperBoard";

const RANKED: Difficulty = "intermediate";
const clampScore = (sec: number) => Math.min(9999, Math.max(0, 9999 - sec));

export function MinesweeperWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "game-minesweeper"));
  const close = useWindows((s) => s.close);
  const { finalScore, showMint, isTopScore, riskReport, handleGameOver, handlePlayAgain } =
    useGameSession("minesweeper");

  const [difficulty, setDifficulty] = useState<Difficulty>(RANKED);
  const [game, setGame] = useState(() => createMinesweeperState(RANKED));
  const [flagMode, setFlagMode] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const submittedRef = useRef(false);

  // Live timer while playing.
  useEffect(() => {
    if (game.status !== "playing") return;
    const id = window.setInterval(() => {
      if (startedAtRef.current != null) {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [game.status]);

  // On a ranked win, submit the score once.
  useEffect(() => {
    if (game.status === "won" && difficulty === RANKED && !submittedRef.current) {
      submittedRef.current = true;
      const sec =
        startedAtRef.current != null
          ? Math.floor((Date.now() - startedAtRef.current) / 1000)
          : elapsed;
      void handleGameOver(clampScore(sec));
    }
  }, [game.status, difficulty, elapsed, handleGameOver]);

  const newGame = useCallback((d: Difficulty) => {
    setGame(createMinesweeperState(d));
    setElapsed(0);
    startedAtRef.current = null;
    submittedRef.current = false;
  }, []);

  const onReveal = useCallback(
    (r: number, c: number) => {
      if (flagMode) {
        setGame((g) => toggleFlag(g, r, c));
        return;
      }
      setGame((g) => {
        if (!g.minesPlaced) startedAtRef.current = Date.now();
        // Clicking an already-revealed number chords (reveals its neighbors);
        // a fresh cell reveals normally.
        const cell = g.grid[r][c];
        if (cell.revealed && cell.adjacent > 0) return chord(g, r, c);
        return reveal(g, r, c);
      });
    },
    [flagMode],
  );

  const onFlag = useCallback((r: number, c: number) => {
    setGame((g) => toggleFlag(g, r, c));
  }, []);

  if (!w) return null;

  const liveScore = clampScore(elapsed);
  const lost = game.status === "lost";
  const practiceWin = game.status === "won" && difficulty !== RANKED;

  return (
    <GameShellWindow gameId="minesweeper" score={liveScore} unscaled={showMint}>
      {showMint ? (
        <SharedMintDialog
          gameId="minesweeper"
          score={finalScore}
          isTopScore={isTopScore}
          riskReport={riskReport}
          onClose={() => close(w.id)}
          onPlayAgain={() => {
            handlePlayAgain();
            newGame(difficulty);
          }}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: 11,
              fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
            }}
          >
            <label>
              Level{" "}
              <select
                value={difficulty}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const d = e.target.value as Difficulty;
                  setDifficulty(d);
                  newGame(d);
                }}
              >
                <option value="beginner">Beginner 9x9</option>
                <option value="intermediate">Intermediate 16x16 (ranked)</option>
                <option value="expert">Expert 16x30</option>
              </select>
            </label>
            <span>💣 {minesLeft(game)}</span>
            <span>⏱ {elapsed}s</span>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setFlagMode((f) => !f);
              }}
              style={{ fontWeight: flagMode ? "bold" : "normal" }}
            >
              🚩 Flag {flagMode ? "ON" : "OFF"}
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                newGame(difficulty);
              }}
            >
              🙂 New
            </button>
          </div>

          {difficulty !== RANKED && (
            <div style={{ fontSize: 10, color: "#8a5a00" }}>
              Practice — only Intermediate is ranked &amp; mintable.
            </div>
          )}

          <div style={{ fontSize: 10, color: "#666" }}>
            Tip: right-click flags a mine · click a fully-flagged number to
            clear its neighbours.
          </div>

          <MinesweeperBoard
            state={game}
            onReveal={onReveal}
            onFlag={onFlag}
            disabled={lost || game.status === "won"}
          />

          {lost && (
            <div style={{ textAlign: "center", fontSize: 12 }}>
              <div style={{ fontWeight: "bold", color: "#aa0000" }}>💥 Boom!</div>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  newGame(difficulty);
                }}
              >
                Play Again
              </button>
            </div>
          )}

          {practiceWin && (
            <div style={{ textAlign: "center", fontSize: 12 }}>
              <div style={{ fontWeight: "bold", color: "#007700" }}>
                Cleared in {elapsed}s — practice run (not ranked)
              </div>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setDifficulty(RANKED);
                  newGame(RANKED);
                }}
              >
                Play Ranked (Intermediate)
              </button>
            </div>
          )}
        </div>
      )}
    </GameShellWindow>
  );
}
