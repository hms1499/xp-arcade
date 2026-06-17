"use client";
import { type Card, isRed } from "./SolitaireEngine";

const SUIT_SYMBOL: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RANK_LABEL: Record<number, string> = {
  1: "A", 11: "J", 12: "Q", 13: "K",
};

export const CARD_W = 44;
export const CARD_H = 60;

export function CardView({
  card,
  selected = false,
  onClick,
  onDoubleClick,
}: {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}) {
  const label = RANK_LABEL[card.rank] ?? String(card.rank);
  const symbol = SUIT_SYMBOL[card.suit];
  const red = isRed(card.suit);
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.();
      }}
      style={{
        width: CARD_W,
        height: CARD_H,
        boxSizing: "border-box",
        borderRadius: 4,
        border: selected ? "2px solid #ffe000" : "1px solid #555",
        background: card.faceUp
          ? "#fff"
          : "repeating-linear-gradient(45deg,#1a4ea8,#1a4ea8 4px,#2a5ec8 4px,#2a5ec8 8px)",
        color: red ? "#c00000" : "#000",
        fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
        fontSize: 13,
        fontWeight: "bold",
        padding: 3,
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      {card.faceUp ? (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span>{label}</span>
          <span>{symbol}</span>
        </div>
      ) : null}
    </div>
  );
}
