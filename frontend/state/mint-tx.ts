"use client";
import { create } from "zustand";
import { watchTx, type TxStatus } from "@/lib/tx-tracker";
import { useWallet } from "@/state/wallet";
import { useToasts } from "@/state/toasts";
import { playSuccess } from "@/lib/sounds";

type MintTxState = {
  txId: string | null;
  status: TxStatus;
  start: (txId: string, score: number) => void;
  reset: () => void;
};

// Module-scoped so the running watch is never tied to React's lifecycle.
let stopFn: (() => void) | null = null;

export const useMintTx = create<MintTxState>((set) => ({
  txId: null,
  status: "pending",
  start: (txId, score) => {
    if (stopFn) {
      stopFn();
      stopFn = null;
    }
    set({ txId, status: "pending" });
    useWallet.getState().setMintPending(true);
    useToasts.getState().push({
      title: "Minting…",
      body: "Waiting for on-chain confirmation",
      type: "info",
      duration: 30_000,
    });
    stopFn = watchTx(txId, (s) => {
      set({ status: s });
      if (s === "pending") return;
      useWallet.getState().setMintPending(false);
      stopFn = null;
      if (s === "success") {
        playSuccess();
        useToasts.getState().push({
          title: "NFT confirmed!",
          body: `Score #${score} NFT is on-chain.`,
          type: "success",
          duration: 6000,
        });
      } else {
        useToasts.getState().push({
          title: "Mint failed",
          body: "Transaction was rejected on-chain.",
          type: "error",
          duration: 5000,
        });
      }
    });
  },
  reset: () => {
    if (stopFn) {
      stopFn();
      stopFn = null;
    }
    set({ txId: null, status: "pending" });
    useWallet.getState().setMintPending(false);
  },
}));
