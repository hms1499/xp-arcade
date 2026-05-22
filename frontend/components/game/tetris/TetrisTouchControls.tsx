"use client";

export type TetrisAction = "left" | "right" | "rotate" | "soft" | "hard";

const BTN: React.CSSProperties = {
  width: 56,
  height: 44,
  fontSize: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "default",
  userSelect: "none",
  WebkitUserSelect: "none",
};

export function TetrisTouchControls({
  onAction,
}: {
  onAction: (a: TetrisAction) => void;
}) {
  function press(a: TetrisAction) {
    return (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      onAction(a);
    };
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        marginTop: 6,
      }}
    >
      <div style={{ display: "flex", gap: 2 }}>
        <button style={BTN} onTouchStart={press("left")} onMouseDown={press("left")}>◀</button>
        <button style={BTN} onTouchStart={press("rotate")} onMouseDown={press("rotate")} title="Rotate">↻</button>
        <button style={BTN} onTouchStart={press("right")} onMouseDown={press("right")}>▶</button>
      </div>
      <div style={{ display: "flex", gap: 2 }}>
        <button
          style={{ ...BTN, width: 86 }}
          onTouchStart={press("soft")}
          onMouseDown={press("soft")}
          title="Soft drop"
        >
          ▼ Soft
        </button>
        <button
          style={{ ...BTN, width: 86 }}
          onTouchStart={press("hard")}
          onMouseDown={press("hard")}
          title="Hard drop"
        >
          ⬇ Hard
        </button>
      </div>
    </div>
  );
}
