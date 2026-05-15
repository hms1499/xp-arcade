import { notFound } from "next/navigation";
import { isStacksAddress } from "@/lib/stacks-address";
import { PlayerProfile } from "@/components/player/PlayerProfile";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  if (!isStacksAddress(address)) notFound();
  return <PlayerProfile address={address} />;
}
