import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StacksLogo } from "./StacksLogo";

describe("StacksLogo", () => {
  it("renders an svg with the Stacks brand circle and a square viewBox", () => {
    const html = renderToStaticMarkup(<StacksLogo size={20} />);
    expect(html).toContain("<svg");
    expect(html).toContain('viewBox="0 0 32 32"');
    expect(html).toContain("#5546FF");
    expect(html).toContain('width="20"');
  });

  it("is aria-hidden by default and labelled when a title is given", () => {
    expect(renderToStaticMarkup(<StacksLogo />)).toContain('aria-hidden="true"');
    const labelled = renderToStaticMarkup(<StacksLogo title="Stacks" />);
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain("<title>Stacks</title>");
  });
});
