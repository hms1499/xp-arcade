import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useWindows } from "@/state/window-manager";

// @ts-expect-error -- non-standard React internal flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no ResizeObserver; GameShellWindow's measuring effect needs one.
class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = FakeResizeObserver;

// The inner Window chrome checks matchMedia for compact-viewport handling.
window.matchMedia = ((q: string) => ({
  matches: false,
  media: q,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia;

// Avoid real network reads for the goal row (top-10 / season / pool / best).
vi.mock("@/lib/contract-calls", () => ({
  getTopTenForGame: vi.fn(async () => []),
  getCurrentSeasonForGame: vi.fn(async () => null),
  getPrizePoolBalanceForGame: vi.fn(async () => null),
  getBestScoreForGame: vi.fn(async () => null),
}));

const { GameShellWindow } = await import("./GameShellWindow");

let container: HTMLDivElement;
let root: Root;

function seed() {
  useWindows.setState({
    windows: [
      {
        id: "test-win",
        type: "game-snake",
        x: 100,
        y: 80,
        z: 11,
        minimized: false,
      },
    ],
    topZ: 11,
    lastPos: {},
  });
}

async function mount(children: React.ReactNode, unscaled?: boolean) {
  await act(async () => {
    root.render(
      <GameShellWindow gameId="snake" score={0} unscaled={unscaled}>
        {children}
      </GameShellWindow>,
    );
    // Let the goal-row's contract-read promises (mocked) settle so the
    // resulting setState doesn't land outside act().
    await Promise.resolve();
  });
}

beforeEach(() => {
  seed();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("GameShellWindow scaling boundary", () => {
  it("keeps the play field inside the transformed stage, and the toolbar/goal row outside it", async () => {
    await mount(<div data-testid="play-field">field</div>);

    const stageInner = container.querySelector(".game-shell-stage-inner");
    expect(stageInner).not.toBeNull();
    expect(stageInner!.querySelector('[data-testid="play-field"]')).not.toBeNull();

    // The chrome must never be inside the scaled stage.
    expect(stageInner!.querySelector(".game-shell-toolbar")).toBeNull();
    expect(stageInner!.querySelector(".game-goal-row")).toBeNull();

    // And they must exist somewhere in the window at all.
    expect(container.querySelector(".game-shell-toolbar")).not.toBeNull();
    expect(container.querySelector(".game-goal-row")).not.toBeNull();
  });

  it("renders unscaled children without the stage transform", async () => {
    await mount(<div data-testid="mint-dialog">mint dialog</div>, true);

    const stageInner = container.querySelector(".game-shell-stage-inner") as HTMLElement;
    expect(stageInner).not.toBeNull();
    expect(stageInner.querySelector('[data-testid="mint-dialog"]')).not.toBeNull();
    // No scale transform when unscaled.
    expect(stageInner.style.transform).toBe("");
  });
});
