import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyState } from "./EmptyState";

function noop() {}

describe("EmptyState", () => {
  it("renders emoji, title, and body", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        emoji="🏆"
        title="Trophy case empty"
        body="Mint your first score."
      />,
    );
    expect(html).toContain("🏆");
    expect(html).toContain("Trophy case empty");
    expect(html).toContain("Mint your first score.");
  });

  it("renders the action button when actionLabel and onAction are provided", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        emoji="🏆"
        title="t"
        body="b"
        actionLabel="Play a game"
        onAction={noop}
      />,
    );
    expect(html).toContain("Play a game");
    expect(html).toContain("<button");
  });

  it("renders no button when no action is provided", () => {
    const html = renderToStaticMarkup(
      <EmptyState emoji="🏆" title="t" body="b" />,
    );
    expect(html).not.toContain("<button");
  });
});
