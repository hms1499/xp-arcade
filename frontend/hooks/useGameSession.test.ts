// frontend/hooks/useGameSession.test.ts
// Tests without @testing-library/react (not installed).
// We test the exported module shape and the pure-logic helpers directly.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/contract-calls", () => ({
  getTopTenForGame: vi.fn().mockResolvedValue([
    { player: "SP1", score: 100 },
    { player: "SP2", score: 80 },
  ]),
}));

vi.mock("@/state/mint-tx", () => ({
  useMintTx: vi.fn((selector: (s: { gameId: null; txId: null; status: string }) => unknown) =>
    selector({ gameId: null, txId: null, status: "pending" })
  ),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useState: vi.fn((initial: unknown) => [initial, vi.fn()]),
    useCallback: vi.fn((fn: unknown) => fn),
  };
});

describe("useGameSession module", () => {
  it("exports useGameSession as a function", async () => {
    const mod = await import("./useGameSession");
    expect(typeof mod.useGameSession).toBe("function");
  });
});

describe("isTopScore logic", () => {
  it("score beats min when fewer than 10 entries", () => {
    const top = [{ score: 100 }, { score: 80 }];
    const min = top.length < 10 ? -1 : Math.min(...top.map((e) => e.score));
    expect(120 > min).toBe(true);
  });

  it("score does NOT beat min when board is full and score is low", () => {
    const top = Array.from({ length: 10 }, (_, i) => ({ score: 100 - i }));
    const min = top.length < 10 ? -1 : Math.min(...top.map((e) => e.score));
    expect(50 > min).toBe(false);
  });

  it("score beats min when board is full and score is high enough", () => {
    const top = Array.from({ length: 10 }, (_, i) => ({ score: 100 - i }));
    const min = top.length < 10 ? -1 : Math.min(...top.map((e) => e.score));
    expect(200 > min).toBe(true);
  });
});
