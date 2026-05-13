"use client";
import { useWindows } from "@/state/window-manager";
import { Window } from "./Window";

export function MyNftsWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "my-nfts"));
  if (!w) return null;
  return (
    <Window id={w.id} title="My Snake NFTs">
      <div className="p-4 text-sm">NFT list goes here</div>
    </Window>
  );
}
