"use client";
import { useEffect, useState } from "react";
import { conversionPct, type EventCounts } from "@/lib/metrics-summary";

type Summary = {
  days: number;
  generatedAt: string;
  events: Record<string, EventCounts>;
};

const FMT = new Intl.NumberFormat("en-US");

function n(e: Record<string, EventCounts>, k: string): number {
  return e[k]?.total ?? 0;
}

type Result = { days: number; data: Summary | null; error: string | null };

export default function MetricsPage() {
  const [days, setDays] = useState(7);
  const [result, setResult] = useState<Result>({ days: 7, data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/metrics/summary?days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Summary) => !cancelled && setResult({ days, data: d, error: null }))
      .catch((e) => !cancelled && setResult({ days, data: null, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [days]);

  // Only trust the result if it matches the currently-selected range; a stale
  // result (or none yet) reads as "loading", which also clears a prior error
  // when the range changes — without a synchronous setState in the effect.
  const fresh = result.days === days;
  const data = fresh ? result.data : null;
  const error = fresh ? result.error : null;

  const e = data?.events ?? {};
  const played = n(e, "game_over");
  const attempted = n(e, "mint_attempted");
  const confirmed = n(e, "mint_confirmed");
  const failed = n(e, "mint_failed");

  return (
    <div className="window" style={{ maxWidth: 720, margin: "24px auto" }}>
      <div className="title-bar">
        <div className="title-bar-text">Metrics — Product Funnel</div>
      </div>
      <div className="window-body">
        <div style={{ marginBottom: 12 }}>
          <label>
            Range:{" "}
            <select value={days} onChange={(ev) => setDays(Number(ev.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </label>
          {data && (
            <span style={{ marginLeft: 12, color: "#555" }}>
              as of {new Date(data.generatedAt).toLocaleString()}
            </span>
          )}
        </div>

        {error && <p style={{ color: "red" }}>Failed to load: {error}</p>}
        {!data && !error && <p>Loading…</p>}

        {data && (
          <>
            <fieldset>
              <legend>Money funnel</legend>
              <table style={{ width: "100%" }}>
                <tbody>
                  <tr><td>Played (game_over)</td><td align="right">{FMT.format(played)}</td></tr>
                  <tr><td>Mint attempted</td><td align="right">{FMT.format(attempted)}</td></tr>
                  <tr><td>Mint confirmed</td><td align="right">{FMT.format(confirmed)}</td></tr>
                  <tr><td>Mint failed</td><td align="right">{FMT.format(failed)}</td></tr>
                </tbody>
              </table>
              <p><b>Played → attempted:</b> {conversionPct(attempted, played)}%</p>
              <p><b>Attempted → confirmed:</b> {conversionPct(confirmed, attempted)}%</p>
            </fieldset>

            <fieldset style={{ marginTop: 12 }}>
              <legend>Claim funnel</legend>
              <table style={{ width: "100%" }}>
                <tbody>
                  <tr><td>Claim attempted</td><td align="right">{FMT.format(n(e, "claim_attempted"))}</td></tr>
                  <tr><td>Claim confirmed</td><td align="right">{FMT.format(n(e, "claim_confirmed"))}</td></tr>
                  <tr><td>Claim failed</td><td align="right">{FMT.format(n(e, "claim_failed"))}</td></tr>
                </tbody>
              </table>
            </fieldset>

            <fieldset style={{ marginTop: 12 }}>
              <legend>Errors</legend>
              <table style={{ width: "100%" }}>
                <tbody>
                  <tr><td>Wallet connect errors</td><td align="right">{FMT.format(n(e, "wallet_connect_error"))}</td></tr>
                  <tr><td>Tx confirmation timeouts</td><td align="right">{FMT.format(n(e, "tx_confirmation_timeout"))}</td></tr>
                  <tr><td>Holdings load failures</td><td align="right">{FMT.format(n(e, "holdings_total_failure"))}</td></tr>
                </tbody>
              </table>
            </fieldset>
          </>
        )}
      </div>
    </div>
  );
}
