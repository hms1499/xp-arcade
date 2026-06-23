import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChallengeLoader } from "./ChallengeLoader";
import { useChallenge } from "@/state/challenge";

// @ts-expect-error -- React act flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const ADDR = "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";

let root: Root; let container: HTMLDivElement;
beforeEach(() => {
  useChallenge.getState().clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.history.replaceState({}, "", "/");
});

describe("ChallengeLoader", () => {
  it("parses a challenge URL into the store and strips the params", () => {
    window.history.replaceState({}, "", `/?challenge=snake&score=150&by=${ADDR}&keep=1`);
    act(() => root.render(<ChallengeLoader />));
    const st = useChallenge.getState();
    expect(st.active).toEqual({ gameId: "snake", target: 150, by: ADDR });
    expect(st.status).toBe("pending");
    expect(window.location.search).not.toContain("challenge");
    expect(window.location.search).toContain("keep=1"); // unrelated params preserved
  });

  it("does nothing for a URL without a valid challenge", () => {
    window.history.replaceState({}, "", "/?foo=bar");
    act(() => root.render(<ChallengeLoader />));
    expect(useChallenge.getState().active).toBeNull();
  });
});
