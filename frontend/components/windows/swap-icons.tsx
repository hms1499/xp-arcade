import type { JSX } from "react";

type IconProps = { size?: number };

// Stacks: purple rounded square with stacked chevrons.
export function StxIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg
      role="img"
      aria-label="STX"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
    >
      <rect width="16" height="16" rx="2" fill="#5546ff" />
      <path d="M4 5h8M4 11h8" stroke="#fff" strokeWidth="1.5" />
      <path d="M5 5l6 6M11 5l-6 6" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

// sBTC: orange circle with a Bitcoin "B".
export function SbtcIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg
      role="img"
      aria-label="sBTC"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
    >
      <circle cx="8" cy="8" r="8" fill="#f7931a" />
      <text
        x="8"
        y="12"
        textAnchor="middle"
        fontSize="11"
        fontWeight="bold"
        fill="#fff"
        fontFamily="monospace"
      >
        B
      </text>
    </svg>
  );
}
