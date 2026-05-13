import { describe, it, expect } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const wallet1 = accounts.get("wallet_1")!;

describe("mint-score", () => {
  it("mints an NFT with correct score data to caller", () => {
    const { result } = simnet.callPublicFn(
      "snake-score",
      "mint-score",
      [Cl.uint(42), Cl.stringAscii("alice")],
      wallet1
    );
    expect(result).toBeOk(Cl.uint(1));

    const owner = simnet.callReadOnlyFn(
      "snake-score",
      "get-owner",
      [Cl.uint(1)],
      wallet1
    ).result;
    expect(owner).toBeOk(Cl.some(Cl.principal(wallet1)));

    const data = simnet.callReadOnlyFn(
      "snake-score",
      "get-score-data",
      [Cl.uint(1)],
      wallet1
    ).result;
    expect(data).toBeSome(
      Cl.tuple({
        player: Cl.principal(wallet1),
        score: Cl.uint(42),
        "player-name": Cl.stringAscii("alice"),
        block: Cl.uint(simnet.blockHeight),
        season: Cl.uint(1),
      })
    );
  });
});
