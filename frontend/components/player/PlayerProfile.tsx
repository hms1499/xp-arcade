import { PlayerProfileBody } from "./PlayerProfileBody";

export function PlayerProfile({ address }: { address: string }) {
  return (
    <div className="min-h-screen p-4 bg-[#3a6ea5] text-white">
      <div className="bg-[#ece9d8] text-black border border-black/20 max-w-3xl mx-auto">
        <PlayerProfileBody address={address} showBackToDesktop />
      </div>
    </div>
  );
}
