"use client";
import type { Direction } from "@/lib/snake-engine";

const BTN: React.CSSProperties = {
  width: 52,
  height: 52,
  fontSize: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "default",
  userSelect: "none",
  WebkitUserSelect: "none",
};

export function TouchControls({ onDir }: { onDir: (d: Direction) => void }) {
  function press(d: Direction) {
    return (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      onDir(d);
    };
  }

  return (
    <div
      className="touch-controls"
      style={{
        display: "grid",
        gridTemplateColumns: "52px 52px 52px",
        gridTemplateRows: "52px 52px",
        gap: 2,
        marginTop: 6,
        justifyContent: "center",
      }}
    >
      <div />
      <button style={BTN} onTouchStart={press("up")} onMouseDown={press("up")}>▲</button>
      <div />
      <button style={BTN} onTouchStart={press("left")} onMouseDown={press("left")}>◀</button>
      <button style={BTN} onTouchStart={press("down")} onMouseDown={press("down")}>▼</button>
      <button style={BTN} onTouchStart={press("right")} onMouseDown={press("right")}>▶</button>
    </div>
  );
}
