"use client";
import { stacks } from "./stacks";

export type TxStatus = "pending" | "success" | "abort_by_response" | "abort_by_post_condition";

export async function pollTxStatus(txId: string): Promise<TxStatus> {
  const base = stacks.network.client?.baseUrl ?? "https://api.hiro.so";
  const res = await fetch(`${base}/extended/v1/tx/${txId}`);
  if (!res.ok) return "pending";
  const data = await res.json();
  return (data.tx_status as TxStatus) ?? "pending";
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
