import { describe, expect, it } from "vitest";
import { expectedPrimaryContractId } from "@/lib/game-registry";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("reports the configured network and contract without caching", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      network: "mainnet",
      contractId: expectedPrimaryContractId(),
    });
  });
});
