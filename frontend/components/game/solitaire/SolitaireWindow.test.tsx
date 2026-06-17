import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { solitaireScore } from "@/lib/solitaire-score";
import type { SolitaireState } from "./SolitaireEngine";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Spy on the score-submission path so we can assert mint gating.
const { handleGameOver } = vi.hoisted(() => ({ handleGameOver: vi.fn() }));

vi.mock("@/state/window-manager", () => ({
  useWindows: (sel: (s: unknown) => unknown) =>
    sel({ windows: [{ id: "w1", type: "game-solitaire" }], close: vi.fn() }),
}));

vi.mock("@/hooks/useGameSession", () => ({
  useGameSession: () => ({
    finalScore: 0,
    showMint: false,
    isTopScore: false,
    riskReport: { level: "low", reasons: [], durationSeconds: null },
    handleGameOver,
    handlePlayAgain: vi.fn(),
  }),
}));

// GameShellWindow + SharedMintDialog pull in many stores; stub them out.
vi.mock("@/components/shared/GameShellWindow", () => ({
  GameShellWindow: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/shared/SharedMintDialog", () => ({
  SharedMintDialog: () => null,
}));

// A board one Auto-finish away from a win: A..Q on every foundation, the four
// kings face-up on tableau, empty stock + waste -> canAutoComplete() is true.
function nearWonState(drawMode: 1 | 3): SolitaireState {
  const foundations = (["S", "H", "D", "C"] as const).map((suit) =>
    Array.from({ length: 12 }, (_, i) => ({ suit, rank: i + 1, faceUp: true })),
  );
  const tableau: SolitaireState["tableau"] = [
    [{ suit: "S", rank: 13, faceUp: true }],
    [{ suit: "H", rank: 13, faceUp: true }],
    [{ suit: "D", rank: 13, faceUp: true }],
    [{ suit: "C", rank: 13, faceUp: true }],
    [],
    [],
    [],
  ];
  return { stock: [], waste: [], foundations, tableau, drawMode, moveCount: 0, won: false };
}

// Keep the real engine logic (autoComplete/isWon/canAutoComplete) but deal a
// deterministic near-won board.
vi.mock("./SolitaireEngine", async (importOriginal) => {
  const real = await importOriginal<typeof import("./SolitaireEngine")>();
  return { ...real, createGame: vi.fn((mode: 1 | 3) => nearWonState(mode)) };
});

const { SolitaireWindow } = await import("./SolitaireWindow");

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<SolitaireWindow />);
  });
  return { container, root };
}

function clickButton(container: HTMLElement, text: string) {
  const btn = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  ) as HTMLButtonElement | undefined;
  if (!btn) throw new Error(`button containing "${text}" not found`);
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function setSelect(container: HTMLElement, value: string) {
  const select = container.querySelector("select") as HTMLSelectElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("SolitaireWindow scoring constant", () => {
  it("a 2-minute win computes to a 6000 score", () => {
    expect(solitaireScore(120)).toBe(6000);
  });
});

describe("SolitaireWindow mint gating", () => {
  beforeEach(() => handleGameOver.mockClear());

  it("submits the score exactly once on a ranked (Draw-3) win", () => {
    const { container, root } = mount();
    clickButton(container, "Auto-finish"); // drives the board to a win
    expect(handleGameOver).toHaveBeenCalledTimes(1);
    expect(typeof handleGameOver.mock.calls[0][0]).toBe("number");
    act(() => root.unmount());
    container.remove();
  });

  it("does NOT submit on a practice (Draw-1) win", () => {
    const { container, root } = mount();
    setSelect(container, "1"); // switch to practice; newGame(1) re-deals near-won
    clickButton(container, "Auto-finish");
    expect(handleGameOver).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});
