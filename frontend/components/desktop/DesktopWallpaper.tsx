"use client";

import { NightCityWallpaper } from "./NightCityWallpaper";
import { useDesktopTheme } from "@/state/desktop-theme";

export function DesktopWallpaper() {
  const theme = useDesktopTheme((s) => s.theme);

  if (theme === "snake-terminal") return <SnakeTerminalWallpaper />;
  if (theme === "tetris-rain") return <TetrisRainWallpaper />;
  if (theme === "pacman-maze") return <PacManMazeWallpaper />;
  return <NightCityWallpaper />;
}

const TETROMINOES = [
  { x: "8%", delay: "0s", color: "#00f0f0", blocks: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  { x: "22%", delay: "4s", color: "#f0f000", blocks: [[1, 0], [2, 0], [1, 1], [2, 1]] },
  { x: "39%", delay: "8s", color: "#a000f0", blocks: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  { x: "58%", delay: "2s", color: "#00f000", blocks: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  { x: "76%", delay: "6s", color: "#f00000", blocks: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  { x: "90%", delay: "10s", color: "#f0a000", blocks: [[0, 0], [0, 1], [1, 1], [2, 1]] },
];

const PACMAN_GHOSTS: Array<[number, number, string]> = [
  [270, 190, "#ff0000"],
  [875, 306, "#ffb8ff"],
  [985, 490, "#00ffff"],
];

function SnakeTerminalWallpaper() {
  const path = [
    [9, 7],
    [10, 7],
    [11, 7],
    [12, 7],
    [12, 8],
    [12, 9],
    [11, 9],
    [10, 9],
    [9, 9],
    [8, 9],
    [8, 10],
    [8, 11],
    [9, 11],
    [10, 11],
  ];

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 0,
        background:
          "radial-gradient(circle at 35% 22%, rgba(70,255,120,0.18), transparent 28%), linear-gradient(180deg, #020b04 0%, #051607 55%, #010401 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(90,255,130,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(90,255,130,0.12) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div
        className="snake-wallpaper-trail"
        style={{
          position: "absolute",
          left: "18%",
          top: "22%",
          width: 560,
          height: 360,
          filter: "drop-shadow(0 0 8px rgba(70,255,120,0.8))",
        }}
      >
        {path.map(([x, y], index) => (
          <span
            key={`${x}-${y}-${index}`}
            style={{
              position: "absolute",
              left: x * 24,
              top: y * 24,
              width: 22,
              height: 22,
              background: index === path.length - 1 ? "#b6ff8a" : "#35d85f",
              opacity: 0.22 + index / path.length / 2,
              border: "1px solid rgba(210,255,210,0.55)",
            }}
          />
        ))}
        <span
          style={{
            position: "absolute",
            left: 13 * 24,
            top: 8 * 24,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "#ff3b3b",
            boxShadow: "0 0 12px #ff3b3b",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(180deg, rgba(190,255,190,0.06) 0, rgba(190,255,190,0.06) 1px, transparent 1px, transparent 5px)",
          opacity: 0.65,
        }}
      />
    </div>
  );
}

function TetrisRainWallpaper() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 0,
        background:
          "radial-gradient(circle at 50% 15%, rgba(255, 79, 216, 0.16), transparent 30%), radial-gradient(circle at 28% 42%, rgba(34, 229, 255, 0.16), transparent 24%), linear-gradient(180deg, #080713 0%, #12122c 58%, #03030a 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(34,229,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,79,216,0.07) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          transform: "perspective(520px) rotateX(64deg) translateY(130px) scale(1.4)",
          transformOrigin: "center bottom",
        }}
      />
      {TETROMINOES.map((piece, index) => (
        <div
          key={index}
          className="tetris-wallpaper-piece"
          style={{
            position: "absolute",
            left: piece.x,
            top: -120,
            width: 96,
            height: 96,
            opacity: 0.24,
            animationDelay: piece.delay,
            filter: `drop-shadow(0 0 10px ${piece.color})`,
          }}
        >
          {piece.blocks.map(([x, y], blockIndex) => (
            <span
              key={blockIndex}
              style={{
                position: "absolute",
                left: x * 24,
                top: y * 24,
                width: 22,
                height: 22,
                background: piece.color,
                border: "1px solid rgba(255,255,255,0.45)",
              }}
            />
          ))}
        </div>
      ))}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(180deg, rgba(255,255,255,0.04) 0, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 4px)",
          opacity: 0.55,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "12%",
          right: "12%",
          top: "48%",
          height: 2,
          background: "linear-gradient(90deg, transparent, #22e5ff, #ff4fd8, transparent)",
          boxShadow: "0 0 16px rgba(34,229,255,0.6)",
        }}
      />
    </div>
  );
}

function PacManMazeWallpaper() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 0,
        background:
          "radial-gradient(circle at 62% 22%, rgba(255,216,0,0.14), transparent 22%), linear-gradient(180deg, #020211 0%, #070719 55%, #010106 100%)",
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1200 650"
        preserveAspectRatio="xMidYMid slice"
        style={{ display: "block" }}
      >
        <defs>
          <filter id="pacGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <pattern id="pacDots" width="56" height="56" patternUnits="userSpaceOnUse">
            <circle cx="28" cy="28" r="2.2" fill="#ffe6a0" opacity=".55" />
          </pattern>
        </defs>
        <rect width="1200" height="650" fill="url(#pacDots)" opacity=".55" />
        <g
          fill="none"
          stroke="#174cff"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity=".62"
          filter="url(#pacGlow)"
        >
          <path d="M110 95H455V210H270V320H510V485H130" />
          <path d="M620 80H1040V210H850V325H1080V510H720V410H610" />
          <path d="M180 555H410V435H530" />
          <path d="M680 560H1010" />
          <path d="M590 115V555" />
        </g>
        <g className="pacman-wallpaper-runner" filter="url(#pacGlow)">
          <path d="M0 0 L30 -18 A35 35 0 1 1 30 18 Z" fill="#ffd800" />
        </g>
        <g opacity=".26" filter="url(#pacGlow)">
          {PACMAN_GHOSTS.map(([x, y, color], index) => (
            <path
              key={index}
              d={`M${x} ${y + 28} V${y + 12} A24 24 0 0 1 ${x + 48} ${y + 12} V${y + 28} L${x + 40} ${y + 20} L${x + 32} ${y + 28} L${x + 24} ${y + 20} L${x + 16} ${y + 28} L${x + 8} ${y + 20} Z`}
              fill={color}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
