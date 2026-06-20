import { describe, it, expect, beforeEach } from "vitest";
import { isWindowActive, useWindows, type WindowEntry } from "./window-manager";

function entry(partial: Partial<WindowEntry> = {}): WindowEntry {
  return {
    id: "game-1",
    type: "game-snake",
    x: 0,
    y: 0,
    z: 5,
    minimized: false,
    ...partial,
  };
}

describe("isWindowActive", () => {
  it("is active when top-z and not minimized", () => {
    expect(isWindowActive(entry({ z: 5 }), 5)).toBe(true);
  });

  it("is inactive when entry is undefined", () => {
    expect(isWindowActive(undefined, 5)).toBe(false);
  });

  it("is inactive when minimized even at top z", () => {
    expect(isWindowActive(entry({ z: 5, minimized: true }), 5)).toBe(false);
  });

  it("is inactive when not the top z", () => {
    expect(isWindowActive(entry({ z: 3 }), 5)).toBe(false);
  });
});

describe("toggleMaximize", () => {
  beforeEach(() => {
    useWindows.setState({ windows: [], topZ: 10 });
  });

  it("sets maximized from undefined to true, raises z, keeps x/y", () => {
    useWindows.setState({
      windows: [
        { id: "a", type: "game-snake", x: 5, y: 6, z: 11, minimized: false },
      ],
      topZ: 11,
    });
    useWindows.getState().toggleMaximize("a");
    const st = useWindows.getState();
    const w = st.windows.find((win) => win.id === "a")!;
    expect(w.maximized).toBe(true);
    expect(w.z).toBe(12);
    expect(st.topZ).toBe(12);
    expect(w.x).toBe(5);
    expect(w.y).toBe(6);
  });

  it("flips maximized true -> false on a second call and still raises z", () => {
    useWindows.setState({
      windows: [
        {
          id: "a",
          type: "game-snake",
          x: 0,
          y: 0,
          z: 11,
          minimized: false,
          maximized: true,
        },
      ],
      topZ: 11,
    });
    useWindows.getState().toggleMaximize("a");
    const st = useWindows.getState();
    const w = st.windows.find((win) => win.id === "a")!;
    expect(w.maximized).toBe(false);
    expect(w.z).toBe(12);
    expect(st.topZ).toBe(12);
  });

  it("is a true no-op for an unknown id (no topZ bump, no change)", () => {
    useWindows.setState({
      windows: [
        { id: "a", type: "game-snake", x: 0, y: 0, z: 11, minimized: false },
      ],
      topZ: 11,
    });
    useWindows.getState().toggleMaximize("ghost");
    const st = useWindows.getState();
    expect(st.topZ).toBe(11);
    const w = st.windows.find((win) => win.id === "a")!;
    expect(w.maximized).toBeUndefined();
    expect(w.z).toBe(11);
  });
});

describe("open payload updates", () => {
  beforeEach(() => {
    useWindows.setState({ windows: [], topZ: 10 });
  });

  it("updates an existing window payload when reopening", () => {
    useWindows.getState().open("mynfts", { initialGame: "snake" });
    const first = useWindows.getState().windows[0];
    expect(first.payload?.initialGame).toBe("snake");

    useWindows.getState().open("mynfts", { initialGame: "breakout" });
    const st = useWindows.getState();

    expect(st.windows).toHaveLength(1);
    expect(st.windows[0].id).toBe(first.id);
    expect(st.windows[0].payload?.initialGame).toBe("breakout");
    expect(st.windows[0].z).toBeGreaterThan(first.z);
  });
});

describe("browser window", () => {
  beforeEach(() => {
    useWindows.setState({ windows: [], topZ: 10 });
  });

  it("opens a maximized browser window", () => {
    useWindows.getState().open("browser");
    const win = useWindows.getState().windows.find((w) => w.type === "browser");
    expect(win).toBeDefined();
    expect(win?.maximized).toBe(true);
  });

  it("is single-instance (re-open focuses the existing one)", () => {
    useWindows.getState().open("browser");
    useWindows.getState().open("browser");
    const count = useWindows
      .getState()
      .windows.filter((w) => w.type === "browser").length;
    expect(count).toBe(1);
  });
});
