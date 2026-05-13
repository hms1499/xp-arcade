"use client";
import { create } from "zustand";
import {
  connect as connectWallet,
  disconnect as disconnectWallet,
  getLocalStorage,
  isConnected,
} from "@stacks/connect";

type WalletState = {
  address: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  hydrate: () => void;
};

function readStoredAddress(): string | null {
  if (typeof window === "undefined") return null;
  const data = getLocalStorage();
  return data?.addresses?.stx?.[0]?.address ?? null;
}

export const useWallet = create<WalletState>((set) => ({
  address: null,
  connect: async () => {
    await connectWallet();
    set({ address: readStoredAddress() });
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
}));
