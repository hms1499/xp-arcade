import { describe, it, expect, beforeEach } from "vitest";
import { recordFinishedRun } from "./record-run";
import { usePlayXp } from "@/state/play-xp";
import { useSessionStats } from "@/state/session-stats";

describe("recordFinishedRun", () => {
  beforeEach(() => {
    localStorage.clear();
    usePlayXp.getState().reset();
    useSessionStats.getState().reset();
  });

  it("awards play XP and records the session run for the game", () => {
    recordFinishedRun("snake", 250); // playXpForRun(250) = 10 + floor(250/25) = 20

    expect(usePlayXp.getState().lifetimeXp).toBe(20);
    expect(usePlayXp.getState().byGame.snake).toBe(20);

    const session = useSessionStats.getState().byGame.snake;
    expect(session.runs).toBe(1);
    expect(session.lastScore).toBe(250);
    expect(session.bestScore).toBe(250);
  });
});
