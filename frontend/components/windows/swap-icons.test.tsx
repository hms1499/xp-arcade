import { describe, it, expect, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StxIcon, SbtcIcon } from "./swap-icons";

afterEach(() => {});

describe("swap token icons", () => {
  it("StxIcon renders an accessible svg at the default size", () => {
    const html = renderToStaticMarkup(<StxIcon />);
    expect(html).toContain("<svg");
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="STX"');
    expect(html).toContain('width="18"');
  });

  it("SbtcIcon renders an accessible svg and honors a custom size", () => {
    const html = renderToStaticMarkup(<SbtcIcon size={24} />);
    expect(html).toContain('aria-label="sBTC"');
    expect(html).toContain('width="24"');
  });
});
