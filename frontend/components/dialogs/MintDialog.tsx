"use client";
import { useState } from "react";
import { useWallet } from "@/state/wallet";
import { mintScore } from "@/lib/contract-calls";
import { useMintTx } from "@/state/mint-tx";
import { type TxStatus } from "@/lib/tx-tracker";
import { recordScore } from "@/lib/high-score";

const STATUS_LABEL: Record<TxStatus, string> = {
  pending: "⏳ Confirming…",
  success: "✓ Confirmed!",
  abort_by_response: "✗ Failed (contract error)",
  abort_by_post_condition: "✗ Failed (post-condition)",
  failed: "✗ Failed",
};

const STATUS_COLOR: Record<TxStatus, string> = {
  pending: "#888",
  success: "#007700",
  abort_by_response: "#cc0000",
  abort_by_post_condition: "#cc0000",
  failed: "#cc0000",
};

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
  const connect = useWallet((s) => s.connect);
  const mintStatus = useMintTx((s) => s.status);
  const startMintTx = useMintTx((s) => s.start);
  const [busy, setBusy] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);
  const defaultName = address ? address.slice(-8) : "anon";
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Record this run once on mount; lazy init runs exactly once per dialog.
  const [hs] = useState(() => recordScore(score));

  async function handleMint() {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const tx = await mintScore(score, name || defaultName, address);
      setTxId(tx);
      startMintTx(tx, score);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Mint failed";
      if (msg.includes("104") || msg.toLowerCase().includes("score-too-high")) {
        setError("Score rejected by contract (too high). Please play a normal game.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-sm mint-dialog-enter">
      <p className="mb-3">
        ⚠️ <b>Game Over</b> — Score: <b>{score}</b>
        <span className="block text-xs mt-1">
          {hs.isNewRecord ? (
            <b style={{ color: "#007700" }}>🏅 New personal best!</b>
          ) : (
            <span className="text-gray-500">Personal best: <b>{hs.best}</b></span>
          )}
        </span>
        <span className="block text-xs text-gray-500 mt-1">
          Minting costs <b>0.01 STX</b> and records your score on-chain forever.
        </span>
      </p>
      {!txId && (
        <fieldset className="mb-3">
          <legend>Player name</legend>
          <input
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            placeholder={defaultName}
            disabled={busy}
          />
        </fieldset>
      )}
      {error && <p className="text-red-600 text-xs mb-2">⚠️ {error}</p>}
      {txId ? (
        <div>
          <p style={{ color: STATUS_COLOR[mintStatus], marginBottom: 4 }}>
            {STATUS_LABEL[mintStatus]}
          </p>
          <code className="text-xs break-all">{txId}</code>
          <div className="mt-3 flex gap-2">
            <button onClick={onPlayAgain}>Play Again</button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          {address ? (
            <button onClick={handleMint} disabled={busy}>
              {busy ? "Minting…" : "Mint as NFT"}
            </button>
          ) : (
            <button onClick={connect}>Connect Wallet to Mint</button>
          )}
          <button onClick={onPlayAgain} disabled={busy}>Play Again</button>
          <button onClick={onClose} disabled={busy}>Close</button>
        </div>
      )}
    </div>
  );
}
