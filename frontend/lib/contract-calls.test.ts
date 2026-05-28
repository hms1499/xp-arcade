import { describe, it, expect, vi, beforeEach } from "vitest";
import { uintCV, principalCV } from "@stacks/transactions";

const calls: any[] = [];
vi.mock("@stacks/connect", () => ({
  openContractCall: (opts: any) => { calls.push(opts); opts.onFinish?.({ txId: "mock-txid" }); },
  request: vi.fn(),
}));

const readCalls: any[] = [];
vi.mock("@stacks/transactions", async (orig) => {
  const actual = await (orig as any)();
  return {
    ...actual,
    fetchCallReadOnlyFunction: (opts: any) => {
      readCalls.push(opts);
      return Promise.resolve(actual.noneCV());
    },
  };
});

import {
  getBestScoreForGame,
  hasClaimedPrizeForGame,
  getTopTenForGame,
  claimPrizeV3,
  mintScoreForGame,
} from "./contract-calls";

const ADDR = "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";

beforeEach(() => { calls.length = 0; readCalls.length = 0; });

describe("contract-calls v3 arg shaping", () => {
  it("get-top-ten prepends the game-id", async () => {
    await getTopTenForGame("tetris").catch(() => {});
    expect(readCalls[0].functionName).toBe("get-top-ten");
    expect(readCalls[0].functionArgs).toEqual([uintCV(2)]);
    expect(readCalls[0].contractName).toBe("xp-arcade-v3");
  });

  it("get-best-score sends [game-id, player]", async () => {
    await getBestScoreForGame("snake", ADDR).catch(() => {});
    expect(readCalls[0].functionArgs).toEqual([uintCV(1), principalCV(ADDR)]);
  });

  it("has-claimed-prize sends [player, game-id, season] (player first)", async () => {
    await hasClaimedPrizeForGame("pacman", ADDR, 1).catch(() => {});
    expect(readCalls[0].functionArgs).toEqual([principalCV(ADDR), uintCV(3), uintCV(1)]);
  });

  it("mint-score sends [game-id, score, name]", async () => {
    await mintScoreForGame("snake", 42, "alice", ADDR).catch(() => {});
    expect(calls[0].functionName).toBe("mint-score");
    expect(calls[0].functionArgs[0]).toEqual(uintCV(1));
    expect(calls[0].functionArgs[1]).toEqual(uintCV(42));
  });

  it("claim-prize sends [game-id, season]", async () => {
    claimPrizeV3("breakout", 1, ADDR).catch(() => {});
    expect(calls[0].functionName).toBe("claim-prize");
    expect(calls[0].functionArgs).toEqual([uintCV(4), uintCV(1)]);
  });
});
