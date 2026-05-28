import { describe, it, expect } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const w = (n: number) => accounts.get(`wallet_${n}`)!;
const C = "xp-arcade-v3";

describe("scaffold", () => {
  it("deploys and exposes the deployer as contract-owner", () => {
    const owner = simnet.callReadOnlyFn(C, "get-contract-owner", [], deployer).result;
    expect(owner).toBePrincipal(deployer);
  });

  it("starts with last-token-id = 0", () => {
    const last = simnet.callReadOnlyFn(C, "get-last-token-id", [], deployer).result;
    expect(last).toBeOk(Cl.uint(0));
  });
});

describe("register-game", () => {
  it("owner registers a game and get-game returns its config", () => {
    const r = simnet.callPublicFn(
      C, "register-game",
      [Cl.uint(1), Cl.stringAscii("Snake"), Cl.uint(10000), Cl.uint(50), Cl.uint(150), Cl.uint(300)],
      deployer
    ).result;
    expect(r).toBeOk(Cl.bool(true));

    const g = simnet.callReadOnlyFn(C, "get-game", [Cl.uint(1)], deployer).result;
    expect(g).toBeSome(Cl.tuple({
      name: Cl.stringAscii("Snake"),
      fee: Cl.uint(10000),
      active: Cl.bool(true),
      "rare-min": Cl.uint(50),
      "epic-min": Cl.uint(150),
      "legend-min": Cl.uint(300),
    }));

    const season = simnet.callReadOnlyFn(C, "get-current-season", [Cl.uint(1)], deployer).result;
    expect(season).toBeUint(1);
  });

  it("rejects non-owner", () => {
    const r = simnet.callPublicFn(
      C, "register-game",
      [Cl.uint(2), Cl.stringAscii("Tetris"), Cl.uint(20000), Cl.uint(100), Cl.uint(300), Cl.uint(700)],
      w(1)
    ).result;
    expect(r).toBeErr(Cl.uint(100)); // ERR-NOT-OWNER
  });

  it("rejects duplicate game-id", () => {
    simnet.callPublicFn(C, "register-game",
      [Cl.uint(1), Cl.stringAscii("Snake"), Cl.uint(10000), Cl.uint(50), Cl.uint(150), Cl.uint(300)], deployer);
    const r = simnet.callPublicFn(C, "register-game",
      [Cl.uint(1), Cl.stringAscii("Dup"), Cl.uint(10000), Cl.uint(50), Cl.uint(150), Cl.uint(300)], deployer).result;
    expect(r).toBeErr(Cl.uint(109)); // ERR-GAME-EXISTS
  });

  it("rejects zero fee", () => {
    const r = simnet.callPublicFn(C, "register-game",
      [Cl.uint(3), Cl.stringAscii("Free"), Cl.uint(0), Cl.uint(50), Cl.uint(150), Cl.uint(300)], deployer).result;
    expect(r).toBeErr(Cl.uint(111)); // ERR-BAD-FEE
  });
});
