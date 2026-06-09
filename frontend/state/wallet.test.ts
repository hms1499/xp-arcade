import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@stacks/connect", () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  getLocalStorage: vi.fn(() => null),
  isConnected: vi.fn(() => false),
}));

import { connect as connectWallet } from "@stacks/connect";
import { useWallet } from "./wallet";

const mockConnect = vi.mocked(connectWallet);

describe("wallet.connect", () => {
  beforeEach(() => {
    useWallet.setState({ address: null });
    mockConnect.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it("does not throw and keeps address null when the user cancels", async () => {
    mockConnect.mockRejectedValueOnce(new Error("User canceled"));
    await expect(useWallet.getState().connect()).resolves.toBeUndefined();
    expect(useWallet.getState().address).toBeNull();
  });
});
