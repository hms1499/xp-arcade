"use client";
import { useEffect, useRef, useState } from "react";
import { GAMES, type GameId } from "@/lib/game-registry";
import { downloadCanvasPng, drawScoreCard } from "@/lib/score-card";
import { ShareActions } from "@/components/shared/ShareActions";

export function ShareScoreCard({
  gameId,
  score,
  player,
  rankHint,
  txId,
  tokenId,
}: {
  gameId: GameId;
  score: number;
  player?: string | null;
  rankHint?: string | null;
  txId?: string | null;
  tokenId?: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      drawScoreCard(canvas, { gameId, score, player, rankHint, txId });
      canvas.dataset.ready = "true";
    } catch (e) {
      canvas.dataset.ready = "false";
      console.error(e);
    }
  }, [gameId, player, rankHint, score, txId]);

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.dataset.ready !== "true") {
      setRenderError(true);
      return;
    }
    const game = GAMES[gameId].label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    downloadCanvasPng(canvas, `xp-arcade-${game}-${score}.png`);
  }

  return (
    <div
      style={{
        border: "1px solid #d0d0c8",
        background: "#f5f5f0",
        padding: 6,
        marginBottom: 8,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "96px 1fr",
          gap: 8,
          alignItems: "center",
        }}
      >
        <canvas
          ref={canvasRef}
          width={1200}
          height={630}
          aria-label="Shareable score card preview"
          style={{
            width: 96,
            height: 50,
            border: "1px solid #999",
            background: "#111",
          }}
        />
        <div style={{ display: "grid", gap: 4 }}>
          <b style={{ fontSize: 11 }}>Score card</b>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <ShareActions gameId={gameId} score={score} tokenId={tokenId} />
            <button onClick={handleDownload}>
              Download PNG
            </button>
          </div>
          {renderError && (
            <span className="text-red-600 text-[10px]">
              Score card could not be rendered.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
