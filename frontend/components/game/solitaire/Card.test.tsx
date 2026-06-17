import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CardView } from "./Card";

// Visible text only (strip tags + their attributes), mirroring textContent.
const textOf = (html: string) => html.replace(/<[^>]*>/g, "");

describe("CardView", () => {
  it("shows rank + suit for a face-up card", () => {
    const text = textOf(
      renderToStaticMarkup(<CardView card={{ suit: "H", rank: 1, faceUp: true }} />),
    );
    expect(text).toContain("A");
    expect(text).toContain("♥");
  });

  it("hides the face of a face-down card", () => {
    const text = textOf(
      renderToStaticMarkup(<CardView card={{ suit: "H", rank: 1, faceUp: false }} />),
    );
    expect(text).not.toContain("A");
  });
});
