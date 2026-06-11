import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MinesweeperBoard } from "./MinesweeperBoard";
import {
  createMinesweeperState,
  placeMinesAt,
  reveal,
  toggleFlag,
} from "./MinesweeperEngine";

const noop = () => {};

function render(state: Parameters<typeof MinesweeperBoard>[0]["state"]) {
  return renderToStaticMarkup(
    <MinesweeperBoard state={state} onReveal={noop} onFlag={noop} disabled />,
  );
}

describe("MinesweeperBoard", () => {
  it("renders exactly one gridcell per board cell", () => {
    const s = createMinesweeperState("beginner");
    const html = render(s);
    const cells = html.match(/role="gridcell"/g) ?? [];
    expect(cells.length).toBe(s.rows * s.cols);
  });

  it("shows bombs, marks wrong flags, and reddens the detonation on a loss", () => {
    let s = placeMinesAt(createMinesweeperState("beginner"), [
      [0, 0],
      [0, 1],
    ]);
    s = toggleFlag(s, 5, 5); // wrong flag on a safe cell
    s = reveal(s, 0, 1); // detonate -> lost
    const html = render(s);

    expect(html).toContain("💣"); // the uncovered mine at 0,0
    expect(html).toContain("❌"); // the wrong flag at 5,5 is crossed out
    expect(html).toContain("#ff0000"); // exploded cell background
  });
});
