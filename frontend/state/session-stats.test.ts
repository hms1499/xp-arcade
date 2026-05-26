import { beforeEach, describe, expect, it } from "vitest";
import { useSessionStats } from "./session-stats";

describe("session stats", () => {
  beforeEach(() => {
    useSessionStats.getState().reset();
  });

  it("records runs and best score per game", () => {
    useSessionStats.getState().recordResult("snake", 4);
    useSessionStats.getState().recordResult("snake", 9);
    useSessionStats.getState().recordResult("tetris", 7);

    const { byGame } = useSessionStats.getState();
    expect(byGame.snake).toMatchObject({
      runs: 2,
      bestScore: 9,
      lastScore: 9,
      totalScore: 13,
    });
    expect(byGame.tetris).toMatchObject({
      runs: 1,
      bestScore: 7,
      lastScore: 7,
      totalScore: 7,
    });
    expect(byGame.pacman.runs).toBe(0);
  });
});
