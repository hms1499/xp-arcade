"use client";
import { useState, useEffect, type CSSProperties } from "react";
import { useWallet } from "@/state/wallet";
import {
  mintScoreForGame,
  getMintsRemaining,
  getTopTenForGame,
} from "@/lib/contract-calls";
import { useMintTx } from "@/state/mint-tx";
import { type TxStatus } from "@/lib/tx-tracker";
import { recordScore } from "@/lib/high-score";
import { GAMES, type GameId } from "@/lib/game-registry";
import { useWindows } from "@/state/window-manager";
import { stacks } from "@/lib/stacks";
import {
  scoreRiskColor,
  scoreRiskLabel,
  type ScoreRiskReport,
} from "@/lib/score-risk";
import { ShareScoreCard } from "@/components/shared/ShareScoreCard";
import {
  leaderboardGoal,
  type LeaderboardGoal,
} from "@/lib/leaderboard-showcase";
import { resolveMintedTokenId } from "@/lib/share";

const STATUS_LABEL: Record<TxStatus, string> = {
  pending: "Submitted · confirming on-chain",
  success: "Confirmed · NFT minted",
  abort_by_response: "Failed · contract rejected",
  abort_by_post_condition: "Failed · post-condition blocked",
  failed: "Failed · transaction rejected",
  timeout: "Confirmation delayed · check Explorer",
};

const STATUS_COLOR: Record<TxStatus, string> = {
  pending: "#888",
  success: "#007700",
  abort_by_response: "#cc0000",
  abort_by_post_condition: "#cc0000",
  failed: "#cc0000",
  timeout: "#9a6700",
};

const ACTION_ROW: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  alignItems: "center",
};

const PRIMARY_ACTION: CSSProperties = {
  fontWeight: "bold",
  minWidth: 92,
  boxShadow: "inset -1px -1px #0a0a0a, inset 1px 1px #ffffff",
};

const SECONDARY_ACTION: CSSProperties = {
  minWidth: 92,
};

const TERTIARY_ACTION: CSSProperties = {
  color: "#555",
};

export function SharedMintDialog({
  gameId,
  score,
  isTopScore = false,
  riskReport,
  onClose,
  onPlayAgain,
}: {
  gameId: GameId;
  score: number;
  isTopScore?: boolean;
  riskReport?: ScoreRiskReport;
  onClose: () => void;
  onPlayAgain: () => void;
}) {
  const game = GAMES[gameId];
  const address = useWallet((s) => s.address);
  const connect = useWallet((s) => s.connect);
  const mintStatus = useMintTx((s) => s.status);
  const startMintTx = useMintTx((s) => s.start);
  const openWindow = useWindows((s) => s.open);
  const [busy, setBusy] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);
  const defaultName = address ? address.slice(-8) : "anon";
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mintsRemaining, setMintsRemaining] = useState<number | null>(null);
  const [goal, setGoal] = useState<LeaderboardGoal | null>(null);

  useEffect(() => {
    if (!address) return;
    getMintsRemaining(gameId, address)
      .then(setMintsRemaining)
      .catch(() => setMintsRemaining(null));
  }, [address, gameId]);

  useEffect(() => {
    let cancelled = false;
    getTopTenForGame(gameId)
      .then((rows) => {
        if (cancelled) return;
        setGoal(leaderboardGoal({ rows, score }));
      })
      .catch(() => {
        if (!cancelled) {
          setGoal({
            tone: "info",
            primary: "Mint as a collectible score NFT.",
            secondary: "Leaderboard cutoff could not be checked right now.",
            topTenReady: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, score]);

  const [mintedTokenId, setMintedTokenId] = useState<number | null>(null);

  useEffect(() => {
    if (mintStatus !== "success" || !txId) return;
    let cancelled = false;
    resolveMintedTokenId(txId, gameId).then((id) => {
      if (!cancelled && id) setMintedTokenId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [mintStatus, txId, gameId]);

  const [hs] = useState(() => recordScore(gameId, score));

  const feeStx = (Number(game.mintFeeUstx) / 1_000_000).toFixed(2);
  const chain = stacks.networkName;
  const isMintDisabled = busy || mintsRemaining === 0;
  const canEnterLeaderboard = goal?.topTenReady === true;
  const mintButtonLabel = busy
    ? "Opening wallet..."
    : mintsRemaining === 0
    ? "Limit reached"
    : canEnterLeaderboard
    ? `Mint & enter board · ${feeStx} STX`
    : `Mint score NFT · ${feeStx} STX`;

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
      setMintedTokenId(null);
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
      {isTopScore && (
        <div
          className="mb-2 text-center"
          style={{
            background: "linear-gradient(90deg,#fff4b0,#ffd86b,#fff4b0)",
            border: "1px solid #c79a2e",
            color: "#7a5c00",
            fontWeight: "bold",
            padding: "4px 6px",
            fontSize: 12,
            letterSpacing: 0.5,
          }}
        >
          🏆 NEW HIGH SCORE — top-10 on this season&apos;s leaderboard!
        </div>
      )}
      <p className="mb-2">
        <b>Game Over</b> - Score: <b>{score}</b>
        <span className="block text-xs mt-1">
          {hs.isNewRecord ? (
            <b style={{ color: "#007700" }}>New personal best</b>
          ) : (
            <span className="text-gray-500">
              Personal best: <b>{hs.best}</b>
            </span>
          )}
        </span>
      </p>

      <div
        className="mb-3 text-xs"
        style={{
          background: "#f5f5f0",
          border: "1px solid #d0d0c8",
          padding: "5px 6px",
          lineHeight: 1.35,
        }}
      >
        <b>Play again is free.</b>{" "}
        {goal ? goal.primary : "Mint only if you want this exact score saved as an NFT."}
        <span className="block text-gray-500 mt-1">
          Mint cost: <b>{feeStx} STX</b>. Scores are public on-chain.
        </span>
        {mintsRemaining !== null && (
          <span
            className="block text-xs mt-1"
            style={{ color: mintsRemaining === 0 ? "#cc0000" : "#555" }}
          >
            {mintsRemaining === 0
              ? "Mint limit reached for this season (10/10)"
              : `${mintsRemaining} mint${mintsRemaining === 1 ? "" : "s"} remaining this season`}
          </span>
        )}
        {goal && (
          <span
            className="block mt-2"
            style={{
              color:
                goal.tone === "success"
                  ? "#007700"
                  : goal.tone === "warning"
                  ? "#8a5a00"
                  : "#555",
              fontWeight: goal.tone === "success" ? "bold" : "normal",
            }}
          >
            {goal.secondary}
          </span>
        )}
        {riskReport && riskReport.level !== "low" && (
          <span
            className="block mt-2"
            style={{
              color: scoreRiskColor(riskReport.level),
              fontWeight: "bold",
            }}
          >
            {scoreRiskLabel(riskReport)}: {riskReport.reasons[0]}
          </span>
        )}
        {riskReport?.durationSeconds != null && (
          <span className="block text-[10px] text-gray-500 mt-1">
            Session length: {riskReport.durationSeconds}s
          </span>
        )}
      </div>

      {!address ? (
        <div>
          <p className="text-xs mb-2 text-gray-500">
            Connect a wallet only when you are ready to mint this score.
          </p>
          <div style={ACTION_ROW}>
            <button onClick={onPlayAgain} style={PRIMARY_ACTION}>
              Play Again
            </button>
            <button onClick={connect} style={SECONDARY_ACTION}>
              Connect to Mint
            </button>
            <button onClick={onClose} style={TERTIARY_ACTION}>
              Close
            </button>
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
          <p className="text-[10px] text-gray-500 mb-2">
            Wallet confirmation should show an exact {feeStx} STX transfer.
          </p>
          <div style={ACTION_ROW}>
            <button onClick={onPlayAgain} style={PRIMARY_ACTION}>
              Play Again
            </button>
            <button
              onClick={handleMint}
              disabled={isMintDisabled}
              style={{
                ...SECONDARY_ACTION,
                fontWeight: isTopScore ? "bold" : "normal",
              }}
            >
              {mintButtonLabel}
            </button>
            <button onClick={onClose} style={TERTIARY_ACTION}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <div>
          <ol className="text-xs mb-2" style={{ color: "#555", lineHeight: 1.7 }}>
            <li>1. Submitted to wallet</li>
            <li style={{ color: STATUS_COLOR[mintStatus] }}>
              2. {STATUS_LABEL[mintStatus]}
            </li>
          </ol>
          {mintStatus === "success" && (
            <div
              className="text-xs mb-2"
              style={{
                background: "#f0fff4",
                border: "1px solid #8bc48b",
                color: "#155724",
                padding: "5px 6px",
                lineHeight: 1.35,
              }}
            >
              <b>{game.label} NFT confirmed.</b>
              <span className="block mt-1">
                It can take a few seconds for the indexer to show the NFT in
                My NFTs.
              </span>
            </div>
          )}
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
          <div style={ACTION_ROW}>
            <button onClick={onPlayAgain} style={PRIMARY_ACTION}>
              Play Again
            </button>
            {mintStatus === "success" && (
              <button
                onClick={() => openWindow("mynfts", { initialGame: gameId })}
                style={SECONDARY_ACTION}
              >
                View {game.label} NFT
              </button>
            )}
            {mintStatus === "success" && canEnterLeaderboard && (
              <button
                onClick={() => openWindow("highscore", { initialTab: gameId })}
                style={SECONDARY_ACTION}
              >
                Open High Scores
              </button>
            )}
            <button onClick={onClose} style={TERTIARY_ACTION}>
              Close
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          borderTop: "1px solid #d0d0c8",
          marginTop: 10,
          paddingTop: 8,
        }}
      >
        <div className="text-xs mb-2" style={{ color: "#555" }}>
          Share or download this run
        </div>
        <ShareScoreCard
          gameId={gameId}
          score={score}
          player={address}
          rankHint={goal?.secondary}
          txId={txId}
          tokenId={mintedTokenId}
        />
      </div>
    </div>
  );
}
