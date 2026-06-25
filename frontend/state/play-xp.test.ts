import { describe, it, expect, beforeEach } from "vitest";
import { usePlayXp, playXpForRun, PLAY_FINISH_XP } from "./play-xp";

describe("playXpForRun", () => {
  it("is the flat finish reward at score 0", () => {
    expect(playXpForRun(0)).toBe(PLAY_FINISH_XP);
  });

  it("adds floor(score / 25) on top of the finish reward", () => {
    expect(playXpForRun(25)).toBe(PLAY_FINISH_XP + 1);
    expect(playXpForRun(250)).toBe(PLAY_FINISH_XP + 10);
  });

  it("clamps a negative score to the flat reward", () => {
    expect(playXpForRun(-99)).toBe(PLAY_FINISH_XP);
  });
});

describe("usePlayXp store", () => {
  beforeEach(() => {
    localStorage.clear();
    usePlayXp.getState().reset();
  });

  it("accumulates lifetime and per-game XP", () => {
    usePlayXp.getState().addPlay("snake", 0); // +10
    usePlayXp.getState().addPlay("snake", 250); // +20
    usePlayXp.getState().addPlay("tetris", 0); // +10
    const s = usePlayXp.getState();
    expect(s.lifetimeXp).toBe(40);
    expect(s.byGame.snake).toBe(30);
    expect(s.byGame.tetris).toBe(10);
  });

  it("persists lifetime XP under the xp-arcade-play-xp key", () => {
    usePlayXp.getState().addPlay("snake", 250); // +20
    expect(localStorage.getItem("xp-arcade-play-xp")).toContain(
      '"lifetimeXp":20',
    );
  });

  it("reset clears lifetime and per-game XP", () => {
    usePlayXp.getState().addPlay("snake", 100);
    usePlayXp.getState().reset();
    expect(usePlayXp.getState().lifetimeXp).toBe(0);
    expect(usePlayXp.getState().byGame.snake).toBe(0);
  });
});
