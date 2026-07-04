"use client";
import { useEffect } from "react";
import { useWallet } from "@/state/wallet";
import { useUnclaimedPrizes } from "@/state/unclaimed-prizes";

/** Keep the unclaimed-prizes store in step with the connected wallet. */
export function useUnclaimedPrizeScan(): void {
  const address = useWallet((s) => s.address);
  useEffect(() => {
    if (!address) {
      useUnclaimedPrizes.getState().reset();
      return;
    }
    void useUnclaimedPrizes.getState().scan(address);
  }, [address]);
}
