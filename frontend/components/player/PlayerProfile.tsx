"use client";

import { shortAddress } from "@/lib/stacks-address";

export function PlayerProfile({ address }: { address: string }) {
  return (
    <div className="min-h-screen p-4 bg-[#3a6ea5] text-white">
      <div className="bg-[#ece9d8] text-black border border-black/20 max-w-3xl mx-auto p-4">
        <h1 className="text-lg font-bold mb-2">Player {shortAddress(address)}</h1>
        <p className="text-xs text-gray-700">Profile loading…</p>
      </div>
    </div>
  );
}
