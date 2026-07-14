"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { GameShellWindow } from "@/components/shared/GameShellWindow";
import { SharedMintDialog } from "@/components/shared/SharedMintDialog";
import { useGameSession } from "@/hooks/useGameSession";
import { solitaireScore } from "@/lib/solitaire-score";
import {
  type DrawMode,
  type PileRef,
  type SolitaireState,
  autoComplete,
  canAutoComplete,
  createGame,
  draw,
  moveCards,
  selectableRun,
  sendToFoundation,
} from "./SolitaireEngine";
import { SolitaireBoard, type Selected } from "./SolitaireBoard";

const RANKED: DrawMode = 3;

export function SolitaireWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "game-solitaire"));
  const close = useWindows((s) => s.close);
  const { finalScore, showMint, isTopScore, riskReport, handleGameOver, handlePlayAgain } =
    useGameSession("solitaire");

  const [drawMode, setDrawMode] = useState<DrawMode>(RANKED);
  const [game, setGame] = useState<SolitaireState>(() => createGame(RANKED));
  const [selected, setSelected] = useState<Selected>(null);
  const [elapsed, setElapsed] = useState(0);
  // Mirrored into state (not just a ref) so the frozen time is render-readable.
  const [frozenSeconds, setFrozenSeconds] = useState<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const frozenSecondsRef = useRef<number | null>(null);
  const submittedRef = useRef(false);

  // Live timer until auto-complete becomes available or the game is won.
  useEffect(() => {
    if (game.won || frozenSeconds != null) return;
    const id = window.setInterval(() => {
      if (startedAtRef.current != null) {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [game.won, frozenSeconds]);

  // Freeze the clock the moment the board can finish itself.
  useEffect(() => {
    if (frozenSecondsRef.current == null && canAutoComplete(game) && startedAtRef.current != null) {
      const sec = Math.floor((Date.now() - startedAtRef.current) / 1000);
      frozenSecondsRef.current = sec;
      setFrozenSeconds(sec);
    }
  }, [game]);

  // Submit the score once on a ranked win.
  useEffect(() => {
    if (game.won && drawMode === RANKED && !submittedRef.current) {
      submittedRef.current = true;
      const sec = frozenSecondsRef.current ?? elapsed;
      void handleGameOver(solitaireScore(sec));
    }
  }, [game.won, drawMode, elapsed, handleGameOver]);

  const newGame = useCallback((mode: DrawMode) => {
    setGame(createGame(mode));
    setSelected(null);
    setElapsed(0);
    setFrozenSeconds(null);
    startedAtRef.current = null;
    frozenSecondsRef.current = null;
    submittedRef.current = false;
  }, []);

  const ensureStarted = useCallback(() => {
    if (startedAtRef.current == null) startedAtRef.current = Date.now();
  }, []);

  const applyMove = useCallback((from: PileRef, index: number, to: PileRef) => {
    ensureStarted();
    setGame((g) => moveCards(g, from, index, to));
    setSelected(null);
  }, [ensureStarted]);

  const onStockClick = useCallback(() => {
    ensureStarted();
    setSelected(null);
    setGame((g) => draw(g));
  }, [ensureStarted]);

  const onWasteClick = useCallback(() => {
    if (game.waste.length === 0) return;
    setSelected((sel) => (sel && "waste" in sel ? null : { waste: true }));
  }, [game.waste.length]);

  const onFoundationClick = useCallback((f: number) => {
    if (!selected) return;
    if ("waste" in selected) applyMove({ kind: "waste" }, game.waste.length - 1, { kind: "foundation", index: f });
    else applyMove({ kind: "tableau", index: selected.tableauIndex }, selected.cardIndex, { kind: "foundation", index: f });
  }, [selected, game.waste.length, applyMove]);

  const onTableauCardClick = useCallback((t: number, ci: number) => {
    if (selected) {
      if ("waste" in selected) applyMove({ kind: "waste" }, game.waste.length - 1, { kind: "tableau", index: t });
      else applyMove({ kind: "tableau", index: selected.tableauIndex }, selected.cardIndex, { kind: "tableau", index: t });
      return;
    }
    if (selectableRun(game, t, ci)) {
      ensureStarted();
      setSelected({ tableauIndex: t, cardIndex: ci });
    }
  }, [selected, game, applyMove, ensureStarted]);

  const onEmptyTableauClick = useCallback((t: number) => {
    if (!selected) return;
    if ("waste" in selected) applyMove({ kind: "waste" }, game.waste.length - 1, { kind: "tableau", index: t });
    else applyMove({ kind: "tableau", index: selected.tableauIndex }, selected.cardIndex, { kind: "tableau", index: t });
  }, [selected, game.waste.length, applyMove]);

  const onDoubleClick = useCallback((from: PileRef, index: number) => {
    ensureStarted();
    setSelected(null);
    setGame((g) => sendToFoundation(g, from, index));
  }, [ensureStarted]);

  const onAutoFinish = useCallback(() => {
    setGame((g) => autoComplete(g));
  }, []);

  if (!w) return null;

  const shownSeconds = frozenSeconds ?? elapsed;
  const liveScore = solitaireScore(shownSeconds);
  const practice = drawMode !== RANKED;
  const showAuto = canAutoComplete(game) && !game.won;

  return (
    <GameShellWindow
      gameId="solitaire"
      score={game.won && !practice ? liveScore : 0}
      unscaled={showMint}
    >
      {showMint ? (
        <SharedMintDialog
          gameId="solitaire"
          score={finalScore}
          isTopScore={isTopScore}
          riskReport={riskReport}
          onClose={() => close(w.id)}
          onPlayAgain={() => {
            handlePlayAgain();
            newGame(drawMode);
          }}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif' }}>
            <label>
              Draw{" "}
              <select
                value={drawMode}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const m = Number(e.target.value) as DrawMode;
                  setDrawMode(m);
                  newGame(m);
                }}
              >
                <option value={3}>3 (ranked)</option>
                <option value={1}>1 (practice)</option>
              </select>
            </label>
            <span>⏱ {shownSeconds}s</span>
            <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); newGame(drawMode); }}>
              🂠 New
            </button>
            {showAuto && (
              <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onAutoFinish(); }}>
                ⚡ Auto-finish
              </button>
            )}
          </div>

          {practice && (
            <div style={{ fontSize: 10, color: "#8a5a00" }}>
              Practice — only Draw-3 is ranked &amp; mintable.
            </div>
          )}

          <div style={{ fontSize: 10, color: "#666" }}>
            Tip: click a card then a destination · double-click sends to a foundation.
          </div>

          <SolitaireBoard
            state={game}
            selected={selected}
            on={{ onStockClick, onWasteClick, onFoundationClick, onTableauCardClick, onEmptyTableauClick, onDoubleClick }}
          />

          {game.won && practice && (
            <div style={{ textAlign: "center", fontSize: 12 }}>
              <div style={{ fontWeight: "bold", color: "#007700" }}>
                Solved in {shownSeconds}s — practice run (not ranked)
              </div>
              <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setDrawMode(RANKED); newGame(RANKED); }}>
                Play Ranked (Draw-3)
              </button>
            </div>
          )}
        </div>
      )}
    </GameShellWindow>
  );
}
