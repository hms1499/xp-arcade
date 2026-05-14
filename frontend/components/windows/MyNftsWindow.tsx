"use client";
import { useEffect, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { Window } from "./Window";
import { stacks } from "@/lib/stacks";
import { rarityColor } from "@/lib/metadata-svg";

type Nft = {
  id: number;
  image: string;
  name: string;
  rarity?: string;
};

async function fetchHoldings(addr: string): Promise<Nft[]> {
  const apiBase = stacks.network.client?.baseUrl ?? "https://api.hiro.so";
  const scoreAsset = `${stacks.contractAddress}.${stacks.contractName}::snake-score`;
  const url = `${apiBase}/extended/v1/tokens/nft/holdings?principal=${addr}&asset_identifiers=${scoreAsset}&limit=50`;
  const data = await fetch(url).then((r) => r.json());
  const results = (data.results ?? []) as Array<{ value: { repr: string } }>;
  return Promise.all(
    results.map(async (r) => {
      const id = Number(r.value.repr.replace("u", ""));
      const meta = await fetch(`/api/metadata/score/${id}`).then((x) => x.json());
      const rarity = (
        meta.attributes as Array<{ trait_type: string; value: string }> | undefined
      )?.find((a) => a.trait_type === "Rarity")?.value;
      return { id, image: meta.image, name: meta.name, rarity };
    })
  );
}

export function MyNftsWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "my-nfts"));
  const address = useWallet((s) => s.address);
  const [nfts, setNfts] = useState<Nft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!w || !address) return;
    setNfts(null);
    setError(null);
    fetchHoldings(address)
      .then(setNfts)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [w, address]);

  if (!w) return null;

  return (
    <Window id={w.id} title="My Snake NFTs" width={480}>
      <div className="p-2">
        {!address && (
          <p className="text-sm">Connect your wallet to see your NFTs.</p>
        )}
        {address && nfts === null && !error && <p className="text-sm">Loading…</p>}
        {error && <p className="text-red-600 text-xs">⚠️ {error}</p>}
        {nfts?.length === 0 && (
          <p className="text-sm text-gray-600">
            No NFTs yet. Play Snake and mint your first score!
          </p>
        )}
        {nfts && nfts.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {nfts.map((n) => (
              <div
                key={n.id}
                className="text-center text-xs border border-gray-300 p-1"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={n.image} alt={n.name} className="w-full h-auto" />
                <div className="mt-1 truncate">{n.name}</div>
                {n.rarity && (
                  <div
                    className="text-[9px] font-bold mt-0.5"
                    style={{ color: rarityColor(n.rarity) }}
                  >
                    {n.rarity}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Window>
  );
}
