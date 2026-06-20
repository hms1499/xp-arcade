import { describe, it, expect, vi, beforeEach } from "vitest";

const isConfigured = vi.hoisted(() => vi.fn());
const endSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/browserbase", () => ({ isConfigured, endSession }));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/browser/end", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  isConfigured.mockReset().mockReturnValue(true);
  endSession.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/browser/end", () => {
  it("400s when sessionId is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(endSession).not.toHaveBeenCalled();
  });

  it("releases the session and returns ok", async () => {
    const res = await POST(req({ sessionId: "s1" }));
    expect(res.status).toBe(200);
    expect(endSession).toHaveBeenCalledWith("s1");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("still returns ok when release throws (best-effort)", async () => {
    endSession.mockRejectedValue(new Error("already gone"));
    const res = await POST(req({ sessionId: "s1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns ok without calling endSession when unconfigured", async () => {
    isConfigured.mockReturnValue(false);
    const res = await POST(req({ sessionId: "s1" }));
    expect(res.status).toBe(200);
    expect(endSession).not.toHaveBeenCalled();
  });
});
