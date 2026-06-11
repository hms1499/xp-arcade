import { describe, it, expect } from "vitest";
import {
  DIFFICULTY_CONFIG,
  createMinesweeperState,
  placeMinesAt,
  reveal,
  toggleFlag,
  minesLeft,
  chord,
} from "./MinesweeperEngine";

describe("MinesweeperEngine", () => {
  it("creates an unrevealed board sized to the difficulty", () => {
    const s = createMinesweeperState("intermediate");
    expect(s.rows).toBe(16);
    expect(s.cols).toBe(16);
    expect(s.mines).toBe(40);
    expect(s.status).toBe("ready");
    expect(s.minesPlaced).toBe(false);
    expect(s.grid.flat().every((c) => !c.revealed && !c.flagged)).toBe(true);
    expect(DIFFICULTY_CONFIG.expert).toEqual({ rows: 16, cols: 30, mines: 99 });
  });

  it("first reveal is never a mine (property over many trials)", () => {
    for (let i = 0; i < 60; i++) {
      const s = reveal(createMinesweeperState("beginner"), 4, 4);
      expect(s.grid[4][4].mine).toBe(false);
      expect(s.grid[4][4].revealed).toBe(true);
      expect(s.minesPlaced).toBe(true);
    }
  });

  it("flood-fills zero regions and computes adjacency", () => {
    let s = placeMinesAt(createMinesweeperState("beginner"), [[0, 0]]);
    // Flag the far corner so the flood cannot clear the whole board: status
    // stays "playing" while we assert the cascade + adjacency.
    s = toggleFlag(s, 8, 8);
    s = reveal(s, 4, 4);
    expect(s.status).toBe("playing");
    expect(s.grid[8][8].revealed).toBe(false); // flagged cell untouched by flood
    expect(s.grid[1][1].adjacent).toBe(1);
    expect(s.grid[1][1].revealed).toBe(true);
    expect(s.grid[0][0].revealed).toBe(false);
  });

  it("revealing a mine loses the game", () => {
    let s = placeMinesAt(createMinesweeperState("beginner"), [[0, 0]]);
    s = reveal(s, 0, 0);
    expect(s.status).toBe("lost");
    expect(s.grid[0][0].revealed).toBe(true);
  });

  it("losing reveals every mine and flags the detonated one", () => {
    let s = placeMinesAt(createMinesweeperState("beginner"), [
      [0, 0],
      [8, 8],
      [4, 4],
    ]);
    s = reveal(s, 4, 4);
    expect(s.status).toBe("lost");
    // Every mine cell is revealed so the player can see the whole field.
    for (const [r, c] of [
      [0, 0],
      [8, 8],
      [4, 4],
    ] as const) {
      expect(s.grid[r][c].mine).toBe(true);
      expect(s.grid[r][c].revealed).toBe(true);
    }
    // Only the clicked mine is marked as the one that exploded.
    expect(s.grid[4][4].exploded).toBe(true);
    expect(s.grid[0][0].exploded ?? false).toBe(false);
  });

  it("revealing every non-mine cell wins the game", () => {
    let s = placeMinesAt(createMinesweeperState("beginner"), [[0, 0]]);
    s = reveal(s, 8, 8);
    expect(s.status).toBe("won");
  });

  it("on loss keeps correct flags, marks wrong flags, explodes the click", () => {
    let s = placeMinesAt(createMinesweeperState("beginner"), [
      [0, 0],
      [0, 1],
    ]);
    s = toggleFlag(s, 0, 0); // correct flag on a mine
    s = toggleFlag(s, 5, 5); // wrong flag on a safe cell
    s = reveal(s, 0, 1); // detonate the other mine
    expect(s.status).toBe("lost");
    // Correctly flagged mine stays flagged + covered (renders as a flag).
    expect(s.grid[0][0].flagged).toBe(true);
    expect(s.grid[0][0].revealed).toBe(false);
    // Wrong flag is uncovered so the board can cross it out.
    expect(s.grid[5][5].mine).toBe(false);
    expect(s.grid[5][5].flagged).toBe(true);
    expect(s.grid[5][5].revealed).toBe(true);
    // Detonated mine is flagged as exploded.
    expect(s.grid[0][1].exploded).toBe(true);
  });

  it("winning auto-flags every mine and zeroes minesLeft", () => {
    let s = placeMinesAt(createMinesweeperState("beginner"), [[0, 0]]);
    s = reveal(s, 8, 8); // clears the whole board
    expect(s.status).toBe("won");
    expect(s.grid[0][0].flagged).toBe(true);
    expect(minesLeft(s)).toBe(0);
  });

  it("chording a satisfied number reveals its covered neighbors", () => {
    let s = placeMinesAt(createMinesweeperState("beginner"), [[0, 0]]);
    s = reveal(s, 1, 1); // adjacent === 1 (only neighbour mine is 0,0)
    expect(s.grid[1][1].adjacent).toBe(1);
    s = toggleFlag(s, 0, 0); // satisfy the number
    s = chord(s, 1, 1);
    expect(s.grid[0][1].revealed).toBe(true);
    expect(s.grid[1][0].revealed).toBe(true);
    expect(s.grid[2][2].revealed).toBe(true);
    expect(s.grid[0][0].revealed).toBe(false); // flagged neighbour untouched
  });

  it("chording does nothing until flags match the number", () => {
    let s = placeMinesAt(createMinesweeperState("beginner"), [[0, 0]]);
    s = reveal(s, 1, 1); // adjacent 1, no flags yet
    s = chord(s, 1, 1);
    expect(s.grid[0][1].revealed).toBe(false);
    expect(s.status).toBe("playing");
  });

  it("chording onto a mis-flag detonates the hidden mine", () => {
    let s = placeMinesAt(createMinesweeperState("beginner"), [
      [0, 0],
      [2, 2],
    ]);
    s = reveal(s, 1, 1); // neighbours 0,0 and 2,2 => adjacent 2
    expect(s.grid[1][1].adjacent).toBe(2);
    s = toggleFlag(s, 0, 0); // correct
    s = toggleFlag(s, 0, 1); // wrong — count now equals 2
    s = chord(s, 1, 1);
    expect(s.status).toBe("lost"); // the unflagged mine at 2,2 blows up
  });

  it("toggleFlag flips a cell and tracks minesLeft", () => {
    let s = placeMinesAt(createMinesweeperState("beginner"), [[0, 0]]);
    expect(minesLeft(s)).toBe(1);
    s = toggleFlag(s, 0, 0);
    expect(s.grid[0][0].flagged).toBe(true);
    expect(minesLeft(s)).toBe(0);
    s = toggleFlag(s, 0, 0);
    expect(s.grid[0][0].flagged).toBe(false);
    expect(minesLeft(s)).toBe(1);
  });

  it("ignores reveal of a flagged cell", () => {
    let s = placeMinesAt(createMinesweeperState("beginner"), [[0, 0]]);
    s = toggleFlag(s, 5, 5);
    s = reveal(s, 5, 5);
    expect(s.grid[5][5].revealed).toBe(false);
    expect(s.status).toBe("playing");
  });
});
