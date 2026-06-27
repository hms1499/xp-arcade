"use client";
import { useEffect, useRef, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { useSwapTx } from "@/state/swap-tx";
import { useToasts } from "@/state/toasts";
import { stacks } from "@/lib/stacks";
import { getStxBalanceUstx } from "@/lib/wallet-safety";
import { getQuote, executeSwap, type SwapQuote } from "@/lib/swap";
import {
  tokensForDirection,
  flipDirection,
  type Direction,
} from "@/lib/swap-tokens";
import { fromBaseUnits, maxStxInput } from "@/lib/swap-math";
import { mapSwapError } from "@/lib/swap-errors";
import { Window } from "./Window";

const SLIPPAGE_CHOICES_BPS = [10, 50, 100];
const QUOTE_STALE_MS = 30_000;

export function SwapWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "swap"));
  const address = useWallet((s) => s.address);
  const connect = useWallet((s) => s.connect);
  const startSwapTx = useSwapTx((s) => s.start);
  const pushToast = useToasts((s) => s.push);

  const [direction, setDirection] = useState<Direction>("stx-to-sbtc");
  const [amountStr, setAmountStr] = useState("");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [slippageBps, setSlippageBps] = useState(50);
  const [balanceUstx, setBalanceUstx] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { tokenX, tokenY } = tokensForDirection(direction);
  const amount = Number(amountStr);
  const amountValid = Number.isFinite(amount) && amount > 0;

  // Load STX balance when connected (used for the Max button on the STX side).
  useEffect(() => {
    if (!address) return;
    let alive = true;
    getStxBalanceUstx(address).then((b) => { if (alive) setBalanceUstx(b); });
    return () => { alive = false; };
  }, [address]);

  // Debounced quote fetch on amount/direction change.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuote(null);
    if (!amountValid) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoadingQuote(true);
      try {
        const q = await getQuote(direction, amount);
        setQuote(q);
      } catch (e) {
        const msg = mapSwapError(e);
        if (msg) pushToast({ title: "Quote failed", body: msg, type: "error" });
      } finally {
        setLoadingQuote(false);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, direction, amountValid]);

  if (!w) return null;

  const onMainnet = stacks.networkName === "mainnet";
  // eslint-disable-next-line react-hooks/purity
  const quoteStale = quote != null && Date.now() - quote.ts > QUOTE_STALE_MS;
  const canSwap = onMainnet && !!address && amountValid && !!quote && !quoteStale && !submitting;

  function onMax() {
    if (direction === "stx-to-sbtc" && balanceUstx != null) {
      setAmountStr(String(fromBaseUnits(maxStxInput(balanceUstx), tokenX.decimals)));
    }
  }

  async function onSwap() {
    if (!quote || !address) return;
    setSubmitting(true);
    try {
      await executeSwap(quote, amount, address, slippageBps, {
        onSuccess: (txId) => startSwapTx(txId, `Swapped ${amount} ${tokenX.symbol} → ${tokenY.symbol}`),
        onCancel: () => {},
      });
    } catch (e) {
      const msg = mapSwapError(e);
      if (msg) pushToast({ title: "Swap failed", body: msg, type: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Window id={w.id} title="Swap">
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8, minWidth: 280 }}>
        {!onMainnet ? (
          <p>Swap is only available on mainnet.</p>
        ) : !address ? (
          <div style={{ display: "grid", gap: 8 }}>
            <p>Connect your wallet to swap STX and sBTC.</p>
            <button className="default" onClick={() => connect()}>Connect wallet</button>
          </div>
        ) : (
          <>
            <label style={{ display: "grid", gap: 2 }}>
              <span>From ({tokenX.symbol})</span>
              <span style={{ display: "flex", gap: 4 }}>
                <input
                  type="number"
                  min="0"
                  value={amountStr}
                  placeholder="0.0"
                  onChange={(e) => setAmountStr(e.target.value)}
                  style={{ flex: 1 }}
                  aria-label={`Amount of ${tokenX.symbol} to swap`}
                />
                {direction === "stx-to-sbtc" && (
                  <button onClick={onMax} disabled={balanceUstx == null}>Max</button>
                )}
              </span>
            </label>

            <button
              aria-label="Switch direction"
              onClick={() => { setDirection(flipDirection(direction)); setAmountStr(""); setQuote(null); }}
              style={{ justifySelf: "center" }}
            >
              ⇅
            </button>

            <label style={{ display: "grid", gap: 2 }}>
              <span>To ({tokenY.symbol})</span>
              <input
                type="text"
                readOnly
                value={quote ? String(quote.amountOut) : loadingQuote ? "…" : ""}
                aria-label={`Estimated ${tokenY.symbol} received`}
              />
            </label>

            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span>Slippage:</span>
              {SLIPPAGE_CHOICES_BPS.map((bps) => (
                <button
                  key={bps}
                  onClick={() => setSlippageBps(bps)}
                  aria-pressed={slippageBps === bps}
                  style={{ fontWeight: slippageBps === bps ? "bold" : "normal" }}
                >
                  {bps / 100}%
                </button>
              ))}
            </div>

            {quote && (
              <p style={{ fontSize: 11, color: "#333" }}>
                Rate: 1 {tokenX.symbol} ≈ {quote.rate.toPrecision(6)} {tokenY.symbol}
                {quoteStale && " · quote expired, edit amount to refresh"}
              </p>
            )}

            <button className="default" onClick={onSwap} disabled={!canSwap}>
              {submitting ? "Confirm in wallet…" : "Swap"}
            </button>
          </>
        )}
      </div>
    </Window>
  );
}
