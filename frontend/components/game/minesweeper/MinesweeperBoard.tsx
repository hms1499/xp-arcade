"use client";
import type { Cell, MinesweeperState } from "./MinesweeperEngine";

const NUMBER_COLORS: Record<number, string> = {
  1: "#0000ff", 2: "#008000", 3: "#ff0000", 4: "#000080",
  5: "#800000", 6: "#008080", 7: "#000000", 8: "#808080",
};

function cellFace(cell: Cell): { text: string; color: string } {
  if (cell.flagged && !cell.revealed) return { text: "🚩", color: "#000" };
  if (!cell.revealed) return { text: "", color: "#000" };
  if (cell.mine) return { text: "💣", color: "#000" };
  if (cell.adjacent === 0) return { text: "", color: "#000" };
  return { text: String(cell.adjacent), color: NUMBER_COLORS[cell.adjacent] ?? "#000" };
}

export function MinesweeperBoard({
  state,
  onReveal,
  onFlag,
  disabled = false,
}: {
  state: MinesweeperState;
  onReveal: (r: number, c: number) => void;
  onFlag: (r: number, c: number) => void;
  disabled?: boolean;
}) {
  const CELL = state.cols > 20 ? 18 : 22; // shrink Expert to fit
  return (
    <div
      role="grid"
      aria-label="Minesweeper board"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${state.cols}, ${CELL}px)`,
        gap: 0,
        background: "#bdbdbd",
        border: "3px solid",
        borderColor: "#7b7b7b #fff #fff #7b7b7b",
        width: "max-content",
        margin: "0 auto",
        userSelect: "none",
      }}
    >
      {state.grid.map((row, r) =>
        row.map((cell, c) => {
          const face = cellFace(cell);
          const sunken = cell.revealed;
          const bg = cell.exploded ? "#ff0000" : "#bdbdbd";
          return (
            <button
              key={`${r}-${c}`}
              role="gridcell"
              disabled={disabled}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (!disabled) onReveal(r, c);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!disabled) onFlag(r, c);
              }}
              style={{
                // 98.css forces button min-width:75px / min-height:23px;
                // clear it so each cell is exactly CELL px (otherwise the
                // last column/row — with no neighbour painting over it —
                // stretches to the 98.css minimum).
                minWidth: 0,
                minHeight: 0,
                boxSizing: "border-box",
                width: CELL,
                height: CELL,
                padding: 0,
                fontSize: CELL > 18 ? 13 : 11,
                fontWeight: "bold",
                lineHeight: `${CELL}px`,
                fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
                color: face.color,
                background: bg,
                border: sunken ? "1px solid #7b7b7b" : "2px solid",
                borderColor: sunken
                  ? "#7b7b7b"
                  : "#fff #7b7b7b #7b7b7b #fff",
                cursor: disabled ? "default" : "pointer",
              }}
            >
              {face.text}
            </button>
          );
        }),
      )}
    </div>
  );
}
