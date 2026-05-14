"use client";
import { openContractCall } from "@stacks/connect";
import {
  uintCV,
  stringAsciiCV,
  principalCV,
  cvToValue,
  fetchCallReadOnlyFunction,
} from "@stacks/transactions";
import { stacks } from "./stacks";

const base = {
  network: stacks.network,
  contractAddress: stacks.contractAddress,
  contractName: stacks.contractName,
} as const;

export async function mintScore(score: number, playerName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    openContractCall({
      ...base,
      functionName: "mint-score",
      functionArgs: [uintCV(score), stringAsciiCV(playerName.slice(0, 24))],
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
  const v = cvToValue(res) as Array<{ player: string; score: bigint | number }>;
  return v.map((e) => ({ player: String(e.player), score: Number(e.score) }));
}

export async function getBestScore(addr: string) {
  const res = await fetchCallReadOnlyFunction({
    ...base,
    functionName: "get-best-score",
    functionArgs: [principalCV(addr)],
    senderAddress: addr,
  });
  const v = cvToValue(res) as null | { score: bigint; "token-id": bigint };
  return v ? { score: Number(v.score), tokenId: Number(v["token-id"]) } : null;
}

export async function getLastTokenId(): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...base,
    functionName: "get-last-token-id",
    functionArgs: [],
    senderAddress: stacks.contractAddress,
  });
  return Number(cvToValue(res));
}

export async function getPrizePoolBalance(): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...base,
    functionName: "get-prize-pool-balance",
    functionArgs: [],
    senderAddress: stacks.contractAddress,
  });
  return Number(cvToValue(res));
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
  const v = cvToValue(res) as null | {
    total: bigint;
    "top-ten": Array<{ player: string; score: bigint }>;
  };
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
