"use client";
import { stacks } from "./stacks";
import { fetchJson } from "./http";

export type TxStatus =
  | "pending"
  | "success"
  | "abort_by_response"
  | "abort_by_post_condition"
  | "failed"
  | "timeout";

const KNOWN: ReadonlySet<string> = new Set([
  "pending",
  "success",
  "abort_by_response",
  "abort_by_post_condition",
]);

export async function pollTxStatus(txId: string): Promise<TxStatus> {
  const base = stacks.network.client?.baseUrl ?? "https://api.hiro.so";
  const data = await fetchJson<{ tx_status?: string }>(
    `${base}/extended/v1/tx/${txId}`,
  ).catch(() => null);
  if (!data) return "pending";
  const raw = data.tx_status as string | undefined;
  if (!raw) return "pending";
  if (KNOWN.has(raw)) return raw as TxStatus;
  // dropped_replace_by_fee, dropped_stale_garbage_collect, anything unknown:
  // treat as a terminal failure so the UI shows a clear label and polling stops.
  return "failed";
}

export function watchTx(
  txId: string,
  onUpdate: (status: TxStatus) => void,
  {
    initialIntervalMs = 5000,
    maxIntervalMs = 30_000,
    maxDurationMs = 20 * 60_000,
  }: {
    initialIntervalMs?: number;
    maxIntervalMs?: number;
    maxDurationMs?: number;
  } = {},
): () => void {
  let stopped = false;
  let intervalMs = initialIntervalMs;
  const startedAt = Date.now();

  async function check() {
    if (stopped) return;
    if (Date.now() - startedAt >= maxDurationMs) {
      onUpdate("timeout");
      stopped = true;
      return;
    }
    const status = await pollTxStatus(txId).catch(() => "pending" as TxStatus);
    if (stopped) return;
    onUpdate(status);
    if (status === "pending") {
      setTimeout(check, intervalMs);
      intervalMs = Math.min(intervalMs * 2, maxIntervalMs);
    }
  }

  check();
  return () => { stopped = true; };
}
