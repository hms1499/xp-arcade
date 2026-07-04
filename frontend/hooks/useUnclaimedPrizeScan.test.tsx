// frontend/hooks/useUnclaimedPrizeScan.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useWallet } from "@/state/wallet";
import { useUnclaimedPrizes, resetUnclaimedForTest } from "@/state/unclaimed-prizes";
import { useUnclaimedPrizeScan } from "./useUnclaimedPrizeScan";

// @ts-expect-error -- non-standard React internal flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  useUnclaimedPrizeScan();
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  resetUnclaimedForTest();
  useWallet.setState({ address: null });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

describe("useUnclaimedPrizeScan", () => {
  it("scans when a wallet is connected", () => {
    const scan = vi.fn(() => Promise.resolve());
    useUnclaimedPrizes.setState({ scan });
    useWallet.setState({ address: "SP_A" });
    act(() => { root.render(<Probe />); });
    expect(scan).toHaveBeenCalledWith("SP_A");
  });

  it("resets when the wallet disconnects", () => {
    const reset = vi.fn();
    useUnclaimedPrizes.setState({ reset });
    act(() => { root.render(<Probe />); });
    expect(reset).toHaveBeenCalled();
  });

  it("re-scans on address change", () => {
    const scan = vi.fn(() => Promise.resolve());
    useUnclaimedPrizes.setState({ scan });
    useWallet.setState({ address: "SP_A" });
    act(() => { root.render(<Probe />); });
    act(() => { useWallet.setState({ address: "SP_B" }); });
    expect(scan).toHaveBeenLastCalledWith("SP_B");
  });
});
