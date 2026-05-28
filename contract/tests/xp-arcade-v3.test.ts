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

  it("get-game returns none for an unregistered id", () => {
    const g = simnet.callReadOnlyFn(C, "get-game", [Cl.uint(99)], deployer).result;
    expect(g).toBeNone();
  });

  it("get-current-season returns u0 sentinel for an unregistered id", () => {
    const season = simnet.callReadOnlyFn(C, "get-current-season", [Cl.uint(99)], deployer).result;
    expect(season).toBeUint(0);
  });
});

describe("set-game-active", () => {
  it("owner toggles a game inactive", () => {
    simnet.callPublicFn(C, "register-game",
      [Cl.uint(1), Cl.stringAscii("Snake"), Cl.uint(10000), Cl.uint(50), Cl.uint(150), Cl.uint(300)], deployer);
    const r = simnet.callPublicFn(C, "set-game-active", [Cl.uint(1), Cl.bool(false)], deployer).result;
    expect(r).toBeOk(Cl.bool(true));
    const g = simnet.callReadOnlyFn(C, "get-game", [Cl.uint(1)], deployer).result;
    expect(g).toBeSome(Cl.tuple({
      name: Cl.stringAscii("Snake"),
      fee: Cl.uint(10000),
      active: Cl.bool(false),
      "rare-min": Cl.uint(50),
      "epic-min": Cl.uint(150),
      "legend-min": Cl.uint(300),
    }));
  });

  it("rejects non-owner and unknown game", () => {
    simnet.callPublicFn(C, "register-game",
      [Cl.uint(1), Cl.stringAscii("Snake"), Cl.uint(10000), Cl.uint(50), Cl.uint(150), Cl.uint(300)], deployer);
    expect(simnet.callPublicFn(C, "set-game-active", [Cl.uint(1), Cl.bool(false)], w(1)).result)
      .toBeErr(Cl.uint(100)); // ERR-NOT-OWNER
    expect(simnet.callPublicFn(C, "set-game-active", [Cl.uint(99), Cl.bool(false)], deployer).result)
      .toBeErr(Cl.uint(110)); // ERR-NO-GAME
  });
});

function registerSnake() {
  simnet.callPublicFn(C, "register-game",
    [Cl.uint(1), Cl.stringAscii("Snake"), Cl.uint(10000), Cl.uint(50), Cl.uint(150), Cl.uint(300)], deployer);
}

describe("mint-score core", () => {
  it("mints an NFT with correct score-data and global token-id", () => {
    registerSnake();
    const r = simnet.callPublicFn(C, "mint-score",
      [Cl.uint(1), Cl.uint(42), Cl.stringAscii("alice")], w(1)).result;
    expect(r).toBeOk(Cl.uint(1));

    const owner = simnet.callReadOnlyFn(C, "get-owner", [Cl.uint(1)], w(1)).result;
    expect(owner).toBeOk(Cl.some(Cl.principal(w(1))));

    const data = simnet.callReadOnlyFn(C, "get-score-data", [Cl.uint(1)], w(1)).result;
    expect(data).toBeSome(Cl.tuple({
      "game-id": Cl.uint(1),
      player: Cl.principal(w(1)),
      score: Cl.uint(42),
      "player-name": Cl.stringAscii("alice"),
      block: Cl.uint(simnet.blockHeight),
      season: Cl.uint(1),
      rarity: Cl.stringAscii("Common"),
    }));
  });

  it("routes the mint fee into the contract pool (as-contract)", () => {
    registerSnake();
    const contractId = `${deployer}.${C}`;
    const before = simnet.getAssetsMap().get("STX")?.get(contractId) ?? 0n;
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(42), Cl.stringAscii("a")], w(1));
    // Accounting counter reflects the fee...
    const pool = simnet.callReadOnlyFn(C, "get-prize-pool-balance", [Cl.uint(1)], w(1)).result;
    expect(pool).toBeUint(10000);
    // ...and the STX actually landed in the contract principal (proves as-contract transfer).
    const after = simnet.getAssetsMap().get("STX")?.get(contractId) ?? 0n;
    expect(after - before).toBe(10000n);
  });

  it("rejects mint for unregistered game", () => {
    const r = simnet.callPublicFn(C, "mint-score",
      [Cl.uint(99), Cl.uint(10), Cl.stringAscii("x")], w(1)).result;
    expect(r).toBeErr(Cl.uint(110)); // ERR-NO-GAME
  });

  it("rejects mint for inactive game", () => {
    registerSnake();
    simnet.callPublicFn(C, "set-game-active", [Cl.uint(1), Cl.bool(false)], deployer);
    const r = simnet.callPublicFn(C, "mint-score",
      [Cl.uint(1), Cl.uint(10), Cl.stringAscii("x")], w(1)).result;
    expect(r).toBeErr(Cl.uint(112)); // ERR-GAME-INACTIVE
  });

  it("rejects score above MAX-SCORE", () => {
    registerSnake();
    const r = simnet.callPublicFn(C, "mint-score",
      [Cl.uint(1), Cl.uint(10000), Cl.stringAscii("x")], w(1)).result;
    expect(r).toBeErr(Cl.uint(104)); // ERR-SCORE-TOO-HIGH
  });
});
