import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveIsOwner, __resetOwnerCache } from "./owner";

const OWNER = "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";
const OTHER = "SP000000000000000000002Q6VF78";

beforeEach(() => __resetOwnerCache());

describe("resolveIsOwner", () => {
  it("returns false for a null address without querying the chain", async () => {
    const fetchOwner = vi.fn(async () => OWNER);
    expect(await resolveIsOwner(null, fetchOwner)).toBe(false);
    expect(fetchOwner).not.toHaveBeenCalled();
  });

  it("returns true when the address matches the on-chain owner", async () => {
    expect(await resolveIsOwner(OWNER, async () => OWNER)).toBe(true);
  });

  it("returns false when the address does not match the on-chain owner", async () => {
    expect(await resolveIsOwner(OTHER, async () => OWNER)).toBe(false);
  });

  it("fails safe to false when the owner read throws", async () => {
    expect(
      await resolveIsOwner(OWNER, async () => {
        throw new Error("network");
      }),
    ).toBe(false);
  });

  it("caches the owner so repeated checks hit the chain only once", async () => {
    const fetchOwner = vi.fn(async () => OWNER);
    await resolveIsOwner(OWNER, fetchOwner);
    await resolveIsOwner(OTHER, fetchOwner);
    await resolveIsOwner(OWNER, fetchOwner);
    expect(fetchOwner).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed read, allowing a later retry to succeed", async () => {
    const fetchOwner = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(OWNER);
    expect(await resolveIsOwner(OWNER, fetchOwner)).toBe(false);
    expect(await resolveIsOwner(OWNER, fetchOwner)).toBe(true);
    expect(fetchOwner).toHaveBeenCalledTimes(2);
  });
});
