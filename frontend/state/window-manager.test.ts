import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  cascadePosition,
  isUtilityType,
  isWindowActive,
  soloVisible,
  useWindows,
  isResizableType,
  clampGeometry,
  resizeGeometry,
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

describe("isResizableType", () => {
  it("allows utility windows", () => {
    expect(isResizableType("highscore")).toBe(true);
    expect(isResizableType("browser")).toBe(true);
    expect(isResizableType("swap")).toBe(true);
  });

  it("allows game windows -- the play field scales to fit", () => {
    expect(isResizableType("game-snake")).toBe(true);
    expect(isResizableType("game-solitaire")).toBe(true);
  });
});

describe("clampGeometry", () => {
  const vp = { width: 1024, height: 768 };

  it("enforces the 300x200 minimum size", () => {
    const g = clampGeometry({ x: 50, y: 50, w: 100, h: 80 }, vp);
    expect(g.w).toBe(300);
    expect(g.h).toBe(200);
  });

  it("caps size to the viewport minus the 28px taskbar", () => {
    const g = clampGeometry({ x: 0, y: 0, w: 5000, h: 5000 }, vp);
    expect(g.w).toBe(1024);
    expect(g.h).toBe(740);
  });

  it("keeps the title bar reachable (same bounds as drag)", () => {
    const g = clampGeometry({ x: -900, y: -50, w: 400, h: 300 }, vp);
    expect(g.x).toBe(-400 + 60);
    expect(g.y).toBe(0);
  });

  it("lets min size win over a degenerate viewport", () => {
    const g = clampGeometry({ x: 0, y: 0, w: 400, h: 300 }, { width: 200, height: 100 });
    expect(g.w).toBe(300);
    expect(g.h).toBe(200);
  });
});

describe("resizeGeometry", () => {
  const vp = { width: 1024, height: 768 };
  const start = { x: 100, y: 80, w: 400, h: 300 };

  it("grows from the right/bottom edges by the pointer delta", () => {
    const g = resizeGeometry(start, { right: true, bottom: true }, 50, 40, vp);
    expect(g).toEqual({ x: 100, y: 80, w: 450, h: 340 });
  });

  it("dragging the left edge moves x and anchors the right edge", () => {
    const g = resizeGeometry(start, { left: true }, 50, 0, vp);
    expect(g).toEqual({ x: 150, y: 80, w: 350, h: 300 });
    expect(g.x + g.w).toBe(start.x + start.w);
  });

  it("keeps the right edge anchored when a left drag hits min width", () => {
    const g = resizeGeometry(start, { left: true }, 999, 0, vp);
    expect(g.w).toBe(300);
    expect(g.x + g.w).toBe(start.x + start.w);
  });

  it("dragging the top edge moves y and anchors the bottom edge", () => {
    const g = resizeGeometry(start, { top: true }, 0, 30, vp);
    expect(g).toEqual({ x: 100, y: 110, w: 400, h: 270 });
    expect(g.y + g.h).toBe(start.y + start.h);
  });

  it("resizes both axes from a corner", () => {
    const g = resizeGeometry(start, { top: true, right: true }, 20, -10, vp);
    expect(g).toEqual({ x: 100, y: 70, w: 420, h: 310 });
  });
});

describe("resize action + geometry memory", () => {
  const matchMedia = (matches: boolean) =>
    ((q: string) => ({
      matches,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;

  beforeEach(() => {
    useWindows.setState({ windows: [], topZ: 10, lastPos: {} });
    window.matchMedia = matchMedia(false);
  });

  it("applies geometry to the target window", () => {
    useWindows.getState().open("highscore");
    const id = useWindows.getState().windows[0].id;
    useWindows.getState().resize(id, { x: 40, y: 30, w: 640, h: 480 });
    const w = useWindows.getState().windows[0];
    expect([w.x, w.y, w.w, w.h]).toEqual([40, 30, 640, 480]);
  });

  it("clamps below-minimum geometry", () => {
    useWindows.getState().open("highscore");
    const id = useWindows.getState().windows[0].id;
    useWindows.getState().resize(id, { x: 40, y: 30, w: 10, h: 10 });
    const w = useWindows.getState().windows[0];
    expect([w.w, w.h]).toEqual([300, 200]);
  });

  it("is a same-ref no-op for unknown ids", () => {
    useWindows.getState().open("highscore");
    const before = useWindows.getState().windows;
    useWindows.getState().resize("nope", { x: 0, y: 0, w: 400, h: 300 });
    expect(useWindows.getState().windows).toBe(before);
  });

  it("remembers geometry so reopen restores it", () => {
    useWindows.getState().open("highscore");
    const id = useWindows.getState().windows[0].id;
    useWindows.getState().resize(id, { x: 40, y: 30, w: 640, h: 480 });
    useWindows.getState().close(id);
    useWindows.getState().open("highscore");
    const w = useWindows.getState().windows[0];
    expect([w.x, w.y, w.w, w.h]).toEqual([40, 30, 640, 480]);
  });

  it("move updates position without clobbering remembered size", () => {
    useWindows.getState().open("highscore");
    const id = useWindows.getState().windows[0].id;
    useWindows.getState().resize(id, { x: 40, y: 30, w: 640, h: 480 });
    useWindows.getState().move(id, 200, 150);
    useWindows.getState().close(id);
    useWindows.getState().open("highscore");
    const w = useWindows.getState().windows[0];
    expect([w.x, w.y, w.w, w.h]).toEqual([200, 150, 640, 480]);
  });

  it("windows that never resized reopen without w/h", () => {
    useWindows.getState().open("highscore");
    const id = useWindows.getState().windows[0].id;
    useWindows.getState().move(id, 200, 150);
    useWindows.getState().close(id);
    useWindows.getState().open("highscore");
    const w = useWindows.getState().windows[0];
    expect([w.x, w.y, w.w, w.h]).toEqual([200, 150, undefined, undefined]);
  });
});
