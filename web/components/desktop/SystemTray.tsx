"use client";
import { useEffect } from "react";
import { useWallet } from "@/state/wallet";

export function SystemTray() {
  const address = useWallet((s) => s.address);
  const connect = useWallet((s) => s.connect);
  const disconnect = useWallet((s) => s.disconnect);
  const hydrate = useWallet((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <div className="flex items-center gap-2 px-2 h-full text-white text-xs">
      {address ? (
        <button
          onClick={disconnect}
          title={address}
          className="flex items-center gap-1"
        >
          <span className="text-green-400">●</span>
          {address.slice(0, 5)}…{address.slice(-4)}
        </button>
      ) : (
        <button onClick={connect}>Connect Wallet</button>
      )}
    </div>
  );
}
