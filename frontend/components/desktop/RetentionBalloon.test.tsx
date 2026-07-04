// @ts-expect-error -- non-standard React internal flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const open = vi.fn();
vi.mock("@/state/window-manager", () => ({
  useWindows: (sel: (s: { open: typeof open }) => unknown) => sel({ open }),
}));
vi.mock("@/state/wallet", () => ({
  useWallet: (sel: (s: { address: string | null }) => unknown) => sel({ address: "SP1" }),
}));
vi.mock("@/lib/collect-nudge-signals", () => ({
  collectNudgeSignals: vi.fn(async () => ({
    address: "SP1",
    streak: { currentStreak: 4, bestStreak: 9, completedToday: false },
    dailyGame: "snake",
    ranks: { snake: null, tetris: null, pacman: null, breakout: null, minesweeper: null, solitaire: null },
    lastSeenRanks: { snake: 3, tetris: null, pacman: null, breakout: null, minesweeper: null, solitaire: null },
    countdowns: {},
    shownToday: {},
    unclaimed: null,
  })),
}));

const { collectNudgeSignals } = await import("@/lib/collect-nudge-signals");

import { RetentionBalloon, fetchUnclaimedSummary } from "./RetentionBalloon";
import { useUnclaimedPrizes, resetUnclaimedForTest } from "@/state/unclaimed-prizes";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  resetUnclaimedForTest();
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  document.body.removeChild(container);
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
  resetUnclaimedForTest();
});

describe("RetentionBalloon", () => {
  it("shows the selected nudge and its CTA opens the target window", async () => {
    // Mount component
    await act(async () => { root.render(<RetentionBalloon />); });

    // Nothing visible yet (before the 3500ms delay)
    expect(container.querySelector("button")).toBeNull();

    // Advance past SHOW_DELAY_MS and flush all async work
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3600);
    });

    // Find the CTA button by text content
    const buttons = Array.from(container.querySelectorAll("button"));
    const cta = buttons.find((b) => b.textContent?.trim() === "Reclaim rank");
    expect(cta).toBeTruthy();

    // Click it
    await act(async () => { cta!.click(); });

    expect(open).toHaveBeenCalledWith("highscore", { initialTab: "snake" });
  });

  it("shows the unclaimed-prize balloon and opens High Scores at the top game", async () => {
    // collectNudgeSignals is fully mocked at module level, so it never invokes the
    // real fetchUnclaimed wiring — override its resolved value for this case to
    // exercise the real selectNudge/prizeUnclaimedCandidate + CTA-open path.
    vi.mocked(collectNudgeSignals).mockResolvedValueOnce({
      address: "SP1",
      streak: { currentStreak: 0, bestStreak: 0, completedToday: true },
      dailyGame: "snake",
      ranks: null,
      lastSeenRanks: null,
      countdowns: {},
      shownToday: {},
      unclaimed: { totalUstx: 1_250_000, gamesCount: 1, topGame: "tetris" },
    });

    await act(async () => { root.render(<RetentionBalloon />); });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3600);
    });

    expect(container.textContent).toContain("Unclaimed prize!");

    const buttons = Array.from(container.querySelectorAll("button"));
    const cta = buttons.find((b) => b.textContent?.trim() === "Claim now");
    expect(cta).toBeTruthy();

    await act(async () => { cta!.click(); });

    expect(open).toHaveBeenCalledWith("highscore", { initialTab: "tetris" });
  });

  it("fetchUnclaimedSummary reduces real store state to a nudge-ready summary", async () => {
    // Pre-seed the store as "done" for this address so scan() hits its own
    // dedupe short-circuit (no network deps needed) — exercises the real
    // useUnclaimedPrizes store, not a mock.
    useUnclaimedPrizes.setState({
      status: "done",
      scannedFor: "SP1",
      claims: [{ gameId: "tetris", season: 1, amountUstx: 1_250_000 }],
      totalUstx: 1_250_000,
      gamesCount: 1,
      topGame: "tetris",
    });

    await expect(fetchUnclaimedSummary("SP1")).resolves.toEqual({
      totalUstx: 1_250_000,
      gamesCount: 1,
      topGame: "tetris",
    });
  });

  it("marks the kind shown today after rendering", async () => {
    await act(async () => { root.render(<RetentionBalloon />); });

    // Advance past the delay so the nudge is picked and markNudgeShown is called
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3600);
    });

    // Find the CTA button to confirm the nudge rendered
    const buttons = Array.from(container.querySelectorAll("button"));
    const cta = buttons.find((b) => b.textContent?.trim() === "Reclaim rank");
    expect(cta).toBeTruthy();

    // Assert markNudgeShown persisted to localStorage
    const stored = JSON.parse(localStorage.getItem("xp-arcade:nudge") ?? "{}");
    expect(stored["rank-drop"]).toBeTruthy();
  });
});
