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
