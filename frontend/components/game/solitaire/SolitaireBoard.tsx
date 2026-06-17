"use client";
import { type SolitaireState, type PileRef } from "./SolitaireEngine";
import { CardView, CARD_W, CARD_H } from "./Card";

export type Selected = { tableauIndex: number; cardIndex: number } | { waste: true } | null;

export type BoardHandlers = {
  onStockClick?: () => void;
  onWasteClick?: () => void;
  onFoundationClick?: (index: number) => void;
  onTableauCardClick?: (tableauIndex: number, cardIndex: number) => void;
  onEmptyTableauClick?: (tableauIndex: number) => void;
  onDoubleClick?: (from: PileRef, index: number) => void;
};

const SLOT: React.CSSProperties = {
  width: CARD_W,
  height: CARD_H,
  borderRadius: 4,
  border: "1px dashed #2a7a4a",
  background: "rgba(255,255,255,0.06)",
};

function isWasteSelected(sel: Selected): boolean {
  return !!sel && "waste" in sel;
}

export function SolitaireBoard({
  state,
  selected,
  on,
}: {
  state: SolitaireState;
  selected: Selected;
  on: BoardHandlers;
}) {
  const wasteTop = state.waste[state.waste.length - 1] ?? null;
  return (
    <div
      aria-label="Solitaire board"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 10,
        background: "#0a5c2e",
        borderRadius: 6,
        userSelect: "none",
      }}
    >
      {/* Top row: stock, waste, spacer, 4 foundations */}
      <div style={{ display: "flex", gap: 8 }}>
        <div
          aria-label="stock"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); on.onStockClick?.(); }}
          style={{ ...SLOT, cursor: "pointer", background: state.stock.length ? "#1a4ea8" : SLOT.background }}
        />
        <div
          aria-label="waste"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); on.onWasteClick?.(); }}
          style={{ width: CARD_W, height: CARD_H }}
        >
          {wasteTop ? (
            <CardView
              card={wasteTop}
              selected={isWasteSelected(selected)}
              onClick={() => on.onWasteClick?.()}
              onDoubleClick={() => on.onDoubleClick?.({ kind: "waste" }, state.waste.length - 1)}
            />
          ) : (
            <div style={SLOT} />
          )}
        </div>
        <div style={{ width: CARD_W }} />
        {state.foundations.map((pile, f) => {
          const top = pile[pile.length - 1] ?? null;
          return (
            <div
              key={f}
              aria-label={`foundation ${f + 1}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); on.onFoundationClick?.(f); }}
              style={{ width: CARD_W, height: CARD_H, cursor: "pointer" }}
            >
              {top ? <CardView card={top} /> : <div style={SLOT} />}
            </div>
          );
        })}
      </div>

      {/* Tableau */}
      <div style={{ display: "flex", gap: 8 }}>
        {state.tableau.map((pile, t) => (
          <div
            key={t}
            aria-label={`tableau ${t + 1}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (pile.length === 0) on.onEmptyTableauClick?.(t);
            }}
            style={{ position: "relative", width: CARD_W, minHeight: CARD_H }}
          >
            {pile.length === 0 ? <div style={SLOT} /> : null}
            {pile.map((card, ci) => {
              const isSel =
                !!selected &&
                "tableauIndex" in selected &&
                selected.tableauIndex === t &&
                ci >= selected.cardIndex;
              return (
                <div key={ci} style={{ position: "absolute", top: ci * 18 }}>
                  <CardView
                    card={card}
                    selected={isSel}
                    onClick={() => on.onTableauCardClick?.(t, ci)}
                    onDoubleClick={() => on.onDoubleClick?.({ kind: "tableau", index: t }, ci)}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
