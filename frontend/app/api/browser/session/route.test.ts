import { describe, it, expect, vi, beforeEach } from "vitest";

const isConfigured = vi.hoisted(() => vi.fn());
const createSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/browserbase", () => ({ isConfigured, createSession }));

import { POST } from "./route";

beforeEach(() => {
  isConfigured.mockReset();
  createSession.mockReset();
});

describe("POST /api/browser/session", () => {
  it("503s when unconfigured", async () => {
    isConfigured.mockReturnValue(false);
    const res = await POST();
    expect(res.status).toBe(503);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("returns sessionId + liveViewUrl on success", async () => {
    isConfigured.mockReturnValue(true);
    createSession.mockResolvedValue({ sessionId: "s1", liveViewUrl: "https://live/s1" });
    const res = await POST();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ sessionId: "s1", liveViewUrl: "https://live/s1" });
  });

  it("502s when session creation throws", async () => {
    isConfigured.mockReturnValue(true);
    createSession.mockRejectedValue(new Error("plan does not allow keepAlive"));
    const res = await POST();
    expect(res.status).toBe(502);
  });
});
