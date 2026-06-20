import { describe, it, expect, vi, beforeEach } from "vitest";
import { _resetRateLimitForTests } from "@/lib/rate-limit";

const isConfigured = vi.hoisted(() => vi.fn());
const createSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/browserbase", () => ({ isConfigured, createSession }));

import { POST } from "./route";

function req(ip = "1.2.3.4") {
  return new Request("http://localhost/api/browser/session", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

beforeEach(() => {
  isConfigured.mockReset();
  createSession.mockReset();
  _resetRateLimitForTests();
});

describe("POST /api/browser/session", () => {
  it("503s when unconfigured", async () => {
    isConfigured.mockReturnValue(false);
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("returns sessionId + liveViewUrl on success", async () => {
    isConfigured.mockReturnValue(true);
    createSession.mockResolvedValue({ sessionId: "s1", liveViewUrl: "https://live/s1" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ sessionId: "s1", liveViewUrl: "https://live/s1" });
  });

  it("502s when session creation throws", async () => {
    isConfigured.mockReturnValue(true);
    createSession.mockRejectedValue(new Error("plan does not allow keepAlive"));
    const res = await POST(req());
    expect(res.status).toBe(502);
  });

  it("429s after too many sessions from one client", async () => {
    isConfigured.mockReturnValue(true);
    createSession.mockResolvedValue({ sessionId: "s1", liveViewUrl: "https://live/s1" });
    // 5 allowed within the window, the 6th is limited.
    for (let i = 0; i < 5; i++) {
      expect((await POST(req("9.9.9.9"))).status).toBe(200);
    }
    const res = await POST(req("9.9.9.9"));
    expect(res.status).toBe(429);
  });
});
