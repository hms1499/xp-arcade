"use client";
import { create } from "zustand";
import { watchTx, type TxStatus } from "@/lib/tx-tracker";
import { useToasts } from "@/state/toasts";
import { playSuccess } from "@/lib/sounds";

type SwapTxState = {
  txId: string | null;
  status: TxStatus;
  start: (txId: string, label: string) => void;
  reset: () => void;
};

// Module-scoped so the running watch is not tied to React's lifecycle.
let stopFn: (() => void) | null = null;

export const useSwapTx = create<SwapTxState>((set) => ({
  txId: null,
  status: "pending",
  start: (txId, label) => {
    if (stopFn) { stopFn(); stopFn = null; }
    set({ txId, status: "pending" });
    useToasts.getState().push({
      title: "Swapping…",
      body: "Waiting for on-chain confirmation",
      type: "info",
      duration: 30_000,
    });
    stopFn = watchTx(txId, (s) => {
      set({ status: s });
      if (s === "pending") return;
      stopFn = null;
      if (s === "success") {
        playSuccess();
        useToasts.getState().push({
          title: "Swap complete",
          body: label,
          type: "success",
          duration: 6000,
        });
      } else if (s === "timeout") {
        useToasts.getState().push({
          title: "Still pending",
          body: "The swap is taking longer than expected. Check your wallet.",
          type: "info",
          duration: 8000,
        });
      } else {
        useToasts.getState().push({
          title: "Swap failed",
          body: "The transaction did not confirm.",
          type: "error",
          duration: 8000,
        });
      }
    });
  },
  reset: () => {
    if (stopFn) { stopFn(); stopFn = null; }
    set({ txId: null, status: "pending" });
  },
}));
