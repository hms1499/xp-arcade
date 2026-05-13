"use client";
import { useState } from "react";
import { useWallet } from "@/state/wallet";
import { mintScore } from "@/lib/contract-calls";

export function MintDialog({
  score,
  onClose,
  onPlayAgain,
}: {
  score: number;
  onClose: () => void;
  onPlayAgain: () => void;
}) {
  const address = useWallet((s) => s.address);
  const [busy, setBusy] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleMint() {
    if (!address) {
      setError("Connect wallet first");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const tx = await mintScore(score, name || "anon");
      setTxId(tx);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mint failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-sm">
      <p className="mb-3">
        ⚠️ <b>Game Over</b> — Score: <b>{score}</b>
      </p>
      {!txId && (
        <fieldset className="mb-3">
          <legend>Player name</legend>
          <input
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            placeholder="anon"
            disabled={busy}
          />
        </fieldset>
      )}
      {error && (
        <p className="text-red-600 text-xs mb-2">⚠️ {error}</p>
      )}
      {txId ? (
        <div>
          <p className="text-green-700 mb-2">✓ Minted! Tx:</p>
          <code className="text-xs break-all">{txId}</code>
          <div className="mt-3 flex gap-2">
            <button onClick={onPlayAgain}>Play Again</button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={handleMint} disabled={busy}>
            {busy ? "Minting…" : "Mint as NFT"}
          </button>
          <button onClick={onPlayAgain} disabled={busy}>
            Play Again
          </button>
          <button onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
