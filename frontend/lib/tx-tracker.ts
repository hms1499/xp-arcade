"use client";
import { stacks } from "./stacks";

export type TxStatus =
  | "pending"
  | "success"
  | "abort_by_response"
  | "abort_by_post_condition"
  | "failed";

const KNOWN: ReadonlySet<string> = new Set([
  "pending",
  "success",
  "abort_by_response",
  "abort_by_post_condition",
]);

export async function pollTxStatus(txId: string): Promise<TxStatus> {
  const base = stacks.network.client?.baseUrl ?? "https://api.hiro.so";
  const res = await fetch(`${base}/extended/v1/tx/${txId}`);
  if (!res.ok) return "pending";
  const data = await res.json();
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
  intervalMs = 5000,
): () => void {
  let stopped = false;

  async function check() {
    if (stopped) return;
    const status = await pollTxStatus(txId).catch(() => "pending" as TxStatus);
    if (stopped) return;
    onUpdate(status);
    if (status === "pending") {
      setTimeout(check, intervalMs);
    }
  }

  check();
  return () => { stopped = true; };
}
