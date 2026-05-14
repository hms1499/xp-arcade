"use client";
import { openContractCall } from "@stacks/connect";
import {
  uintCV,
  stringAsciiCV,
  principalCV,
  cvToValue,
  fetchCallReadOnlyFunction,
  Pc,
} from "@stacks/transactions";
import { stacks } from "./stacks";

const MINT_FEE_USTX = BigInt(10_000);

// @stacks/transactions v7 cvToValue returns nested {type, value} wrappers for
// tuples/lists/responses. Recursively strip them down to plain JS values.
export function unwrap<T = unknown>(v: unknown): T {
  if (v === null || v === undefined) return v as T;
  if (Array.isArray(v)) return v.map(unwrap) as unknown as T;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("type" in o && "value" in o) return unwrap(o.value);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) out[k] = unwrap(o[k]);
    return out as T;
  }
  return v as T;
}

const base = {
  network: stacks.network,
  contractAddress: stacks.contractAddress,
  contractName: stacks.contractName,
} as const;

export async function mintScore(
  score: number,
  playerName: string,
  senderAddress: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    openContractCall({
      ...base,
      functionName: "mint-score",
      functionArgs: [uintCV(score), stringAsciiCV(playerName.slice(0, 24))],
      postConditions: [Pc.principal(senderAddress).willSendEq(MINT_FEE_USTX).ustx()],
      onFinish: (data) => resolve(data.txId),
      onCancel: () => reject(new Error("cancelled")),
    });
  });
}

export async function claimTrophy(): Promise<string> {
  return new Promise((resolve, reject) => {
    openContractCall({
      ...base,
      functionName: "claim-trophy",
      functionArgs: [],
      onFinish: (data) => resolve(data.txId),
      onCancel: () => reject(new Error("cancelled")),
    });
  });
}

export type TopEntry = { player: string; score: number };

export async function getTopTen(): Promise<TopEntry[]> {
  const res = await fetchCallReadOnlyFunction({
    ...base,
    functionName: "get-top-ten",
    functionArgs: [],
    senderAddress: stacks.contractAddress,
  });
  const v = unwrap<Array<{ player: string; score: string }>>(cvToValue(res));
  return v.map((e) => ({ player: String(e.player), score: Number(e.score) }));
}

export async function getBestScore(addr: string) {
  const res = await fetchCallReadOnlyFunction({
    ...base,
    functionName: "get-best-score",
    functionArgs: [principalCV(addr)],
    senderAddress: addr,
  });
  const v = unwrap<null | { score: string; "token-id": string }>(cvToValue(res));
  return v ? { score: Number(v.score), tokenId: Number(v["token-id"]) } : null;
}

export async function getLastTokenId(): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...base,
    functionName: "get-last-token-id",
    functionArgs: [],
    senderAddress: stacks.contractAddress,
  });
  return Number(unwrap(cvToValue(res)));
}

export async function getPrizePoolBalance(): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...base,
    functionName: "get-prize-pool-balance",
    functionArgs: [],
    senderAddress: stacks.contractAddress,
  });
  return Number(unwrap(cvToValue(res)));
}

export type SeasonPrize = {
  total: number;
  topTen: Array<{ player: string; score: number }>;
} | null;

export async function getSeasonPrize(season: number): Promise<SeasonPrize> {
  const res = await fetchCallReadOnlyFunction({
    ...base,
    functionName: "get-season-prize",
    functionArgs: [uintCV(season)],
    senderAddress: stacks.contractAddress,
  });
  const v = unwrap<null | {
    total: string;
    "top-ten": Array<{ player: string; score: string }>;
  }>(cvToValue(res));
  if (!v) return null;
  return {
    total: Number(v.total),
    topTen: v["top-ten"].map((e) => ({ player: String(e.player), score: Number(e.score) })),
  };
}

export async function hasClaimedPrize(player: string, season: number): Promise<boolean> {
  const res = await fetchCallReadOnlyFunction({
    ...base,
    functionName: "has-claimed-prize",
    functionArgs: [principalCV(player), uintCV(season)],
    senderAddress: player,
  });
  return Boolean(cvToValue(res));
}

export async function claimPrize(season: number): Promise<string> {
  return new Promise((resolve, reject) => {
    openContractCall({
      ...base,
      functionName: "claim-prize",
      functionArgs: [uintCV(season)],
      onFinish: (data) => resolve(data.txId),
      onCancel: () => reject(new Error("cancelled")),
    });
  });
}
