import { describe, it, expect } from "vitest";
import {
  humanizeContractError,
  humanizeTxStatus,
  isUserCancellation,
} from "./tx-errors";

describe("isUserCancellation", () => {
  it("recognises the wallet cancel reject from contract-calls", () => {
    // openContractCall onCancel rejects with new Error("cancelled")
    expect(isUserCancellation("cancelled")).toBe(true);
  });

  it("recognises common wallet rejection phrasings", () => {
    expect(isUserCancellation("User canceled the request")).toBe(true);
    expect(isUserCancellation("User rejected the request")).toBe(true);
  });

  it("does not treat a contract error as a cancellation", () => {
    expect(isUserCancellation("ContractError u104")).toBe(false);
  });
});

describe("humanizeContractError", () => {
  it("maps every on-chain error code to a human sentence", () => {
    expect(humanizeContractError("ClarityError: u101")).toMatch(/top-10/i);
    expect(humanizeContractError("ClarityError: u102")).toMatch(
      /already claimed/i,
    );
    expect(humanizeContractError("ClarityError: u103")).toMatch(/owner/i);
    expect(humanizeContractError("ClarityError: u104")).toMatch(/too high/i);
    expect(humanizeContractError("ClarityError: u105")).toMatch(
      /season hasn't ended/i,
    );
    expect(humanizeContractError("ClarityError: u106")).toMatch(/empty/i);
    expect(humanizeContractError("ClarityError: u107")).toMatch(
      /no prize record/i,
    );
    expect(humanizeContractError("ClarityError: u108")).toMatch(
      /mint limit reached/i,
    );
  });

  it("matches a bare code substring like the wallet returns", () => {
    expect(humanizeContractError("108")).toMatch(/mint limit/i);
  });

  it("does not mistake u104 inside u1048 for the score error", () => {
    // word-boundary matching: u1048 is not u104
    expect(humanizeContractError("ClarityError: u1048")).not.toMatch(
      /too high/i,
    );
  });

  it("falls back to a keyword match when no numeric code is present", () => {
    expect(humanizeContractError("runtime error: mint-limit reached")).toMatch(
      /mint limit/i,
    );
    expect(humanizeContractError("score-too-high")).toMatch(/too high/i);
  });

  it("translates a post-condition abort into plain language", () => {
    expect(humanizeContractError("abort_by_post_condition")).toMatch(
      /post-condition/i,
    );
  });

  it("returns the trimmed raw message when nothing is recognised", () => {
    expect(humanizeContractError("  weird unexpected failure  ")).toBe(
      "weird unexpected failure",
    );
  });
});

describe("humanizeTxStatus", () => {
  it("gives a friendly line for each tracked status", () => {
    expect(humanizeTxStatus("pending")).toMatch(/confirming/i);
    expect(humanizeTxStatus("success")).toMatch(/confirmed/i);
    expect(humanizeTxStatus("abort_by_response")).toMatch(/rejected/i);
    expect(humanizeTxStatus("abort_by_post_condition")).toMatch(
      /post-condition/i,
    );
    expect(humanizeTxStatus("failed")).toMatch(/failed/i);
    expect(humanizeTxStatus("timeout")).toMatch(/explorer/i);
  });
});
