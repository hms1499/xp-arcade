"use client";
import { create } from "zustand";
import {
  connect as connectWallet,
  disconnect as disconnectWallet,
  getLocalStorage,
  isConnected,
} from "@stacks/connect";
import { reportClientError } from "@/lib/telemetry";

type WalletState = {
  address: string | null;
  mintPending: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  hydrate: () => void;
  setMintPending: (v: boolean) => void;
};

function readStoredAddress(): string | null {
  if (typeof window === "undefined") return null;
  const data = getLocalStorage();
  return data?.addresses?.stx?.[0]?.address ?? null;
}

export const useWallet = create<WalletState>((set) => ({
  address: null,
  mintPending: false,
  connect: async () => {
    try {
      await connectWallet();
      set({ address: readStoredAddress() });
    } catch (error) {
      // User cancelled the wallet modal (or the wallet errored). Keep the
      // current address rather than surfacing an unhandled rejection.
      const message = error instanceof Error ? error.message : String(error);
      if (!/cancel/i.test(message)) {
        reportClientError("wallet_connect_error", error);
      }
    }
  },
  disconnect: () => {
    disconnectWallet();
    set({ address: null });
  },
  hydrate: () => {
    if (isConnected()) {
      set({ address: readStoredAddress() });
    }
  },
  setMintPending: (v) => set({ mintPending: v }),
}));
