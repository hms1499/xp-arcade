import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WelcomeDialog } from "./WelcomeDialog";

function noop() {}

describe("WelcomeDialog content", () => {
  it("renders the title and tagline", () => {
    const html = renderToStaticMarkup(
      <WelcomeDialog onPlay={noop} onClose={noop} />,
    );
    expect(html).toContain("Welcome to XP Arcade");
    expect(html).toContain("STX prize pool");
  });

  it("renders the three steps", () => {
    const html = renderToStaticMarkup(
      <WelcomeDialog onPlay={noop} onClose={noop} />,
    );
    expect(html).toContain("PLAY");
    expect(html).toContain("MINT");
    expect(html).toContain("CLIMB");
  });

  it("renders both footer actions", () => {
    const html = renderToStaticMarkup(
      <WelcomeDialog onPlay={noop} onClose={noop} />,
    );
    expect(html).toContain("Maybe later");
    expect(html).toContain("Play Now");
  });

  it("renders the no-wallet friction-reducer line", () => {
    const html = renderToStaticMarkup(
      <WelcomeDialog onPlay={noop} onClose={noop} />,
    );
    expect(html).toContain("No wallet needed to play");
  });
});
