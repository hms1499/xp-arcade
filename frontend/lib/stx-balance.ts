"use client";
import { stacks } from "./stacks";

// Returns the address's available STX balance in µSTX (unlocked, ignoring locked stacking).
// Returns null on any failure so callers can render "—" without blocking the UI.
export async function getStxBalance(address: string): Promise<number | null> {
  const base = stacks.network.client?.baseUrl ?? "https://api.hiro.so";
  try {
    const res = await fetch(`${base}/extended/v1/address/${address}/balances`);
    if (!res.ok) return null;
    const data = (await res.json()) as { stx?: { balance?: string } };
    const raw = data.stx?.balance;
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
