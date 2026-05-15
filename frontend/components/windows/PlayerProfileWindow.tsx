"use client";
import { useWindows } from "@/state/window-manager";
import { Window } from "./Window";
import { PlayerProfileBody } from "@/components/player/PlayerProfileBody";
import { isStacksAddress, shortAddress } from "@/lib/stacks-address";

export function PlayerProfileWindow() {
  const w = useWindows((s) =>
    s.windows.find((win) => win.type === "player-profile")
  );
  if (!w) return null;

  const address = w.payload?.address ?? "";
  const valid = isStacksAddress(address);
  const title = valid ? `Player ${shortAddress(address)}` : "Player";

  return (
    <Window id={w.id} title={title} width={560}>
      {valid ? (
        <PlayerProfileBody address={address} />
      ) : (
        <p className="p-2 text-sm text-red-700">Invalid address.</p>
      )}
    </Window>
  );
}
