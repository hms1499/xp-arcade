import { describe, it, expect, beforeEach, vi } from "vitest";

// Capture the onUpdate watchTx is given, and expose a stop spy.
const stopSpy = vi.fn();
let captured: ((s: string) => void) | null = null;
vi.mock("@/lib/tx-tracker", () => ({
  watchTx: (_txId: string, onUpdate: (s: string) => void) => {
    captured = onUpdate;
    return stopSpy;
  },
}));
const playSuccess = vi.fn();
vi.mock("@/lib/sounds", () => ({ playSuccess: () => playSuccess() }));

import { useMintTx } from "./mint-tx";
import { useWallet } from "./wallet";
import { useToasts } from "./toasts";

beforeEach(() => {
  captured = null;
  stopSpy.mockClear();
  playSuccess.mockClear();
  useMintTx.setState({ gameId: null, txId: null, status: "pending" });
  useWallet.setState({ mintPending: false });
  useToasts.setState({ toasts: [] });
});

describe("useMintTx.start", () => {
  it("sets pending state + wallet.mintPending and pushes a minting toast", () => {
    useMintTx.getState().start("snake", "0xabc", 42);
    expect(useMintTx.getState().txId).toBe("0xabc");
    expect(useMintTx.getState().status).toBe("pending");
    expect(useWallet.getState().mintPending).toBe(true);
    const t = useToasts.getState().toasts;
    expect(t.some((x) => x.title === "Minting…")).toBe(true);
  });

  it("on success: clears pending, plays sound, pushes success toast", () => {
    useMintTx.getState().start("snake", "0xabc", 7);
    captured!("success");
    expect(useMintTx.getState().status).toBe("success");
    expect(useWallet.getState().mintPending).toBe(false);
    expect(playSuccess).toHaveBeenCalledTimes(1);
    expect(
      useToasts.getState().toasts.some((x) => x.title === "NFT confirmed!"),
    ).toBe(true);
  });

  it("on a terminal failure: clears pending, pushes error toast, no sound", () => {
    useMintTx.getState().start("snake", "0xabc", 1);
    captured!("failed");
    expect(useMintTx.getState().status).toBe("failed");
    expect(useWallet.getState().mintPending).toBe(false);
    expect(playSuccess).not.toHaveBeenCalled();
    expect(
      useToasts.getState().toasts.some((x) => x.title === "Mint failed"),
    ).toBe(true);
  });

  it("on timeout: clears pending and reports delayed confirmation", () => {
    useMintTx.getState().start("snake", "0xabc", 1);
    captured!("timeout");
    expect(useMintTx.getState().status).toBe("timeout");
    expect(useWallet.getState().mintPending).toBe(false);
    expect(
      useToasts.getState().toasts.some(
        (x) => x.title === "Confirmation delayed",
      ),
    ).toBe(true);
  });

  it("watch is independent of React: onUpdate still updates the store later", () => {
    useMintTx.getState().start("snake", "0xabc", 5);
    captured!("abort_by_response");
    expect(useMintTx.getState().status).toBe("abort_by_response");
    expect(useWallet.getState().mintPending).toBe(false);
  });

  it("reset() stops the watch and clears state", () => {
    useMintTx.getState().start("snake", "0xabc", 9);
    useMintTx.getState().reset();
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(useMintTx.getState().txId).toBeNull();
    expect(useMintTx.getState().status).toBe("pending");
    expect(useWallet.getState().mintPending).toBe(false);
  });

  it("starting again stops the previous watch first", () => {
    useMintTx.getState().start("snake", "0xaaa", 1);
    useMintTx.getState().start("snake", "0xbbb", 2);
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(useMintTx.getState().txId).toBe("0xbbb");
  });
});
