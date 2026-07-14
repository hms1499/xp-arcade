import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Window } from "./Window";
import { useWindows, type WindowType } from "@/state/window-manager";

// Enable React act() so createRoot + act() flush effects synchronously
// @ts-expect-error -- non-standard React internal flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const matchMedia = (matches: boolean) =>
  ((q: string) => ({
    matches,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;

let container: HTMLDivElement;
let root: Root;

function seed(type: WindowType, opts: { maximized?: boolean } = {}) {
  useWindows.setState({
    windows: [
      {
        id: "test-win",
        type,
        x: 100,
        y: 80,
        z: 11,
        minimized: false,
        maximized: opts.maximized,
      },
    ],
    topZ: 11,
    lastPos: {},
  });
}

function render() {
  act(() => {
    root.render(
      <Window id="test-win" title="Test">
        <p>body</p>
      </Window>,
    );
  });
}

beforeEach(() => {
  window.matchMedia = matchMedia(false);
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

describe("Window resize handles", () => {
  it("renders all 8 handles for a resizable window", () => {
    seed("highscore");
    render();
    const dirs = [...container.querySelectorAll("[data-resize]")].map((el) =>
      el.getAttribute("data-resize"),
    );
    expect(dirs.sort()).toEqual(["e", "n", "ne", "nw", "s", "se", "sw", "w"]);
  });

  it("renders all 8 handles for a game window -- the play field scales to fit", () => {
    seed("game-snake");
    render();
    const dirs = [...container.querySelectorAll("[data-resize]")].map((el) =>
      el.getAttribute("data-resize"),
    );
    expect(dirs.sort()).toEqual(["e", "n", "ne", "nw", "s", "se", "sw", "w"]);
  });

  it("renders no handles while maximized", () => {
    seed("highscore", { maximized: true });
    render();
    expect(container.querySelectorAll("[data-resize]").length).toBe(0);
  });

  it("renders no handles on compact viewports", () => {
    window.matchMedia = matchMedia(true);
    seed("highscore");
    render();
    expect(container.querySelectorAll("[data-resize]").length).toBe(0);
  });

  it("applies a dragged size to the window frame", () => {
    seed("highscore");
    useWindows.setState({
      windows: useWindows
        .getState()
        .windows.map((w) => ({ ...w, w: 640, h: 480 })),
    });
    render();
    const frame = container.querySelector(".window") as HTMLElement;
    expect(frame.style.width).toBe("640px");
    expect(frame.style.height).toBe("480px");
  });

  it("never lets the frame scroll for an un-resized window (body scrolls instead)", () => {
    seed("highscore");
    render();
    const frame = container.querySelector(".window") as HTMLElement;
    const body = container.querySelector(".window-body") as HTMLElement;
    expect(frame.style.overflow).toBe("hidden");
    expect(body.style.overflow).toBe("auto");
  });
});
