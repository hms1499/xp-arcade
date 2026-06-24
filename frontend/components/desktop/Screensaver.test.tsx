import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Screensaver } from "./Screensaver";

describe("Screensaver", () => {
  it("renders a full-screen canvas overlay", () => {
    const html = renderToStaticMarkup(<Screensaver onWake={() => {}} />);
    expect(html).toContain("<canvas");
    expect(html).toContain("position:fixed");
  });
});
