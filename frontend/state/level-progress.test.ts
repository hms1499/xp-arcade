import { describe, it, expect, beforeEach } from "vitest";
import { useLevelProgress } from "./level-progress";

beforeEach(() => {
  useLevelProgress.setState({ acknowledged: {} });
});

describe("useLevelProgress", () => {
  it("records an acknowledged level per address", () => {
    useLevelProgress.getState().acknowledge("SP_A", 5);
    useLevelProgress.getState().acknowledge("SP_B", 12);
    expect(useLevelProgress.getState().acknowledged).toEqual({ SP_A: 5, SP_B: 12 });
  });

  it("never lowers an acknowledged level", () => {
    useLevelProgress.getState().acknowledge("SP_A", 9);
    useLevelProgress.getState().acknowledge("SP_A", 4);
    expect(useLevelProgress.getState().acknowledged.SP_A).toBe(9);
  });

  it("raises an acknowledged level", () => {
    useLevelProgress.getState().acknowledge("SP_A", 4);
    useLevelProgress.getState().acknowledge("SP_A", 9);
    expect(useLevelProgress.getState().acknowledged.SP_A).toBe(9);
  });
});
