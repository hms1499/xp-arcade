"use client";

import { useEffect, useMemo, useState } from "react";
import { GAMES, type GameId } from "@/lib/game-registry";
import {
  scoreCardImage,
  shortPlayer,
  sumPrizePoolUstx,
  type LeaderboardSummary,
  type RankedEntry,
} from "@/lib/leaderboard-showcase";
import { useSeasonCountdown } from "@/lib/season-countdown";
import { formatScoreValue } from "@/lib/score-format";
import { useWindows } from "@/state/window-manager";
import { PrizePoolHero } from "./PrizePoolHero";
import { DailyChallengeWidget } from "./DailyChallengeWidget";
import { DesktopChampionPanel } from "./DesktopChampionPanel";
import type { ChampionEntry } from "@/lib/arcade-champion";

const GAME_IDS = Object.keys(GAMES) as GameId[];

type Slide = {
  gameId: GameId;
  entry: RankedEntry;
};

function panelStyle(width = 300): React.CSSProperties {
  return {
    width,
    background: "#c0c0c0",
    border: "2px solid",
    borderColor: "#ffffff #808080 #808080 #ffffff",
    boxShadow: "2px 2px 0 #000000",
    fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
    fontSize: 11,
  };
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </div>
  );
}

export function DesktopLeaderboardShowcase({
  summaries,
  seasonsByGame,
  poolsByGame,
  lastUpdated,
  error,
  championEntries,
  championIsNew,
}: {
  summaries: Record<GameId, LeaderboardSummary>;
  seasonsByGame: Record<GameId, number | null>;
  poolsByGame: Record<GameId, number | null>;
  lastUpdated: Date | null;
  error: string | null;
  championEntries: ChampionEntry[];
  championIsNew: boolean;
}) {
  const open = useWindows((s) => s.open);
  const countdown = useSeasonCountdown("snake");
  const [slideIndex, setSlideIndex] = useState(0);
  const slides = useMemo(
    () =>
      GAME_IDS.flatMap((gameId) =>
        summaries[gameId].topThree.map((entry) => ({ gameId, entry })),
      ),
    [summaries],
  );
  const activeSlide = slides.length > 0 ? slides[slideIndex % slides.length] : null;

  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => {
      setSlideIndex((current) => current + 1);
    }, 4500);
    return () => clearInterval(id);
  }, [slides.length]);

  return (
    <div
      className="desktop-showcase"
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        alignItems: "flex-end",
        pointerEvents: "auto",
      }}
    >
      <PrizePoolHero
        totalUstx={sumPrizePoolUstx(poolsByGame)}
        gameCount={GAME_IDS.length}
        countdown={countdown}
      />
      <DailyChallengeWidget />
      <DesktopChampionPanel
        entries={championEntries}
        isNew={championIsNew}
        onOpen={() => open("arcade-champion")}
      />
      <section style={panelStyle()}>
        <PanelTitle>
          <span>🏆 Hall of Fame</span>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => open("highscore")}
            style={{ fontSize: 10, height: 18, padding: "0 6px" }}
          >
            Open
          </button>
        </PanelTitle>
        <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 5 }}>
          {GAME_IDS.map((gameId) => {
            const game = GAMES[gameId];
            const leader = summaries[gameId].leader;
            return (
              <button
                key={gameId}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => open("highscore", { initialTab: gameId })}
                style={{
                  display: "grid",
                  gridTemplateColumns: "74px 1fr 48px",
                  alignItems: "center",
                  gap: 6,
                  width: "100%",
                  minHeight: 24,
                  padding: "2px 5px",
                  textAlign: "left",
                  fontSize: 10,
                }}
              >
                <span style={{ fontWeight: "bold" }}>
                  {game.emoji} {game.label}
                </span>
                <span style={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {leader ? shortPlayer(leader.player) : "No scores"}
                </span>
                <span style={{ textAlign: "right", color: "#000080", fontWeight: "bold" }}>
                  {leader ? formatScoreValue(gameId, leader.score) : "—"}
                </span>
              </button>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", color: "#555", fontSize: 9 }}>
            <span>{error ? "Refresh issue" : "Live top minted scores"}</span>
            <span>{lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "…"}</span>
          </div>
        </div>
      </section>

      <section style={panelStyle()}>
        <PanelTitle>
          <span>⏳ Season Race</span>
        </PanelTitle>
        <div style={{ padding: 7, display: "grid", gap: 6 }}>
          {GAME_IDS.map((gameId) => {
            const game = GAMES[gameId];
            const cutoff = summaries[gameId].cutoff;
            const season = seasonsByGame[gameId];
            const pool = poolsByGame[gameId];
            return (
              <div
                key={gameId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "82px 38px 62px 1fr",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                <span>{game.emoji} {game.label}</span>
                <span style={{ fontFamily: "monospace", color: "#000080" }}>
                  S{season ?? "…"}
                </span>
                <span style={{ fontFamily: "monospace", color: "#006400" }}>
                  {pool === null ? "…" : `${(pool / 1_000_000).toFixed(2)} STX`}
                </span>
                <span style={{ color: "#555" }}>
                  {cutoff ? `#10 cutoff ${formatScoreValue(gameId, cutoff.score)}` : "Top-10 still open"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section style={panelStyle()}>
        <PanelTitle>
          <span>🖼️ Score Cards</span>
          {activeSlide && <span style={{ fontSize: 10 }}>#{activeSlide.entry.rank}</span>}
        </PanelTitle>
        {activeSlide ? (
          <ScoreCardSlide slide={activeSlide} />
        ) : (
          <div style={{ padding: 12, color: "#555", textAlign: "center" }}>
            Waiting for minted scores…
          </div>
        )}
      </section>
    </div>
  );
}

function ScoreCardSlide({ slide }: { slide: Slide }) {
  const game = GAMES[slide.gameId];
  const open = useWindows((s) => s.open);
  return (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => open("player-profile", { address: slide.entry.player })}
      style={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: "82px 1fr",
        gap: 8,
        alignItems: "center",
        padding: 8,
        textAlign: "left",
      }}
      title="Open player profile"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={scoreCardImage(slide.entry, game.label, slide.gameId)}
        alt={`${game.label} rank ${slide.entry.rank}`}
        style={{ width: 82, height: 82, objectFit: "cover", border: "2px inset #dfdfdf" }}
      />
      <span style={{ display: "grid", gap: 4 }}>
        <span style={{ fontWeight: "bold" }}>
          {game.emoji} {game.label} #{slide.entry.rank}
        </span>
        <span style={{ fontSize: 22, fontWeight: "bold", color: "#000080" }}>
          {formatScoreValue(slide.gameId, slide.entry.score)}
        </span>
        <span style={{ fontFamily: "monospace", color: "#555" }}>
          {shortPlayer(slide.entry.player)}
        </span>
      </span>
    </button>
  );
}
