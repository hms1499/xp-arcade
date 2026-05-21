"use client";
import { useState, useEffect } from "react";
import { useWallet } from "@/state/wallet";
import { mintScoreForGame, getMintsRemaining } from "@/lib/contract-calls";
import { useMintTx } from "@/state/mint-tx";
import { type TxStatus } from "@/lib/tx-tracker";
import { recordScore } from "@/lib/high-score";
import { GAMES, type GameId } from "@/lib/game-registry";

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

export function SharedMintDialog({
  gameId,
  score,
  onClose,
  onPlayAgain,
}: {
  gameId: GameId;
  score: number;
  onClose: () => void;
  onPlayAgain: () => void;
}) {
  const game = GAMES[gameId];
  const address = useWallet((s) => s.address);
  const connect = useWallet((s) => s.connect);
  const mintStatus = useMintTx((s) => s.status);
  const startMintTx = useMintTx((s) => s.start);
  const [busy, setBusy] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);
  const defaultName = address ? address.slice(-8) : "anon";
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mintsRemaining, setMintsRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!address) return;
    getMintsRemaining(gameId, address)
      .then(setMintsRemaining)
      .catch(() => setMintsRemaining(null));
  }, [address, gameId]);

  const [hs] = useState(() =>
    gameId === "snake"
      ? recordScore(score)
      : { isNewRecord: false, best: score }
  );

  const feeStx = (Number(game.mintFeeUstx) / 1_000_000).toFixed(2);
  const chain = process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";

  async function handleMint() {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const tx = await mintScoreForGame(
        gameId,
        score,
        name || defaultName,
        address,
      );
      setTxId(tx);
      startMintTx(gameId, tx, score);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Mint failed";
      if (msg.includes("108") || msg.toLowerCase().includes("mint-limit")) {
        setError("Mint limit reached for this season (10/10).");
      } else if (
        msg.includes("104") ||
        msg.toLowerCase().includes("score-too-high")
      ) {
        setError(
          "Score rejected by contract (too high). Please play a normal game.",
        );
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  const stxExplorerBase = "https://explorer.hiro.so/txid";

  return (
    <div className="text-sm mint-dialog-enter">
      <p className="mb-3">
        ⚠️ <b>Game Over</b> — Score: <b>{score}</b>
        <span className="block text-xs mt-1">
          {hs.isNewRecord ? (
            <b style={{ color: "#007700" }}>🏅 New personal best!</b>
          ) : (
            <span className="text-gray-500">
              Personal best: <b>{hs.best}</b>
            </span>
          )}
        </span>
        <span className="block text-xs text-gray-500 mt-1">
          Minting costs <b>{feeStx} STX</b> and records your score on-chain forever.
        </span>
        {mintsRemaining !== null && (
          <span
            className="block text-xs mt-1"
            style={{ color: mintsRemaining === 0 ? "#cc0000" : "#555" }}
          >
            {mintsRemaining === 0
              ? "⛔ Mint limit reached for this season (10/10)"
              : `🎟️ ${mintsRemaining} mint${mintsRemaining === 1 ? "" : "s"} remaining this season`}
          </span>
        )}
      </p>

      {!address ? (
        <div>
          <p className="text-xs mb-2 text-gray-500">
            Connect a wallet to mint your score as an NFT.
          </p>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={connect}>Connect Wallet</button>
            <button onClick={onPlayAgain}>Play Again</button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      ) : !txId ? (
        <div>
          <div className="mb-2">
            <label className="block text-xs mb-1">Player name (optional)</label>
            <input
              type="text"
              maxLength={24}
              value={name}
              placeholder={defaultName}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs"
            />
          </div>
          {error && (
            <p className="text-xs text-red-600 mb-2">⚠️ {error}</p>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={handleMint} disabled={busy || mintsRemaining === 0}>
              {busy
                ? "Opening wallet…"
                : mintsRemaining === 0
                ? "Limit reached"
                : `Mint for ${feeStx} STX`}
            </button>
            <button onClick={onPlayAgain}>Play Again</button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      ) : (
        <div>
          <p
            className="text-xs mb-2"
            style={{ color: STATUS_COLOR[mintStatus] }}
          >
            {STATUS_LABEL[mintStatus]}
          </p>
          {txId && (
            <p className="text-xs mb-2">
              <a
                href={`${stxExplorerBase}/${txId}?chain=${chain}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                View on Explorer ↗
              </a>
            </p>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onPlayAgain}>Play Again</button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
