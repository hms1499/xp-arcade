"use client";
import { useMemo } from "react";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

export function NightCityWallpaper() {
  const data = useMemo(() => {
    const r = rng(2718281);

    /* ── Stars ─────────────────────────────────────────────── */
    const stars = Array.from({ length: 110 }, (_, i) => {
      const bright = r();
      return {
        cx: r() * 1200,
        cy: r() * 360,
        radius: r() < 0.55 ? 0.65 : r() < 0.4 ? 1.1 : 1.5,
        twinkle: r() < 0.48,
        cls: bright > 0.65 ? "tw-b" : bright > 0.35 ? "tw-m" : "tw-d",
        delay: `${(r() * 6).toFixed(2)}s`,
        dur: `${(2.5 + r() * 3.5).toFixed(2)}s`,
        // a few stars are slightly blue or gold-tinted
        fill: r() < 0.15 ? "#c0d8ff" : r() < 0.1 ? "#ffe8c0" : "#e8f0ff",
      };
    });

    /* ── Blockchain nodes (faint sky network) ──────────────── */
    const nodes = Array.from({ length: 7 }, () => ({
      cx: 60 + r() * 1080,
      cy: 20 + r() * 160,   // keep in upper sky, away from buildings
    }));

    /* ── Far skyline (mid-depth, no windows) ───────────────── */
    const farBldgs: { x: number; w: number; h: number }[] = [];
    let fx = -30;
    while (fx < 1240) {
      const w = 22 + r() * 72;
      farBldgs.push({ x: fx, w, h: 55 + r() * 155 });
      fx += w + r() * 12;
    }

    /* ── Near skyline + windows ─────────────────────────────── */
    type Win = { x: number; y: number; w: number; h: number; color: string; flicker: boolean; delay: string };
    const nearBldgs: { x: number; w: number; h: number; antenna: boolean; antennaH: number }[] = [];
    const wins: Win[] = [];

    let nx = -35;
    while (nx < 1260) {
      const bw = 38 + r() * 115;
      const bh = 110 + r() * 295;
      const antenna = r() < 0.35 && bh > 200;
      nearBldgs.push({ x: nx, w: bw, h: bh, antenna, antennaH: 12 + r() * 28 });

      const topY = 650 - bh + 8;
      const ww = 3 + Math.round(r() * 4);
      const wh = 3 + Math.round(r() * 3);
      const cg = 11 + Math.round(r() * 8);
      const rg = 10 + Math.round(r() * 7);

      for (let wx = nx + 7; wx + ww < nx + bw - 6; wx += cg) {
        for (let wy = topY; wy + wh < 645; wy += rg) {
          if (r() > 0.18) continue; // ~82% dark — sparse, atmospheric

          // Color: mostly warm yellow, rare cyan/orange accents
          const roll = r();
          const color =
            roll < 0.06 ? "#22e5ff" :   // blockchain cyan (rare)
            roll < 0.10 ? "#ff7a22" :   // Stacks orange (rare)
            roll < 0.55 ? "#fde68a" :   // warm office yellow (dominant)
                          "#c8dcf0";    // cold monitor blue

          wins.push({
            x: wx, y: wy, w: ww, h: wh, color,
            flicker: r() < 0.07,
            delay: `${(r() * 11).toFixed(2)}s`,
          });
        }
      }

      nx += bw + 1 + r() * 6;
    }

    /* ── Antenna blink lights ──────────────────────────────── */
    const antennaBlinks = nearBldgs
      .filter((b) => b.antenna)
      .map((b) => ({
        cx: b.x + b.w / 2,
        cy: 650 - b.h - b.antennaH,
        delay: `${(Math.random() * 3).toFixed(2)}s`,
      }));

    return { stars, nodes, farBldgs, nearBldgs, wins, antennaBlinks };
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 0,
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1200 650"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block" }}
      >
        <defs>
          {/* ── Animations ─────────────────────────────────── */}
          <style>{`
            @keyframes twB{0%,100%{opacity:.88}50%{opacity:.10}}
            @keyframes twM{0%,100%{opacity:.58}50%{opacity:.07}}
            @keyframes twD{0%,100%{opacity:.32}50%{opacity:.03}}
            @keyframes flicker{0%,88%,90%,93%,96%,100%{opacity:1}89%{opacity:.12}91%{opacity:.55}94%{opacity:.2}97%{opacity:.7}}
            @keyframes blink{0%,49%,51%,100%{opacity:0}50%{opacity:1}}
            @keyframes satellite{from{transform:translate(-80px,90px)}to{transform:translate(1290px,-15px)}}
            @keyframes chainPulse{0%,100%{opacity:.04}50%{opacity:.13}}
            .tw-b{animation:twB var(--dur,3s) var(--del,0s) ease-in-out infinite}
            .tw-m{animation:twM var(--dur,4s) var(--del,0s) ease-in-out infinite}
            .tw-d{animation:twD var(--dur,5s) var(--del,0s) ease-in-out infinite}
            .st  {opacity:.45}
            .fw  {animation:flicker 9s var(--del,0s) infinite}
            .ab  {animation:blink 2s var(--del,0s) step-end infinite}
            .sat {animation:satellite 24s linear 8s infinite}
            .cn  {animation:chainPulse 5s var(--del,0s) ease-in-out infinite}
          `}</style>

          {/* ── Gradients ──────────────────────────────────── */}
          <linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#00030c" />
            <stop offset="30%"  stopColor="#00081c" />
            <stop offset="65%"  stopColor="#040e24" />
            <stop offset="100%" stopColor="#081730" />
          </linearGradient>
          <linearGradient id="gFar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0c182a" />
            <stop offset="100%" stopColor="#070d1a" />
          </linearGradient>
          <linearGradient id="gNear" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#060b16" />
            <stop offset="100%" stopColor="#020508" />
          </linearGradient>
          <radialGradient id="gMoonHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#efe5b8" stopOpacity=".22" />
            <stop offset="100%" stopColor="#efe5b8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="gHorizon" cx="50%" cy="10%" r="70%">
            <stop offset="0%"   stopColor="#0044aa" stopOpacity=".14" />
            <stop offset="100%" stopColor="#0044aa" stopOpacity="0" />
          </radialGradient>

          {/* ── Filters ────────────────────────────────────── */}
          <filter id="fGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.2" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="fMoon" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="fCity" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.6" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>

          {/* ── Hex-grid blockchain pattern ─────────────────── */}
          <pattern id="hexGrid" x="0" y="0" width="44" height="50.6" patternUnits="userSpaceOnUse">
            <polygon
              points="22,1.5 41.5,12.4 41.5,34.2 22,45.1 2.5,34.2 2.5,12.4"
              fill="none" stroke="#15385e" strokeWidth=".55"
            />
          </pattern>
        </defs>

        {/* ── Sky ─────────────────────────────────────────── */}
        <rect width="1200" height="650" fill="url(#gSky)" />
        <rect width="1200" height="440" fill="url(#hexGrid)" opacity=".11" />

        {/* ── Stars ─────────────────────────────────────── */}
        {data.stars.map((s, i) => (
          <circle
            key={i}
            cx={s.cx} cy={s.cy} r={s.radius}
            fill={s.fill}
            className={s.twinkle ? s.cls : "st"}
            style={s.twinkle
              ? ({ "--dur": s.dur, "--del": s.delay } as React.CSSProperties)
              : undefined}
          />
        ))}

        {/* ── Moon ──────────────────────────────────────── */}
        <ellipse cx="934" cy="68" rx="58" ry="58" fill="url(#gMoonHalo)" />
        <circle cx="934" cy="68" r="28" fill="#f0e9d2" filter="url(#fMoon)" />
        <circle cx="934" cy="68" r="28" fill="#f0e9d2" />
        <circle cx="922" cy="60" r="4.5" fill="#e2d9ba" />
        <circle cx="940" cy="76" r="2.8" fill="#e2d9ba" />
        <circle cx="928" cy="77" r="2"   fill="#e2d9ba" />
        <circle cx="943" cy="60" r="1.8" fill="#e2d9ba" />

        {/* ── Blockchain node network ────────────────────── */}
        {data.nodes.map((n, i) => (
          <g
            key={`nd-${i}`}
            className="cn"
            style={{ "--del": `${(i * 0.6).toFixed(1)}s` } as React.CSSProperties}
          >
            {i > 0 && (
              <line
                x1={data.nodes[i - 1].cx} y1={data.nodes[i - 1].cy}
                x2={n.cx} y2={n.cy}
                stroke="#1a5a9a" strokeWidth=".6"
              />
            )}
            <circle cx={n.cx} cy={n.cy} r="2" fill="#1e6aaa" />
          </g>
        ))}

        {/* ── Satellite ─────────────────────────────────── */}
        <g className="sat">
          <rect x="-4" y="112" width="9" height="3" fill="#7aa4cc" rx="1" />
          <rect x=".5" y="108" width="2.5" height="10" fill="#7aa4cc" rx="1" />
        </g>

        {/* ── Far skyline ───────────────────────────────── */}
        {data.farBldgs.map((b, i) => (
          <rect
            key={`f${i}`}
            x={b.x} y={650 - b.h}
            width={b.w} height={b.h}
            fill="url(#gFar)"
          />
        ))}

        {/* ── Near skyline ──────────────────────────────── */}
        {data.nearBldgs.map((b, i) => (
          <g key={`nb${i}`}>
            <rect
              x={b.x} y={650 - b.h}
              width={b.w} height={b.h}
              fill="url(#gNear)"
            />
            {b.antenna && (
              <rect
                x={b.x + b.w / 2 - 1}
                y={650 - b.h - b.antennaH}
                width="2" height={b.antennaH}
                fill="#0a1220"
              />
            )}
          </g>
        ))}

        {/* ── Windows ───────────────────────────────────── */}
        {data.wins.map((w, i) => {
          const glowing = w.color === "#22e5ff" || w.color === "#ff7a22";
          return (
            <rect
              key={`w${i}`}
              x={w.x} y={w.y}
              width={w.w} height={w.h}
              fill={w.color}
              className={w.flicker ? "fw" : undefined}
              style={w.flicker ? ({ "--del": w.delay } as React.CSSProperties) : undefined}
              filter={glowing ? "url(#fGlow)" : undefined}
            />
          );
        })}

        {/* ── Antenna blink lights ───────────────────────── */}
        {data.antennaBlinks.map((ab, i) => (
          <circle
            key={`ab${i}`}
            cx={ab.cx} cy={ab.cy} r="1.8"
            fill="#ff3333"
            className="ab"
            style={{ "--del": ab.delay } as React.CSSProperties}
          />
        ))}

        {/* ── Horizon glow ──────────────────────────────── */}
        <ellipse cx="600" cy="650" rx="850" ry="110" fill="url(#gHorizon)" />

        {/* ── Cyan city-wide ambient tint at base ─────────── */}
        <rect x="0" y="580" width="1200" height="75"
          fill="url(#gNear)" opacity=".55" />

        {/* ── Ground strip ──────────────────────────────── */}
        <rect x="0" y="647" width="1200" height="5" fill="#010306" />
      </svg>
    </div>
  );
}
