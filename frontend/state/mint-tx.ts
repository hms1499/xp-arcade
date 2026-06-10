"use client";
import { create } from "zustand";
import { type GameId } from "@/lib/game-registry";
import { watchTx, type TxStatus } from "@/lib/tx-tracker";
import { useWallet } from "@/state/wallet";
import { useToasts } from "@/state/toasts";
import { playSuccess } from "@/lib/sounds";

type MintTxState = {
  gameId: GameId | null;
  txId: string | null;
  status: TxStatus;
  start: (gameId: GameId, txId: string, score: number) => void;
  reset: () => void;
};

// Module-scoped so the running watch is never tied to React's lifecycle.
let stopFn: (() => void) | null = null;

export const useMintTx = create<MintTxState>((set) => ({
  gameId: null,
  txId: null,
  status: "pending",
  start: (gameId, txId, score) => {
    if (stopFn) {
      stopFn();
      stopFn = null;
    }
    set({ gameId, txId, status: "pending" });
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
      } else if (s === "timeout") {
        useToasts.getState().push({
          title: "Confirmation delayed",
          body: "The transaction may still confirm. Check it in Explorer.",
          type: "info",
          duration: 8000,
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
    set({ gameId: null, txId: null, status: "pending" });
    useWallet.getState().setMintPending(false);
  },
}));
