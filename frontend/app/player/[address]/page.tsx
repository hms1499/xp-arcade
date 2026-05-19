import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isStacksAddress, shortAddress } from "@/lib/stacks-address";
import { PlayerProfile } from "@/components/player/PlayerProfile";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  if (!isStacksAddress(address)) return { title: "Player not found · XP Arcade" };
  const short = shortAddress(address);
  return {
    title: `Player ${short} · XP Arcade`,
    description: `Snake score NFTs minted by ${address}.`,
    openGraph: { title: `Player ${short}`, type: "profile" },
  };
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  if (!isStacksAddress(address)) notFound();
  return <PlayerProfile address={address} />;
}
