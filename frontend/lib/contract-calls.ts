"use client";
import { openContractCall, request } from "@stacks/connect";
import {
  uintCV,
  stringAsciiCV,
  principalCV,
  cvToValue,
  fetchCallReadOnlyFunction,
  Pc,
  makeUnsignedSTXTokenTransfer,
  deserializeTransaction,
  broadcastTransaction,
} from "@stacks/transactions";
import { stacks } from "./stacks";
import { unwrap } from "./cv-unwrap";
import { GAMES, type GameId } from "./game-registry";

const MINT_FEE_USTX = BigInt(10_000);

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
      functionArgs: [uintCV(score), stringAsciiCV(playerName.slice(0, 24))],
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
    functionArgs: [],
    senderAddress: GAMES[gameId].contractAddress,
  });
  const v = unwrap<Array<{ player: string; score: string }>>(cvToValue(res));
  return v.map((e) => ({ player: String(e.player), score: Number(e.score) }));
}

export async function getBestScoreForGame(gameId: GameId, addr: string) {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-best-score",
    functionArgs: [principalCV(addr)],
    senderAddress: addr,
  });
  const v = unwrap<null | { score: string; "token-id": string }>(cvToValue(res));
  return v ? { score: Number(v.score), tokenId: Number(v["token-id"]) } : null;
}

export async function getLastTokenIdForGame(gameId: GameId): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-last-token-id",
    functionArgs: [],
    senderAddress: GAMES[gameId].contractAddress,
  });
  return Number(unwrap(cvToValue(res)));
}

export async function getMintsRemaining(
  gameId: GameId,
  player: string,
): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-mints-remaining",
    functionArgs: [principalCV(player)],
    senderAddress: player,
  });
  return Number(unwrap(cvToValue(res)));
}

export async function getCurrentSeasonForGame(gameId: GameId): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-current-season",
    functionArgs: [],
    senderAddress: GAMES[gameId].contractAddress,
  });
  return Number(unwrap(cvToValue(res)));
}

export async function getPrizePoolBalanceForGame(gameId: GameId): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...gameBase(gameId),
    functionName: "get-prize-pool-balance",
    functionArgs: [],
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
    functionArgs: [uintCV(season)],
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
    functionArgs: [principalCV(player), uintCV(season)],
    senderAddress: player,
  });
  return Boolean(cvToValue(res));
}

export async function endSeasonForGame(gameId: GameId): Promise<string> {
  return new Promise((resolve, reject) => {
    openContractCall({
      ...gameBase(gameId),
      functionName: "end-season",
      functionArgs: [],
      onFinish: (data) => resolve(data.txId),
      onCancel: () => reject(new Error("cancelled")),
    });
  });
}

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

export async function getCurrentSeason(): Promise<number> {
  const res = await fetchCallReadOnlyFunction({
    ...base,
    functionName: "get-current-season",
    functionArgs: [],
    senderAddress: stacks.contractAddress,
  });
  return Number(unwrap(cvToValue(res)));
}

export async function endSeason(): Promise<string> {
  return new Promise((resolve, reject) => {
    openContractCall({
      ...base,
      functionName: "end-season",
      functionArgs: [],
      onFinish: (data) => resolve(data.txId),
      onCancel: () => reject(new Error("cancelled")),
    });
  });
}

export async function transferStx(
  recipient: string,
  amountUstx: number,
  memo?: string,
): Promise<string> {
  // Xverse rejects stx_transferStx with a spurious "network mismatch" error
  // (even on mainnet with a fresh session). stx_callContract works in the
  // same session, so the bug is specific to stx_transferStx. Workaround:
  // build the STX transfer transaction client-side and have the wallet
  // sign+broadcast it via stx_signTransaction.
  const addrResult = await request("stx_getAddresses");
  const stxEntry = addrResult.addresses.find(
    (a) => a.address.startsWith("SP") || a.address.startsWith("ST"),
  );
  if (!stxEntry?.publicKey) {
    throw new Error("STX public key unavailable; reconnect wallet");
  }
  const unsignedTx = await makeUnsignedSTXTokenTransfer({
    recipient,
    amount: BigInt(amountUstx),
    memo: memo ?? "",
    publicKey: stxEntry.publicKey,
    network: stacks.network,
  });
  const txHex = unsignedTx.serialize();
  let result: { txid?: string; transaction: string };
  try {
    result = await request("stx_signTransaction", { transaction: txHex });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/cancel|reject|denied/i.test(msg)) throw new Error("cancelled");
    throw err;
  }
  // Xverse's stx_signTransaction signs but does not broadcast — broadcast
  // the signed transaction ourselves.
  if (result.txid) return result.txid;
  if (!result.transaction) throw new Error("wallet returned no transaction");
  const signedTx = deserializeTransaction(result.transaction);
  const broadcast = await broadcastTransaction({
    transaction: signedTx,
    network: stacks.network,
  });
  const rejected = broadcast as { error?: string; reason?: string };
  if (rejected.error) {
    throw new Error(`Broadcast rejected: ${rejected.reason ?? rejected.error}`);
  }
  if (!broadcast.txid) throw new Error("broadcast returned no txid");
  return broadcast.txid;
}

// Rank-based payout (mirrors the on-chain formula): top 1-3 get 20% each, rank 4-10 get 4/70 each.
// Used by Season Admin for owner-initiated STX transfers.
export function computePayoutUstx(total: number, rank: number): number {
  if (rank <= 3) return Math.floor((total * 20) / 100);
  return Math.floor((total * 4) / 70);
}
