import { describe, it, expect, beforeEach } from "vitest";
import { useWelcome } from "@/state/welcome";

describe("useWelcome store", () => {
  beforeEach(() => {
    useWelcome.setState({ isOpen: false });
  });

  it("starts closed", () => {
    expect(useWelcome.getState().isOpen).toBe(false);
  });

  it("open() sets isOpen true", () => {
    useWelcome.getState().open();
    expect(useWelcome.getState().isOpen).toBe(true);
  });

  it("close() sets isOpen false", () => {
    useWelcome.getState().open();
    useWelcome.getState().close();
    expect(useWelcome.getState().isOpen).toBe(false);
  });
});
