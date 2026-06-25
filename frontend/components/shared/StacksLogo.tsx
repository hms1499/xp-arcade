import type { CSSProperties } from "react";

/**
 * Official Stacks (STX) badge mark — purple circle + white symbol. Used as the
 * single brand-correct, wallet-agnostic icon for every "connect wallet" entry
 * point (@stacks/connect opens a multi-wallet picker, so no single wallet's
 * logo is appropriate). Two-color and self-contained for guaranteed contrast on
 * both silver buttons and the dark wallpaper.
 */
export function StacksLogo({
  size = 16,
  title,
  style,
}: {
  size?: number;
  title?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flexShrink: 0, ...style }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <circle fill="#5546FF" cx="16" cy="16" r="16" />
      <path
        fill="#FFF"
        d="M19.319 19.033l3.61 5.467h-2.697l-4.24-6.423-4.238 6.423H9.07l3.611-5.453H7.5v-2.07h17v2.056zm5.181-6.138v2.085h-17v-2.084h5.081L9.013 7.5h2.698l4.282 6.509L20.289 7.5h2.698l-3.568 5.395z"
      />
    </svg>
  );
}
