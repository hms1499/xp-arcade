import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ShutdownScreen } from "./ShutdownScreen";

describe("ShutdownScreen", () => {
  it("renders the classic safe-to-turn-off message", () => {
    const html = renderToStaticMarkup(<ShutdownScreen onWake={() => {}} />);
    expect(html).toContain("It&#x27;s now safe to turn off your computer.");
  });
});
