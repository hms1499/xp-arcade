import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PrizeTrayBadge } from "./PrizeTrayBadge";
import { useUnclaimedPrizes, resetUnclaimedForTest } from "@/state/unclaimed-prizes";
import { useWindows } from "@/state/window-manager";

// Enable React act() so createRoot + act() flush effects synchronously
// @ts-expect-error -- non-standard React internal flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  resetUnclaimedForTest();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
});

describe("PrizeTrayBadge", () => {
  it("renders nothing when there is no unclaimed prize", () => {
    act(() => {
      root.render(<PrizeTrayBadge />);
    });
    expect(container.firstChild).toBeNull();
  });

  it("shows the total and opens High Scores at the top game on click", () => {
    useUnclaimedPrizes.setState({
      status: "done",
      scannedFor: "SP_A",
      claims: [{ gameId: "pacman", season: 1, amountUstx: 590_000 }],
      totalUstx: 590_000,
      gamesCount: 1,
      topGame: "pacman",
    });
    const open = vi.fn();
    const prevOpen = useWindows.getState().open;
    useWindows.setState({ open });

    act(() => {
      root.render(<PrizeTrayBadge />);
    });

    const btn = container.querySelector("button");
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toContain("0.59");
    expect(btn?.getAttribute("aria-label")).toBe(
      "Unclaimed prizes: 0.59 STX — open High Scores to claim"
    );

    act(() => {
      btn?.click();
    });

    expect(open).toHaveBeenCalledWith("highscore", { initialTab: "pacman" });

    act(() => {
      useWindows.setState({ open: prevOpen });
    });
  });
});
