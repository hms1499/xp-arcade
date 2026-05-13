"use client";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";

export function StartMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const openWin = useWindows((s) => s.open);
  const disconnect = useWallet((s) => s.disconnect);

  if (!open) return null;

  const items: Array<{ icon: string; label: string; onClick: () => void }> = [
    { icon: "🐍", label: "Play Snake", onClick: () => openWin("game") },
    { icon: "🏆", label: "Leaderboard", onClick: () => openWin("leaderboard") },
    { icon: "💾", label: "My Snake NFTs", onClick: () => openWin("my-nfts") },
  ];

  return (
    <div className="absolute bottom-8 left-0 w-64 bg-white border border-blue-700 shadow-xl text-sm text-black z-50">
      <div className="bg-blue-700 text-white px-2 py-1 font-bold">
        Snake XP
      </div>
      <ul className="p-1">
        {items.map((it) => (
          <li key={it.label}>
            <button
              className="w-full text-left px-2 py-1 hover:bg-blue-600 hover:text-white flex gap-2"
              onClick={() => {
                it.onClick();
                onClose();
              }}
            >
              <span>{it.icon}</span>
              <span>{it.label}</span>
            </button>
          </li>
        ))}
        <li className="border-t my-1" />
        <li>
          <button
            className="w-full text-left px-2 py-1 hover:bg-blue-600 hover:text-white"
            onClick={() => {
              disconnect();
              onClose();
            }}
          >
            🔌 Disconnect Wallet
          </button>
        </li>
        <li>
          <button
            className="w-full text-left px-2 py-1 hover:bg-blue-600 hover:text-white"
            onClick={() => location.reload()}
          >
            ⏻ Shut Down
          </button>
        </li>
      </ul>
    </div>
  );
}
