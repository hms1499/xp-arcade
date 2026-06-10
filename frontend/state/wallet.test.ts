import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@stacks/connect", () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  getLocalStorage: vi.fn(() => null),
  isConnected: vi.fn(() => false),
}));

import { connect as connectWallet, getLocalStorage } from "@stacks/connect";
import { useWallet } from "./wallet";

const mockConnect = vi.mocked(connectWallet);
const mockGetLocalStorage = vi.mocked(getLocalStorage);

describe("wallet.connect", () => {
  beforeEach(() => {
    useWallet.setState({ address: null });
    mockConnect.mockReset();
    mockGetLocalStorage.mockReset();
    mockGetLocalStorage.mockReturnValue(null);
  });
  afterEach(() => vi.clearAllMocks());

  it("stores the connected STX address after a successful connect", async () => {
    mockConnect.mockResolvedValueOnce({ addresses: [] });
    mockGetLocalStorage.mockReturnValueOnce({
      addresses: { stx: [{ address: "SP123" }] },
    } as ReturnType<typeof getLocalStorage>);

    await useWallet.getState().connect();

    expect(useWallet.getState().address).toBe("SP123");
  });

  it("does not throw and keeps address null when the user cancels", async () => {
    mockConnect.mockRejectedValueOnce(new Error("User canceled"));
    await expect(useWallet.getState().connect()).resolves.toBeUndefined();
    expect(useWallet.getState().address).toBeNull();
  });
});
