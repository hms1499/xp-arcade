"use client";
import { useEffect, useRef } from "react";

type Logo = { x: number; y: number; z: number };

export function Screensaver({ onWake }: { onWake: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const logos: Logo[] = [];
    const COUNT = 28;
    const reset = (l: Logo) => {
      l.x = (Math.random() - 0.5) * 2;
      l.y = (Math.random() - 0.5) * 2;
      l.z = Math.random() * 0.98 + 0.02;
    };
    for (let i = 0; i < COUNT; i++) {
      const l = { x: 0, y: 0, z: 0 };
      reset(l);
      logos.push(l);
    }

    const fit = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    fit();
    window.addEventListener("resize", fit);

    const COLORS = ["#FF0000", "#00AA00", "#0000AA", "#FFAA00"];
    const drawFlag = (cx: number, cy: number, s: number) => {
      const g = s / 2;
      ctx.fillStyle = COLORS[0]; ctx.fillRect(cx - g, cy - g, g, g);
      ctx.fillStyle = COLORS[1]; ctx.fillRect(cx, cy - g, g, g);
      ctx.fillStyle = COLORS[2]; ctx.fillRect(cx - g, cy, g, g);
      ctx.fillStyle = COLORS[3]; ctx.fillRect(cx, cy, g, g);
    };

    const tick = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);
      for (const l of logos) {
        l.z -= 0.006;
        if (l.z <= 0.02) reset(l);
        const scale = 1 / l.z;
        const px = w / 2 + (l.x * scale * w) / 2;
        const py = h / 2 + (l.y * scale * h) / 2;
        const size = Math.min(64, 6 * scale);
        if (px > -size && px < w + size && py > -size && py < h + size) {
          drawFlag(px, py, size);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onClick={onWake}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1800,
        background: "#000000",
        cursor: "none",
      }}
    />
  );
}
