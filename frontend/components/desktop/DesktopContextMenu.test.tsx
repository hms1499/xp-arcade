import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DesktopContextMenu } from "./DesktopContextMenu";

function noop() {}

describe("DesktopContextMenu", () => {
  it("renders the Refresh and Properties items", () => {
    const html = renderToStaticMarkup(
      <DesktopContextMenu
        x={10}
        y={10}
        onClose={noop}
        onRefresh={noop}
        onArrangeIcons={noop}
        onProperties={noop}
      />,
    );
    expect(html).toContain("Refresh");
    expect(html).toContain("Properties");
    expect(html).toContain("Arrange Icons");
  });

  it("positions itself at the given coordinates", () => {
    const html = renderToStaticMarkup(
      <DesktopContextMenu
        x={42}
        y={64}
        onClose={noop}
        onRefresh={noop}
        onArrangeIcons={noop}
        onProperties={noop}
      />,
    );
    expect(html).toContain("left:42px");
    expect(html).toContain("top:64px");
  });
});
