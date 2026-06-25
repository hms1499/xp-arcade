import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  cascadePosition,
  isUtilityType,
  isWindowActive,
  soloVisible,
  useWindows,
  type WindowEntry,
} from "./window-manager";

describe("cascadePosition", () => {
  it("starts at the top-left anchor for the first window", () => {
    expect(cascadePosition(0)).toEqual({ x: 100, y: 80 });
  });

  it("steps down-right for each subsequent window", () => {
    expect(cascadePosition(1)).toEqual({ x: 124, y: 104 });
  });

  it("wraps back so it never marches off-screen", () => {
    expect(cascadePosition(8)).toEqual(cascadePosition(0));
  });
});

describe("isUtilityType", () => {
  it("treats non-game, non-browser windows as utilities", () => {
    expect(isUtilityType("highscore")).toBe(true);
    expect(isUtilityType("control-panel")).toBe(true);
  });

  it("excludes games and the browser", () => {
    expect(isUtilityType("game-snake")).toBe(false);
    expect(isUtilityType("browser")).toBe(false);
  });
});

describe("soloVisible", () => {
  it("minimizes every other non-minimized window, keeping the target", () => {
    const result = soloVisible(
      [
        entry({ id: "a" }),
        entry({ id: "b" }),
        entry({ id: "c" }),
      ],
      "b",
    );
    expect(result.map((w) => [w.id, w.minimized])).toEqual([
      ["a", true],
      ["b", false],
      ["c", true],
    ]);
  });

  it("leaves an already-minimized window untouched (same ref)", () => {
    const minimized = entry({ id: "a", minimized: true });
    const result = soloVisible([minimized, entry({ id: "b" })], "b");
    expect(result[0]).toBe(minimized);
  });
});

describe("compact viewport keeps one window visible", () => {
  const matchMedia = (matches: boolean) =>
    ((q: string) => ({
      matches,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;

  beforeEach(() => {
    useWindows.setState({ windows: [], topZ: 10, lastPos: {} });
    window.matchMedia = matchMedia(true);
  });
  afterEach(() => {
    window.matchMedia = matchMedia(false);
  });

  it("minimizes the previous window when a second opens", () => {
    useWindows.getState().open("highscore");
    useWindows.getState().open("mynfts");
    const visible = useWindows
      .getState()
      .windows.filter((w) => !w.minimized);
    expect(visible).toHaveLength(1);
    expect(visible[0].type).toBe("mynfts");
  });

  it("focusing a minimized window hides the others", () => {
    useWindows.getState().open("highscore");
    const first = useWindows.getState().windows[0].id;
    useWindows.getState().open("mynfts");
    useWindows.getState().focus(first);
    const visible = useWindows
      .getState()
      .windows.filter((w) => !w.minimized);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe(first);
  });
});

describe("window position memory", () => {
  beforeEach(() => {
    useWindows.setState({ windows: [], topZ: 10, lastPos: {} });
  });

  it("reopens a window where the user last moved it", () => {
    useWindows.getState().open("highscore");
    const id = useWindows.getState().windows[0].id;
    useWindows.getState().move(id, 333, 222);
    useWindows.getState().close(id);

    useWindows.getState().open("highscore");
    const win = useWindows
      .getState()
      .windows.find((w) => w.type === "highscore")!;
    expect(win.x).toBe(333);
    expect(win.y).toBe(222);
  });
});

describe("closeTopWindowIfUtility", () => {
  beforeEach(() => {
    useWindows.setState({ windows: [], topZ: 10, lastPos: {} });
  });

  it("closes the topmost window when it is a utility", () => {
    useWindows.getState().open("highscore");
    useWindows.getState().closeTopWindowIfUtility();
    expect(useWindows.getState().windows).toHaveLength(0);
  });

  it("leaves a game on top untouched (it handles Escape itself)", () => {
    useWindows.getState().open("highscore");
    useWindows.getState().open("game-snake"); // now on top
    useWindows.getState().closeTopWindowIfUtility();
    const types = useWindows.getState().windows.map((w) => w.type);
    expect(types).toContain("game-snake");
    expect(types).toContain("highscore");
  });

  it("is a no-op when nothing is open", () => {
    useWindows.getState().closeTopWindowIfUtility();
    expect(useWindows.getState().windows).toHaveLength(0);
  });
});

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
