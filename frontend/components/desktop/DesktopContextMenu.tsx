"use client";
import { useEffect } from "react";
import { clampMenuPosition } from "@/lib/menu-position";

const MENU_W = 168;
const MENU_H = 116;

const itemStyle: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "4px 24px 4px 24px",
  fontSize: 11,
  fontFamily: '"Pixelated MS Sans Serif", Arial, sans-serif',
  border: "none",
  background: "transparent",
  cursor: "default",
};

function Item({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <li role="none">
      <button
        role="menuitem"
        style={itemStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#000080";
          e.currentTarget.style.color = "#ffffff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "#000000";
        }}
        onClick={onClick}
      >
        {label}
      </button>
    </li>
  );
}

export function DesktopContextMenu({
  x,
  y,
  onClose,
  onRefresh,
  onArrangeIcons,
  onProperties,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onRefresh: () => void;
  onArrangeIcons: () => void;
  onProperties: () => void;
}) {
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const pos = clampMenuPosition(x, y, MENU_W, MENU_H, vw, vh);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = () => onClose();
    window.addEventListener("keydown", onKey);
    // Close on the NEXT pointer/contextmenu anywhere (after this open frame).
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("contextmenu", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("contextmenu", onDown);
    };
  }, [onClose]);

  return (
    <ul
      role="menu"
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 60,
        listStyle: "none",
        margin: 0,
        padding: "2px",
        width: MENU_W,
        background: "#c0c0c0",
        border: "2px solid",
        borderColor: "#ffffff #808080 #808080 #ffffff",
        boxShadow: "2px 2px 0 #000000",
      }}
    >
      <Item label="Arrange Icons" onClick={() => { onArrangeIcons(); onClose(); }} />
      <Item label="Refresh" onClick={() => { onRefresh(); onClose(); }} />
      <li
        style={{
          borderTop: "1px solid #808080",
          borderBottom: "1px solid #ffffff",
          margin: "3px 1px",
        }}
      />
      <Item label="Properties" onClick={() => { onProperties(); onClose(); }} />
    </ul>
  );
}
