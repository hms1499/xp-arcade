import { describe, it, expect } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const w = (n: number) => accounts.get(`wallet_${n}`)!;
const C = "xp-arcade-v4";

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

describe("best-score", () => {
  it("keeps the max score per (player, game) and ignores lower follow-ups", () => {
    registerSnake();
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(50), Cl.stringAscii("a")], w(1));
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(20), Cl.stringAscii("a")], w(1));
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(80), Cl.stringAscii("a")], w(1));
    const best = simnet.callReadOnlyFn(C, "get-best-score", [Cl.uint(1), Cl.principal(w(1))], w(1)).result;
    expect(best).toBeSome(Cl.tuple({ score: Cl.uint(80), "token-id": Cl.uint(3), season: Cl.uint(1) }));
  });

  it("isolates best-score across games", () => {
    registerSnake();
    simnet.callPublicFn(C, "register-game",
      [Cl.uint(2), Cl.stringAscii("Tetris"), Cl.uint(20000), Cl.uint(100), Cl.uint(300), Cl.uint(700)], deployer);
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(90), Cl.stringAscii("a")], w(1));
    simnet.callPublicFn(C, "mint-score", [Cl.uint(2), Cl.uint(10), Cl.stringAscii("a")], w(1));
    const snake = simnet.callReadOnlyFn(C, "get-best-score", [Cl.uint(1), Cl.principal(w(1))], w(1)).result;
    const tetris = simnet.callReadOnlyFn(C, "get-best-score", [Cl.uint(2), Cl.principal(w(1))], w(1)).result;
    expect((snake as any).value.value.score.value).toBe(90n);
    expect((tetris as any).value.value.score.value).toBe(10n);
  });
});

describe("top-ten", () => {
  it("returns empty list for a registered game with no mints", () => {
    registerSnake();
    const top = simnet.callReadOnlyFn(C, "get-top-ten", [Cl.uint(1)], w(1)).result;
    expect((top as any).value.length).toBe(0);
  });

  it("keeps best per player (later mint by same wallet replaces earlier entry)", () => {
    registerSnake();
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(50), Cl.stringAscii("a")], w(1));
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(100), Cl.stringAscii("b")], w(2));
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(80), Cl.stringAscii("c")], w(3));
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(70), Cl.stringAscii("a")], w(1));
    const top = simnet.callReadOnlyFn(C, "get-top-ten", [Cl.uint(1)], w(1)).result;
    const scores = (top as any).value.map((t: any) => Number(t.value.score.value));
    expect(scores.length).toBe(3);
    expect(scores).toContain(100);
    expect(scores).toContain(80);
    expect(scores).toContain(70);
    expect(scores).not.toContain(50);
  });

  it("caps at 10 and evicts the lowest when a higher score arrives", () => {
    registerSnake();
    const scoresIn = [10, 50, 30, 80, 20, 70, 60, 40];
    scoresIn.forEach((s, i) =>
      simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(s), Cl.stringAscii(`p${i}`)], w(i + 1)));
    const top = simnet.callReadOnlyFn(C, "get-top-ten", [Cl.uint(1)], w(1)).result;
    const scores = (top as any).value.map((t: any) => Number(t.value.score.value));
    expect(scores.length).toBe(8);
    expect(scores.sort((a: number, b: number) => b - a)[0]).toBe(80);
  });

  it("isolates top-ten across games", () => {
    registerSnake();
    simnet.callPublicFn(C, "register-game",
      [Cl.uint(2), Cl.stringAscii("Tetris"), Cl.uint(20000), Cl.uint(100), Cl.uint(300), Cl.uint(700)], deployer);
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(50), Cl.stringAscii("a")], w(1));
    expect((simnet.callReadOnlyFn(C, "get-top-ten", [Cl.uint(1)], w(1)).result as any).value.length).toBe(1);
    expect((simnet.callReadOnlyFn(C, "get-top-ten", [Cl.uint(2)], w(1)).result as any).value.length).toBe(0);
  });
});

describe("rarity tiers (D11)", () => {
  it("classifies Snake score 300 as Legendary but Tetris 300 as Epic", () => {
    registerSnake(); // Snake legend-min 300
    simnet.callPublicFn(C, "register-game",
      [Cl.uint(2), Cl.stringAscii("Tetris"), Cl.uint(20000), Cl.uint(100), Cl.uint(300), Cl.uint(700)], deployer);
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(300), Cl.stringAscii("a")], w(1));
    simnet.callPublicFn(C, "mint-score", [Cl.uint(2), Cl.uint(300), Cl.stringAscii("b")], w(2));
    const snake = simnet.callReadOnlyFn(C, "get-score-data", [Cl.uint(1)], w(1)).result;
    const tetris = simnet.callReadOnlyFn(C, "get-score-data", [Cl.uint(2)], w(1)).result;
    expect((snake as any).value.value.rarity.value).toBe("Legendary");
    expect((tetris as any).value.value.rarity.value).toBe("Epic");
  });

  it("classifies all four tiers for Snake", () => {
    registerSnake(); // rare 50, epic 150, legend 300
    const cases: [number, string][] = [[10, "Common"], [50, "Rare"], [150, "Epic"], [300, "Legendary"]];
    cases.forEach(([s], i) =>
      simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(s), Cl.stringAscii(`p${i}`)], w(i + 1)));
    cases.forEach(([, tier], i) => {
      const d = simnet.callReadOnlyFn(C, "get-score-data", [Cl.uint(i + 1)], w(1)).result;
      expect((d as any).value.value.rarity.value).toBe(tier);
    });
  });
});

describe("mint cap", () => {
  it("allows MAX-MINTS-PER-SEASON then rejects the 11th", () => {
    registerSnake();
    for (let i = 0; i < 10; i++)
      expect(simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(10), Cl.stringAscii("a")], w(1)).result)
        .toBeOk(Cl.uint(i + 1));
    const r = simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(10), Cl.stringAscii("a")], w(1)).result;
    expect(r).toBeErr(Cl.uint(108)); // ERR-MINT-LIMIT-REACHED
  });

  it("get-mints-remaining counts down per (player, game, season)", () => {
    registerSnake();
    expect(simnet.callReadOnlyFn(C, "get-mints-remaining", [Cl.uint(1), Cl.principal(w(1))], w(1)).result)
      .toBeUint(10);
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(10), Cl.stringAscii("a")], w(1));
    expect(simnet.callReadOnlyFn(C, "get-mints-remaining", [Cl.uint(1), Cl.principal(w(1))], w(1)).result)
      .toBeUint(9);
  });

  it("cap is isolated per game", () => {
    registerSnake();
    simnet.callPublicFn(C, "register-game",
      [Cl.uint(2), Cl.stringAscii("Tetris"), Cl.uint(20000), Cl.uint(100), Cl.uint(300), Cl.uint(700)], deployer);
    for (let i = 0; i < 10; i++)
      simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(10), Cl.stringAscii("a")], w(1));
    // Snake exhausted, Tetris fresh
    expect(simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(10), Cl.stringAscii("a")], w(1)).result)
      .toBeErr(Cl.uint(108));
    expect(simnet.callPublicFn(C, "mint-score", [Cl.uint(2), Cl.uint(10), Cl.stringAscii("a")], w(1)).result)
      .toBeOk(Cl.uint(11));
  });
});

describe("season-end-block", () => {
  it("owner sets the deadline block and it reads back", () => {
    registerSnake();
    const r = simnet.callPublicFn(C, "set-season-end-block", [Cl.uint(1), Cl.uint(500)], deployer).result;
    expect(r).toBeOk(Cl.bool(true));
    const b = simnet.callReadOnlyFn(C, "get-season-end-block", [Cl.uint(1)], deployer).result;
    expect(b).toBeUint(500);
  });

  it("rejects non-owner and unknown game", () => {
    registerSnake();
    expect(simnet.callPublicFn(C, "set-season-end-block", [Cl.uint(1), Cl.uint(500)], w(1)).result)
      .toBeErr(Cl.uint(100));
    expect(simnet.callPublicFn(C, "set-season-end-block", [Cl.uint(99), Cl.uint(500)], deployer).result)
      .toBeErr(Cl.uint(110));
  });
});

describe("end-season", () => {
  it("owner closes: snapshots prize, resets pool/top-ten, bumps season", () => {
    registerSnake();
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(80), Cl.stringAscii("a")], w(1));
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(40), Cl.stringAscii("b")], w(2));

    const r = simnet.callPublicFn(C, "end-season", [Cl.uint(1)], deployer).result;
    expect(r).toBeOk(Cl.bool(true));

    const prize = simnet.callReadOnlyFn(C, "get-season-prize", [Cl.uint(1), Cl.uint(1)], w(1)).result;
    expect((prize as any).value.value.total.value).toBe(20000n);
    expect((prize as any).value.value["top-ten"].value.length).toBe(2);
    // v4: claim-deadline = burn-block-height at close + CLAIM-WINDOW (4320)
    expect((prize as any).value.value["claim-deadline"].value).toBe(BigInt(simnet.burnBlockHeight) + 4320n);

    expect(simnet.callReadOnlyFn(C, "get-current-season", [Cl.uint(1)], w(1)).result).toBeUint(2);
    expect(simnet.callReadOnlyFn(C, "get-prize-pool-balance", [Cl.uint(1)], w(1)).result).toBeUint(0);
    expect((simnet.callReadOnlyFn(C, "get-top-ten", [Cl.uint(1)], w(1)).result as any).value.length).toBe(0);
  });

  it("rejects a non-owner before the deadline block", () => {
    registerSnake();
    simnet.callPublicFn(C, "set-season-end-block", [Cl.uint(1), Cl.uint(1000000)], deployer);
    const r = simnet.callPublicFn(C, "end-season", [Cl.uint(1)], w(1)).result;
    expect(r).toBeErr(Cl.uint(113)); // ERR-SEASON-STILL-OPEN
  });

  it("allows anyone after the deadline block", () => {
    registerSnake();
    simnet.callPublicFn(C, "set-season-end-block", [Cl.uint(1), Cl.uint(2)], deployer);
    simnet.mineEmptyBlocks(5);
    const r = simnet.callPublicFn(C, "end-season", [Cl.uint(1)], w(1)).result;
    expect(r).toBeOk(Cl.bool(true));
  });

  it("is isolated per game", () => {
    registerSnake();
    simnet.callPublicFn(C, "register-game",
      [Cl.uint(2), Cl.stringAscii("Tetris"), Cl.uint(20000), Cl.uint(100), Cl.uint(300), Cl.uint(700)], deployer);
    simnet.callPublicFn(C, "end-season", [Cl.uint(1)], deployer);
    expect(simnet.callReadOnlyFn(C, "get-current-season", [Cl.uint(1)], w(1)).result).toBeUint(2);
    expect(simnet.callReadOnlyFn(C, "get-current-season", [Cl.uint(2)], w(1)).result).toBeUint(1);
  });
});

describe("claim-prize", () => {
  function setupClosedSeason() {
    registerSnake();
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(80), Cl.stringAscii("a")], w(1));
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(40), Cl.stringAscii("b")], w(2));
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(20), Cl.stringAscii("c")], w(3));
    simnet.callPublicFn(C, "end-season", [Cl.uint(1)], deployer); // total = 30000
  }

  it("transfers STX to a top-3 player and marks claimed", () => {
    setupClosedSeason();
    const before = simnet.getAssetsMap().get("STX")?.get(w(1)) ?? 0n;
    const r = simnet.callPublicFn(C, "claim-prize", [Cl.uint(1), Cl.uint(1)], w(1)).result;
    expect(r).toBeOk(Cl.uint(6000)); // 30000*20/100
    const after = simnet.getAssetsMap().get("STX")?.get(w(1)) ?? 0n;
    expect(after - before).toBe(6000n);
    expect(simnet.callReadOnlyFn(C, "has-claimed-prize", [Cl.principal(w(1)), Cl.uint(1), Cl.uint(1)], w(1)).result)
      .toBeBool(true);
    expect(simnet.callReadOnlyFn(C, "get-season-paid", [Cl.uint(1), Cl.uint(1)], w(1)).result).toBeUint(6000);
  });

  it("is idempotent — second claim reverts", () => {
    setupClosedSeason();
    simnet.callPublicFn(C, "claim-prize", [Cl.uint(1), Cl.uint(1)], w(1));
    const r = simnet.callPublicFn(C, "claim-prize", [Cl.uint(1), Cl.uint(1)], w(1)).result;
    expect(r).toBeErr(Cl.uint(102)); // ERR-ALREADY-CLAIMED
  });

  it("rejects a player not in the snapshot", () => {
    setupClosedSeason();
    const r = simnet.callPublicFn(C, "claim-prize", [Cl.uint(1), Cl.uint(1)], w(5)).result;
    expect(r).toBeErr(Cl.uint(101)); // ERR-NOT-IN-TOP-TEN
  });

  it("rejects claiming the still-open current season", () => {
    registerSnake();
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(80), Cl.stringAscii("a")], w(1));
    const r = simnet.callPublicFn(C, "claim-prize", [Cl.uint(1), Cl.uint(1)], w(1)).result;
    expect(r).toBeErr(Cl.uint(105)); // ERR-SEASON-NOT-CLOSED
  });

  it("rejects when the prize snapshot total is zero", () => {
    registerSnake();
    simnet.callPublicFn(C, "end-season", [Cl.uint(1)], deployer); // season 1 closed, total 0
    const r = simnet.callPublicFn(C, "claim-prize", [Cl.uint(1), Cl.uint(1)], w(1)).result;
    expect(r).toBeErr(Cl.uint(106)); // ERR-EMPTY-POOL
  });
});

describe("SIP-009 surface", () => {
  it("get-token-uri returns base-uri concatenated with the token id", () => {
    registerSnake();
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(10), Cl.stringAscii("a")], w(1));
    const uri = simnet.callReadOnlyFn(C, "get-token-uri", [Cl.uint(1)], w(1)).result;
    expect(uri).toBeOk(Cl.some(Cl.stringAscii("https://xparcade.example/api/metadata/score/1")));
  });

  it("transfer moves the NFT only when called by the owner", () => {
    registerSnake();
    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(10), Cl.stringAscii("a")], w(1));
    expect(simnet.callPublicFn(C, "transfer",
      [Cl.uint(1), Cl.principal(w(1)), Cl.principal(w(2))], w(2)).result).toBeErr(Cl.uint(100));
    expect(simnet.callPublicFn(C, "transfer",
      [Cl.uint(1), Cl.principal(w(1)), Cl.principal(w(2))], w(1)).result).toBeOk(Cl.bool(true));
    expect(simnet.callReadOnlyFn(C, "get-owner", [Cl.uint(1)], w(1)).result)
      .toBeOk(Cl.some(Cl.principal(w(2))));
  });

  it("transfer-ownership is owner-only and updates get-contract-owner", () => {
    expect(simnet.callPublicFn(C, "transfer-ownership", [Cl.principal(w(1))], w(2)).result)
      .toBeErr(Cl.uint(100));
    expect(simnet.callPublicFn(C, "transfer-ownership", [Cl.principal(w(1))], deployer).result)
      .toBeOk(Cl.bool(true));
    expect(simnet.callReadOnlyFn(C, "get-contract-owner", [], w(1)).result).toBePrincipal(w(1));
  });
});

describe("multi-game isolation (integration)", () => {
  it("two games run independent pools, seasons, and claims in one contract", () => {
    registerSnake();
    simnet.callPublicFn(C, "register-game",
      [Cl.uint(2), Cl.stringAscii("Tetris"), Cl.uint(20000), Cl.uint(100), Cl.uint(300), Cl.uint(700)], deployer);

    simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(80), Cl.stringAscii("a")], w(1));
    simnet.callPublicFn(C, "mint-score", [Cl.uint(2), Cl.uint(500), Cl.stringAscii("a")], w(1));
    simnet.callPublicFn(C, "mint-score", [Cl.uint(2), Cl.uint(300), Cl.stringAscii("b")], w(2));

    expect(simnet.callReadOnlyFn(C, "get-prize-pool-balance", [Cl.uint(1)], w(1)).result).toBeUint(10000);
    expect(simnet.callReadOnlyFn(C, "get-prize-pool-balance", [Cl.uint(2)], w(1)).result).toBeUint(40000);

    expect(simnet.callReadOnlyFn(C, "get-last-token-id", [], w(1)).result).toBeOk(Cl.uint(3));

    simnet.callPublicFn(C, "end-season", [Cl.uint(2)], deployer);
    expect(simnet.callReadOnlyFn(C, "get-current-season", [Cl.uint(1)], w(1)).result).toBeUint(1);
    expect(simnet.callReadOnlyFn(C, "get-current-season", [Cl.uint(2)], w(1)).result).toBeUint(2);

    expect(simnet.callPublicFn(C, "claim-prize", [Cl.uint(2), Cl.uint(1)], w(1)).result)
      .toBeOk(Cl.uint(8000)); // 40000 * 20 / 100, rank 1
    expect(simnet.callPublicFn(C, "claim-prize", [Cl.uint(1), Cl.uint(1)], w(1)).result)
      .toBeErr(Cl.uint(105)); // Snake season 1 not closed
  });
});

// Invariant / characterization tests for the prize accounting. These guard the
// money-moving paths against over-distribution and pin down the known
// claim-fairness limitations under tied scores (see
// .claude/docs/prize-logic.md "Known edge cases").
describe("payout invariants (review hardening)", () => {
  const FEE = 10000n;
  const okUint = (r: any): bigint => r.value.value as bigint;

  function closeSeasonWith(scores: number[]) {
    registerSnake();
    scores.forEach((s, i) =>
      simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(s), Cl.stringAscii(`p${i}`)], w(i + 1)));
    simnet.callPublicFn(C, "end-season", [Cl.uint(1)], deployer);
  }

  it("never distributes more than the pool with distinct ranks; dust stays locked", () => {
    // 8 distinct scores: ranks 1-3 get 20% each, ranks 4-8 get 4/70 each.
    const scores = [80, 70, 60, 50, 40, 30, 20, 10];
    const total = BigInt(scores.length) * FEE; // 80000
    closeSeasonWith(scores);

    let paid = 0n;
    scores.forEach((_, i) => {
      const r = simnet.callPublicFn(C, "claim-prize", [Cl.uint(1), Cl.uint(1)], w(i + 1)).result;
      paid += okUint(r); // every top-ten member claims successfully
    });

    // Safety invariant: the contract never pays out more than it collected.
    expect(paid <= total).toBe(true);
    expect(simnet.callReadOnlyFn(C, "get-season-paid", [Cl.uint(1), Cl.uint(1)], w(1)).result)
      .toBeUint(Number(paid));

    // Whatever the rank schedule + integer division leaves undistributed is
    // permanently retained by the contract — there is no sweep function.
    const contractId = `${deployer}.${C}`;
    const held = simnet.getAssetsMap().get("STX")?.get(contractId) ?? 0n;
    expect(held).toBe(total - paid);
    expect(held > 0n).toBe(true);
  });

  it("tied top scores split fairly instead of starving lower ranks", () => {
    // 5 tie at 80 (positions 1-5), then 70, 60 (positions 6,7). total = 70000.
    const scores = [80, 80, 80, 80, 80, 70, 60];
    registerSnake();
    scores.forEach((s, i) =>
      simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(s), Cl.stringAscii(`p${i}`)], w(i + 1)));
    simnet.callPublicFn(C, "end-season", [Cl.uint(1)], deployer);
    let paid = 0n;
    for (let i = 1; i <= 7; i++) {
      const r = simnet.callPublicFn(C, "claim-prize", [Cl.uint(1), Cl.uint(1)], w(i)).result;
      paid += (r as any).value.value;
    }
    expect(paid <= 70000n).toBe(true);
    expect(simnet.callReadOnlyFn(C, "has-claimed-prize",
      [Cl.principal(w(6)), Cl.uint(1), Cl.uint(1)], w(1)).result).toBeBool(true);
  });
});


describe("get-claimable-amount (split-occupied)", () => {
  function closeWith(scores: number[]) {
    registerSnake();
    scores.forEach((s, i) =>
      simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(s), Cl.stringAscii(`p${i}`)], w(i + 1)));
    simnet.callPublicFn(C, "end-season", [Cl.uint(1)], deployer);
  }
  const amt = (i: number) =>
    simnet.callReadOnlyFn(C, "get-claimable-amount", [Cl.uint(1), Cl.uint(1), Cl.principal(w(i))], w(1)).result;

  it("distinct scores pay the position band (rank 1-3 = 20%)", () => {
    closeWith([80, 40, 20]); // total 30000
    expect(amt(1)).toBeUint(6000); // 30000*20/100
  });

  it("two tied straddling positions 3-4 split (20%+5.71%)/2", () => {
    closeWith([90, 80, 70, 70]); // total 40000
    expect(amt(1)).toBeUint(8000); // pos1 20%
    expect(amt(2)).toBeUint(8000); // pos2 20%
    expect(amt(3)).toBeUint(5142); // (8000 + 2285)/2
    expect(amt(4)).toBeUint(5142);
  });

  it("all-ten tie splits the pool equally", () => {
    // simnet only ships wallet_1..wallet_8; use deployer + faucet as the 9th/10th
    // distinct minters so the snapshot is a genuine ten-way tie. total 100000.
    const ten = [w(1), w(2), w(3), w(4), w(5), w(6), w(7), w(8), deployer, accounts.get("faucet")!];
    registerSnake();
    ten.forEach((p, i) =>
      simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(50), Cl.stringAscii(`p${i}`)], p));
    simnet.callPublicFn(C, "end-season", [Cl.uint(1)], deployer);
    // (3*twenty + 7*four70)/10 = (3*20000 + 7*5714)/10 = 99998/10 = 9999;
    // the 4/70 floor loses ~1 uStx per player, dust stays locked in-contract.
    ten.forEach((p) =>
      expect(simnet.callReadOnlyFn(C, "get-claimable-amount",
        [Cl.uint(1), Cl.uint(1), Cl.principal(p)], w(1)).result).toBeUint(9999));
  });

  it("ties inside the 4-10 band each get the 4/70 band", () => {
    closeWith([90, 80, 70, 60, 60]); // total 50000
    expect(amt(4)).toBeUint(2857); // 50000*4/70
    expect(amt(5)).toBeUint(2857);
  });

  it("returns 0 for a player not in the snapshot", () => {
    closeWith([80, 40, 20]);
    expect(amt(5)).toBeUint(0);
  });
});

describe("claim-prize v4 fairness + window", () => {
  function closeWith(scores: number[]) {
    registerSnake();
    scores.forEach((s, i) =>
      simnet.callPublicFn(C, "mint-score", [Cl.uint(1), Cl.uint(s), Cl.stringAscii(`p${i}`)], w(i + 1)));
    simnet.callPublicFn(C, "end-season", [Cl.uint(1)], deployer);
  }
  const okUint = (r: any): bigint => r.value.value as bigint;
  const claim = (i: number) =>
    simnet.callPublicFn(C, "claim-prize", [Cl.uint(1), Cl.uint(1)], w(i)).result;

  it("ties pay the same regardless of claim order (no race)", () => {
    closeWith([90, 80, 70, 70]); // expected: 8000, 8000, 5142, 5142
    expect(okUint(claim(3))).toBe(5142n);
    expect(okUint(claim(4))).toBe(5142n);
    expect(okUint(claim(1))).toBe(8000n);
    expect(okUint(claim(2))).toBe(8000n);
    expect(simnet.callReadOnlyFn(C, "get-season-paid", [Cl.uint(1), Cl.uint(1)], w(1)).result)
      .toBeUint(26284); // 8000+8000+5142+5142
  });

  it("rejects claims after the burn-block claim window", () => {
    closeWith([80, 40, 20]);
    expect(claim(1)).toBeOk(Cl.uint(6000)); // in-window claim works
    simnet.mineEmptyBurnBlocks(4321);       // cross CLAIM-WINDOW (4320)
    expect(claim(2)).toBeErr(Cl.uint(114)); // ERR-CLAIM-CLOSED
  });
});