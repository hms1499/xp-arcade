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
import { unwrap } from "./cv-unwrap";
import { GAMES, onchainIdFor, type GameId } from "./game-registry";

const base = {
  network: stacks.network,
  contractAddress: stacks.contractAddress,
  contractName: stacks.contractName,
} as const;

function gameBase(gameId: GameId) {
  const g = GAMES[gameId];
  return {
    network: stacks.network,
    contractAddress: g.contractAddress,
    contractName: g.contractName,
  };
}

export async function mintScoreForGame(
  gameId: GameId,
  score: number,
  playerName: string,
  senderAddress: string,
): Promise<string> {
  const g = GAMES[gameId];
  return new Promise((resolve, reject) => {
    openContractCall({
      ...gameBase(gameId),
      functionName: "mint-score",
      functionArgs: [uintCV(onchainIdFor(gameId)), uintCV(score), stringAsciiCV(playerName.slice(0, 24))],
      postConditions: [Pc.principal(senderAddress).willSendEq(g.mintFeeUstx).ustx()],
      onFinish: (data) => resolve(data.txId),
      onCancel: () => reject(new Error("cancelled")),
    });
  });
}

export async function getTopTenForGame(gameId: GameId): Promise<TopEntry[]> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-top-ten",
    functionArgs: [uintCV(onchainIdFor(gameId))],
    senderAddress: GAMES[gameId].contractAddress,
  });
  const v = unwrap<Array<{ player: string; score: string }>>(cvToValue(res));
  return v.map((e) => ({ player: String(e.player), score: Number(e.score) }));
}

export async function getBestScoreForGame(gameId: GameId, addr: string) {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-best-score",
    functionArgs: [uintCV(onchainIdFor(gameId)), principalCV(addr)],
    senderAddress: addr,
  });
  const v = unwrap<null | { score: string; "token-id": string }>(cvToValue(res));
  return v ? { score: Number(v.score), tokenId: Number(v["token-id"]) } : null;
}

export async function getMintsRemaining(
  gameId: GameId,
  player: string,
): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-mints-remaining",
    functionArgs: [uintCV(onchainIdFor(gameId)), principalCV(player)],
    senderAddress: player,
  });
  return Number(unwrap(cvToValue(res)));
}

export async function getCurrentSeasonForGame(gameId: GameId): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-current-season",
    functionArgs: [uintCV(onchainIdFor(gameId))],
    senderAddress: GAMES[gameId].contractAddress,
  });
  return Number(unwrap(cvToValue(res)));
}

export async function getPrizePoolBalanceForGame(gameId: GameId): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-prize-pool-balance",
    functionArgs: [uintCV(onchainIdFor(gameId))],
    senderAddress: GAMES[gameId].contractAddress,
  });
  return Number(unwrap(cvToValue(res)));
}

export async function getSeasonPrizeForGame(
  gameId: GameId,
  season: number,
): Promise<SeasonPrize> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-season-prize",
    functionArgs: [uintCV(onchainIdFor(gameId)), uintCV(season)],
    senderAddress: GAMES[gameId].contractAddress,
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

export async function hasClaimedPrizeForGame(
  gameId: GameId,
  player: string,
  season: number,
): Promise<boolean> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "has-claimed-prize",
    functionArgs: [principalCV(player), uintCV(onchainIdFor(gameId)), uintCV(season)],
    senderAddress: player,
  });
  return Boolean(cvToValue(res));
}

export async function endSeasonForGame(gameId: GameId): Promise<string> {
  return new Promise((resolve, reject) => {
    openContractCall({
      ...gameBase(gameId),
      functionName: "end-season",
      functionArgs: [uintCV(onchainIdFor(gameId))],
      onFinish: (data) => resolve(data.txId),
      onCancel: () => reject(new Error("cancelled")),
    });
  });
}

export async function claimPrizeV3(
  gameId: GameId, season: number, payoutUstx: number,
): Promise<string> {
  const g = GAMES[gameId];
  const contractId = `${g.contractAddress}.${g.contractName}`;
  return new Promise((resolve, reject) => {
    openContractCall({
      ...gameBase(gameId),
      functionName: "claim-prize",
      functionArgs: [uintCV(onchainIdFor(gameId)), uintCV(season)],
      // The contract pays the caller via as-contract; wallets in deny-mode
      // need a post-condition allowing the CONTRACT to send STX. The on-chain
      // payout is capped to the remaining pool, so it is always <= our
      // estimate -> willSendLte is the correct (never under-permitting) bound.
      postConditions: [Pc.principal(contractId).willSendLte(payoutUstx).ustx()],
      onFinish: (data) => resolve(data.txId),
      onCancel: () => reject(new Error("cancelled")),
    });
  });
}

export type TopEntry = { player: string; score: number };

export async function getLastTokenId(): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...base,
    functionName: "get-last-token-id",
    functionArgs: [],
    senderAddress: stacks.contractAddress,
  });
  return Number(unwrap(cvToValue(res)));
}

export type SeasonPrize = {
  total: number;
  topTen: Array<{ player: string; score: number }>;
} | null;

// Rank-based payout (mirrors the on-chain formula): top 1-3 get 20% each, rank 4-10 get 4/70 each.
// Used by Season Admin for owner-initiated STX transfers.
export function computePayoutUstx(total: number, rank: number): number {
  if (rank <= 3) return Math.floor((total * 20) / 100);
  return Math.floor((total * 4) / 70);
}
