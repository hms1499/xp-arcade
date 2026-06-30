// frontend/hooks/useConnectedPlayerStats.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ScoreNft } from "@/lib/holdings";
import type { PlayerStats } from "@/lib/player-stats";

const fetchMock = vi.fn();
vi.mock("@/lib/holdings", () => ({
  fetchAllScoreHoldings: (addr: string) => fetchMock(addr),
}));

import { useWallet } from "@/state/wallet";
import { clearReadCache } from "@/lib/read-cache";
import { useConnectedPlayerStats } from "./useConnectedPlayerStats";

// Enable React act() so createRoot + act() flush effects synchronously.
// @ts-expect-error -- non-standard React internal flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function nft(score: number): ScoreNft {
  return { id: score, gameId: "snake", score, season: 1 } as ScoreNft;
}

// A probe component captures the hook's return into a module-level variable so
// the test can assert on it (no @testing-library renderHook in this project).
let probed: { stats: PlayerStats | null };
function Probe() {
  // eslint-disable-next-line react-hooks/globals
  probed = useConnectedPlayerStats();
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  fetchMock.mockReset();
  clearReadCache(); // prevent a cached holdings:SP_A entry from bleeding across tests
  useWallet.setState({ address: null });
  probed = { stats: null };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

describe("useConnectedPlayerStats", () => {
  it("is null when no wallet is connected", () => {
    act(() => { root.render(<Probe />); });
    expect(probed.stats).toBeNull();
  });

  it("loads stats for the connected address", async () => {
    fetchMock.mockResolvedValue([nft(40), nft(60)]);
    useWallet.setState({ address: "SP_A" });
    await act(async () => { root.render(<Probe />); });
    expect(fetchMock).toHaveBeenCalledWith("SP_A");
    expect(probed.stats).not.toBeNull();
    expect(probed.stats!.totalScore).toBe(100);
  });

  it("stays null on fetch error", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    useWallet.setState({ address: "SP_A" });
    await act(async () => { root.render(<Probe />); });
    expect(fetchMock).toHaveBeenCalled();
    expect(probed.stats).toBeNull();
  });
});
