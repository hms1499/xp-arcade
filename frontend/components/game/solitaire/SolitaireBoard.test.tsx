import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { dealDeck, makeDeck } from "./SolitaireEngine";
import { SolitaireBoard } from "./SolitaireBoard";

// Tell React this is an act-aware environment (no testing-library setup here).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SolitaireBoard", () => {
  it("renders four foundation slots and seven tableau columns", () => {
    const html = renderToStaticMarkup(
      <SolitaireBoard state={dealDeck(makeDeck(), 3)} selected={null} on={{}} />,
    );
    expect(html).toContain('aria-label="Solitaire board"');
    for (let i = 0; i < 7; i++) expect(html).toContain(`aria-label="tableau ${i + 1}"`);
    for (let i = 0; i < 4; i++) expect(html).toContain(`aria-label="foundation ${i + 1}"`);
  });

  it("fires onStockClick when the stock pile is clicked", () => {
    const onStockClick = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <SolitaireBoard state={dealDeck(makeDeck(), 3)} selected={null} on={{ onStockClick }} />,
      );
    });
    const stock = container.querySelector('[aria-label="stock"]') as HTMLElement;
    expect(stock).toBeTruthy();
    act(() => {
      stock.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onStockClick).toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});
