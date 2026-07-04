"use client";
import { useUnclaimedPrizeScan } from "@/hooks/useUnclaimedPrizeScan";

/** Invisible: runs the unclaimed-prize scan inside a client boundary. */
export function PrizeWatcher() {
  useUnclaimedPrizeScan();
  return null;
}
