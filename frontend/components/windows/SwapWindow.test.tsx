import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SwapWindow } from "./SwapWindow";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { stacks } from "@/lib/stacks";

// @ts-expect-error -- non-standard React internal flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // jsdom does not implement window.matchMedia; stub it so Window.tsx doesn't throw.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  useWindows.setState({ windows: [], topZ: 10, lastPos: {} });
  useWallet.setState({ address: null });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

describe("SwapWindow", () => {
  it("renders nothing when no swap window is open", () => {
    act(() => { root.render(<SwapWindow />); });
    expect(container.textContent).toBe("");
  });

  it("shows a guard/connect state when the window is open", () => {
    act(() => { useWindows.getState().open("swap"); });
    act(() => { root.render(<SwapWindow />); });
    const text = container.textContent ?? "";
    if (stacks.networkName === "mainnet") {
      // Mainnet + no wallet → connect CTA.
      expect(text).toMatch(/connect your wallet/i);
    } else {
      // Non-mainnet env → mainnet-only notice.
      expect(text).toMatch(/only available on mainnet/i);
    }
  });

  it("shows the connect-wallet CTA on mainnet when no wallet is connected", () => {
    const originalNetworkName = stacks.networkName;
    try {
      stacks.networkName = "mainnet";
      useWallet.setState({ address: null });
      act(() => { useWindows.getState().open("swap"); });
      act(() => { root.render(<SwapWindow />); });
      expect(container.textContent ?? "").toMatch(/connect your wallet/i);
    } finally {
      stacks.networkName = originalNetworkName;
    }
  });
});
