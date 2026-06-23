import { beforeEach, describe, expect, it } from "vitest";
import { useChallenge } from "./challenge";
import type { Challenge } from "@/lib/challenge-link";

const C: Challenge = { gameId: "snake", target: 150, by: undefined };

describe("useChallenge", () => {
  beforeEach(() => useChallenge.getState().clear());

  it("setPending sets active + pending", () => {
    useChallenge.getState().setPending(C);
    expect(useChallenge.getState().active).toEqual(C);
    expect(useChallenge.getState().status).toBe("pending");
  });

  it("accept moves to accepted", () => {
    useChallenge.getState().setPending(C);
    useChallenge.getState().accept();
    expect(useChallenge.getState().status).toBe("accepted");
  });

  it("markMet only transitions from accepted", () => {
    useChallenge.getState().setPending(C);
    useChallenge.getState().markMet();
    expect(useChallenge.getState().status).toBe("pending"); // no-op from pending
    useChallenge.getState().accept();
    useChallenge.getState().markMet();
    expect(useChallenge.getState().status).toBe("met");
  });

  it("decline and clear reset", () => {
    useChallenge.getState().setPending(C);
    useChallenge.getState().decline();
    expect(useChallenge.getState().active).toBeNull();
    expect(useChallenge.getState().status).toBeNull();
  });
});
