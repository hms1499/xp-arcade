// @ts-expect-error -- non-standard React internal flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const open = vi.fn();
vi.mock("@/state/window-manager", () => ({
  useWindows: (sel: (s: { open: typeof open }) => unknown) => sel({ open }),
}));
// Disconnected wallet: address is null
vi.mock("@/state/wallet", () => ({
  useWallet: (sel: (s: { address: string | null }) => unknown) => sel({ address: null }),
}));
const { collectNudgeSignals } = await import("@/lib/collect-nudge-signals");
vi.mock("@/lib/collect-nudge-signals", () => ({
  collectNudgeSignals: vi.fn(async () => ({
    address: null,
    streak: { currentStreak: 0, bestStreak: 0, completedToday: false },
    dailyGame: "snake",
    ranks: null,
    lastSeenRanks: null,
    countdowns: {},
    shownToday: {},
  })),
}));

import { RetentionBalloon } from "./RetentionBalloon";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  document.body.removeChild(container);
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe("RetentionBalloon coordination gate", () => {
  it("renders nothing and does not call collectNudgeSignals when disconnected AND wallet balloon not yet dismissed", async () => {
    // Precondition: no "balloon-dismissed" in sessionStorage
    expect(sessionStorage.getItem("balloon-dismissed")).toBeNull();

    await act(async () => { root.render(<RetentionBalloon />); });

    // Advance well past the 3500ms SHOW_DELAY_MS
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // Gate should have blocked: nothing rendered
    expect(container.querySelector("button")).toBeNull();
    // Gate should have blocked: signals were never collected
    expect(collectNudgeSignals).not.toHaveBeenCalled();
    // Gate should have blocked: no window was opened
    expect(open).not.toHaveBeenCalled();
  });

  it("calls collectNudgeSignals when disconnected BUT wallet balloon already dismissed", async () => {
    // Simulate the wallet balloon having been dismissed
    sessionStorage.setItem("balloon-dismissed", "1");

    await act(async () => { root.render(<RetentionBalloon />); });

    // Advance past the delay
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // Gate is open: collectNudgeSignals SHOULD have been called
    expect(collectNudgeSignals).toHaveBeenCalledOnce();
  });
});
